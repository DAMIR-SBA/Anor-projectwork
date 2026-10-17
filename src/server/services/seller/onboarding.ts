import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { encrypt, decrypt, randomToken } from "@/server/security/crypto";
import { isOwnStorageUrl } from "@/server/storage";
import { REGIONS } from "@/lib/delivery";
import { assertSellerSignupOpen } from "@/server/services/platform";
import { maskAccount, requiredDocuments, slugify, validateBankAccount, validateMfo, validateTaxId, type LegalType } from "@/lib/seller";

/** The shop being set up: the newest one that is not approved yet. */
export async function onboardingShop(userId: string) {
  return db.shop.findFirst({ where: { ownerId: userId, status: { in: ["DRAFT", "PENDING", "REJECTED"] } }, include: { documents: true, warehouses: true }, orderBy: { createdAt: "desc" } });
}

export type OnboardingView = NonNullable<Awaited<ReturnType<typeof onboardingView>>>;

/** Serializable wizard state (bank account masked, never sent back in clear). */
export async function onboardingView(userId: string) {
  const s = await onboardingShop(userId);
  if (!s) return null;
  const wh = s.warehouses[0];
  return {
    id: s.id,
    status: s.status,
    moderationNote: s.moderationNote,
    legalType: s.legalType,
    legalName: s.legalName ?? "",
    taxId: s.taxId ?? "",
    name: s.name.startsWith("draft-") ? "" : s.name,
    slug: s.slug.startsWith("draft-") ? "" : s.slug,
    descriptionUz: s.descriptionUz ?? "",
    descriptionRu: s.descriptionRu ?? "",
    city: s.city ?? "",
    region: wh?.region ?? "toshkent_sh",
    address: wh?.address ?? "",
    logoUrl: s.logoUrl,
    bankName: s.bankName ?? "",
    bankAccountMasked: s.bankAccount ? maskAccount(decrypt(s.bankAccount)) : null,
    bankMfo: s.bankMfo ?? "",
    documents: s.documents.map((d) => ({ id: d.id, type: d.type, fileName: d.fileName, status: d.status, note: d.note })),
  };
}

