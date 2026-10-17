import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { decrypt, encrypt, randomToken, verifySecret } from "@/server/security/crypto";
import { rateLimit } from "@/server/security/rate-limit";
import { isOwnStorageUrl } from "@/server/storage";
import { BANK_CHANGE_HOLD_HOURS } from "./finance";
import { REGIONS } from "@/lib/delivery";
import { maskAccount, requiredDocuments, validateBankAccount, validateMfo } from "@/lib/seller";

type Actor = { userId: string; login: string };

export async function settingsView(shopId: string) {
  const s = await db.shop.findUniqueOrThrow({ where: { id: shopId }, include: { documents: { orderBy: { createdAt: "desc" } }, warehouses: { where: { type: "SELLER" }, orderBy: { createdAt: "asc" } }, owner: { select: { passwordHash: true, pinHash: true } } } });
  const required = s.legalType ? requiredDocuments(s.legalType) : [];
  return {
    id: s.id,
    status: s.status,
    name: s.name,
    slug: s.slug,
    descriptionUz: s.descriptionUz ?? "",
    descriptionRu: s.descriptionRu ?? "",
    city: s.city ?? "",
    logoUrl: s.logoUrl,
    bannerUrl: s.bannerUrl,
    legalType: s.legalType,
    legalName: s.legalName,
    taxId: s.taxId,
    bankName: s.bankName ?? "",
    bankAccountMasked: s.bankAccount ? maskAccount(decrypt(s.bankAccount)) : null,
    bankMfo: s.bankMfo ?? "",
    kycLevel: s.kycLevel,
    telegramLinked: !!s.telegramChatId,
    approvedAt: s.approvedAt?.toISOString() ?? null,
    confirmWith: s.owner.passwordHash ? ("password" as const) : s.owner.pinHash ? ("pin" as const) : null,
    documents: s.documents.map((d) => ({ id: d.id, type: d.type, fileName: d.fileName, fileUrl: d.fileUrl, status: d.status, note: d.note, createdAt: d.createdAt.toISOString(), required: required.includes(d.type) })),
    missingDocuments: required.filter((t) => !s.documents.some((d) => d.type === t && d.status !== "REJECTED")),
    warehouses: s.warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name, region: w.region, city: w.city, address: w.address, isActive: w.isActive })),
  };
}

/** Storefront profile. The slug is fixed after approval (it is in every product URL). */
export async function updateProfile(shopId: string, actor: Actor, input: { name: string; descriptionUz: string; descriptionRu: string; city: string; logoUrl?: string | null; bannerUrl?: string | null }) {
  const s = await db.shop.findUniqueOrThrow({ where: { id: shopId } });
  const media = (url: string | null | undefined, current: string | null) => (url === null ? null : url && isOwnStorageUrl(url) ? url : current);
  const data = { name: input.name.trim(), descriptionUz: input.descriptionUz.trim() || null, descriptionRu: input.descriptionRu.trim() || null, city: input.city.trim() || null, logoUrl: media(input.logoUrl, s.logoUrl), bannerUrl: media(input.bannerUrl, s.bannerUrl) };
  await db.shop.update({ where: { id: shopId }, data });
  if (data.name !== s.name) await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: "shop.renamed", entityType: "Shop", entityId: shopId, before: { name: s.name }, after: { name: data.name } });
}

async function confirmIdentity(userId: string, secret: string) {
  const rl = await rateLimit(`seller-confirm:${userId}`, 5, 900);
  if (!rl.success) throw new AppError("rateLimited");
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true, pinHash: true } });
  const hash = u.passwordHash ?? u.pinHash;
  // Accounts without a password or PIN (e.g. Telegram-only) confirm via the owner notification instead.
  if (hash && !(await verifySecret(hash, secret))) throw new AppError("invalidPassword", undefined, "confirm");
}

/**
 * Payout account change: re-authentication, owner alert on every channel, and a 48-hour payout hold
 * so a hijacked session cannot redirect the next transfer.
 */
export async function updateBank(shopId: string, actor: Actor, input: { bankName: string; bankAccount?: string; bankMfo: string; confirm: string }) {
  await confirmIdentity(actor.userId, input.confirm);
  if (input.bankAccount && !validateBankAccount(input.bankAccount)) throw new AppError("bankAccountInvalid", undefined, "bankAccount");
  if (!validateMfo(input.bankMfo)) throw new AppError("mfoInvalid", undefined, "bankMfo");
  const s = await db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { bankAccount: true, ownerId: true } });
  const account = input.bankAccount?.replace(/\s/g, "");
  await db.shop.update({ where: { id: shopId }, data: { bankName: input.bankName.trim(), bankMfo: input.bankMfo.replace(/\s/g, ""), ...(account ? { bankAccount: encrypt(account) } : {}) } });
  if (account && account !== (s.bankAccount ? decrypt(s.bankAccount) : null)) {
    await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: "shop.bank_changed", entityType: "Shop", entityId: shopId, after: { account: maskAccount(account) } });
    await notify({ userId: s.ownerId, type: "seller.bank_changed", title: "To‘lov hisobi o‘zgartirildi", body: `Yangi hisob ${maskAccount(account)}. To‘lovlar ${BANK_CHANGE_HOLD_HOURS} soat ushlab turiladi. Agar bu siz bo‘lmasangiz, darhol qo‘llab-quvvatlashga yozing.`, href: "/seller/settings", channels: ["sms", "telegram", "email"] });
  }
}

export async function addShopDocument(shopId: string, input: { type: string; fileUrl: string; fileName: string }) {
  if (!isOwnStorageUrl(input.fileUrl) || !input.fileUrl.includes("/documents/")) throw new AppError("fileType");
  await db.shopDocument.deleteMany({ where: { shopId, type: input.type, status: { not: "APPROVED" } } });
  await db.shopDocument.create({ data: { shopId, type: input.type, fileUrl: input.fileUrl, fileName: input.fileName.slice(0, 200) } });
}

export async function saveWarehouse(shopId: string, input: { id?: string; name: string; region: string; city: string; address: string; isActive: boolean }) {
  const region = REGIONS.some((r) => r.key === input.region) ? input.region : "toshkent_sh";
  const data = { name: input.name.trim(), region, city: input.city.trim(), address: input.address.trim(), isActive: input.isActive };
  if (input.id) {
    const wh = await db.warehouse.findFirst({ where: { id: input.id, shopId, type: "SELLER" } });
    if (!wh) throw new AppError("notFound");
    // Keep at least one active seller warehouse: FBS/DBS orders ship from it.
    if (!input.isActive && (await db.warehouse.count({ where: { shopId, type: "SELLER", isActive: true, NOT: { id: wh.id } } })) === 0) throw new AppError("lastWarehouse");
    return db.warehouse.update({ where: { id: wh.id }, data });
  }
  if ((await db.warehouse.count({ where: { shopId, type: "SELLER" } })) >= 10) throw new AppError("limitReached", { max: 10 });
  return db.warehouse.create({ data: { ...data, type: "SELLER", shopId, code: `S-${randomToken(5).toUpperCase().replace(/[^A-Z0-9]/g, "")}` } });
}