async function ensureDraft(userId: string) {
  const existing = await onboardingShop(userId);
  if (existing) {
    if (existing.status === "PENDING") throw new AppError("onboardingLocked");
    return existing;
  }
  // Closing sign-ups stops new shops only; applications already started can finish.
  await assertSellerSignupOpen();
  const slug = `draft-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  return db.shop.create({ data: { ownerId: userId, slug, name: slug, status: "DRAFT" }, include: { documents: true, warehouses: true } });
}

export async function saveLegal(userId: string, input: { legalType: LegalType; legalName: string; taxId: string }) {
  if (!validateTaxId(input.legalType, input.taxId)) throw new AppError("taxIdInvalid", undefined, "taxId");
  const shop = await ensureDraft(userId);
  const taken = await db.shop.findFirst({ where: { taxId: input.taxId.replace(/\s/g, ""), NOT: { id: shop.id }, status: { not: "REJECTED" } } });
  if (taken) throw new AppError("taxIdTaken", undefined, "taxId");
  await db.shop.update({ where: { id: shop.id }, data: { legalType: input.legalType, legalName: input.legalName.trim(), taxId: input.taxId.replace(/\s/g, "") } });
}

export async function saveProfile(userId: string, input: { name: string; slug?: string; descriptionUz: string; descriptionRu: string; region: string; city: string; address: string; logoUrl?: string | null }) {
  const shop = await ensureDraft(userId);
  const slug = slugify(input.slug || input.name);
  if (slug.length < 3) throw new AppError("slugInvalid", undefined, "slug");
  const dup = await db.shop.findFirst({ where: { slug, NOT: { id: shop.id } } });
  if (dup) throw new AppError("slugTaken", undefined, "slug");
  const region = REGIONS.some((r) => r.key === input.region) ? input.region : "toshkent_sh";
  const logo = input.logoUrl && isOwnStorageUrl(input.logoUrl) ? input.logoUrl : shop.logoUrl;
  await db.shop.update({ where: { id: shop.id }, data: { name: input.name.trim(), slug, descriptionUz: input.descriptionUz.trim() || null, descriptionRu: input.descriptionRu.trim() || null, city: input.city.trim(), logoUrl: logo } });
  // The seller's own warehouse (FBS/DBS pick-ups start here).
  const wh = await db.warehouse.findFirst({ where: { shopId: shop.id } });
  const data = { name: `${input.name.trim()} — ombor`, region, city: input.city.trim(), address: input.address.trim() };
  if (wh) await db.warehouse.update({ where: { id: wh.id }, data });
  else await db.warehouse.create({ data: { ...data, code: `S-${slug.toUpperCase().slice(0, 20)}-${randomToken(3).toUpperCase().replace(/[^A-Z0-9]/g, "")}`, type: "SELLER", shopId: shop.id } });
}

export async function saveBank(userId: string, input: { bankName: string; bankAccount?: string; bankMfo: string }) {
  const shop = await ensureDraft(userId);
  if (input.bankAccount && !validateBankAccount(input.bankAccount)) throw new AppError("bankAccountInvalid", undefined, "bankAccount");
  if (!input.bankAccount && !shop.bankAccount) throw new AppError("bankAccountInvalid", undefined, "bankAccount");
  if (!validateMfo(input.bankMfo)) throw new AppError("mfoInvalid", undefined, "bankMfo");
  await db.shop.update({ where: { id: shop.id }, data: { bankName: input.bankName.trim(), bankMfo: input.bankMfo.replace(/\s/g, ""), ...(input.bankAccount ? { bankAccount: encrypt(input.bankAccount.replace(/\s/g, "")) } : {}) } });
}

export async function addDocument(userId: string, input: { type: string; fileUrl: string; fileName: string }) {
  const shop = await ensureDraft(userId);
  if (!isOwnStorageUrl(input.fileUrl) || !input.fileUrl.includes("/documents/")) throw new AppError("fileType");
  await db.shopDocument.deleteMany({ where: { shopId: shop.id, type: input.type, status: { not: "APPROVED" } } });
  await db.shopDocument.create({ data: { shopId: shop.id, type: input.type, fileUrl: input.fileUrl, fileName: input.fileName.slice(0, 200) } });
}

export async function removeDocument(userId: string, documentId: string) {
  const shop = await ensureDraft(userId);
  await db.shopDocument.deleteMany({ where: { id: documentId, shopId: shop.id, status: { not: "APPROVED" } } });
}

/** All steps complete → PENDING for marketplace moderation (KYC level 1: documents submitted). */
export async function submitOnboarding(userId: string) {
  const s = await onboardingShop(userId);
  if (!s || s.status === "PENDING") throw new AppError("onboardingLocked");
  const missing: string[] = [];
  if (!s.legalType || !s.taxId || !s.legalName) missing.push("legal");
  if (s.name.startsWith("draft-") || !s.city || !s.warehouses.length) missing.push("shop");
  if (!s.bankAccount || !s.bankMfo || !s.bankName) missing.push("bank");
  if (s.legalType && requiredDocuments(s.legalType).some((t) => !s.documents.some((d) => d.type === t))) missing.push("documents");
  if (missing.length) throw new AppError("onboardingIncomplete", { steps: missing.join(", ") });
  await db.shop.update({ where: { id: s.id }, data: { status: "PENDING", kycLevel: 1, moderationNote: null } });
  await audit({ actorId: userId, actorKind: "seller", action: "shop.submitted", entityType: "Shop", entityId: s.id });
  return s.id;
}

/** DEMO_MODE only: approve the shop as a moderator would (KYC level 2). */
export async function demoApprove(userId: string) {
  const s = await onboardingShop(userId);
  if (!s || s.status !== "PENDING") throw new AppError("invalidTransition");
  await db.$transaction([
    db.shop.update({ where: { id: s.id }, data: { status: "APPROVED", kycLevel: 2, approvedAt: new Date() } }),
    db.shopDocument.updateMany({ where: { shopId: s.id }, data: { status: "APPROVED" } }),
  ]);
  await audit({ actorId: userId, actorKind: "system", action: "shop.demo_approved", entityType: "Shop", entityId: s.id });
  return s.id;
}
