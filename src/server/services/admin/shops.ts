import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { decrypt } from "@/server/security/crypto";
import { measureShop } from "@/server/services/shop-metrics";
import { maskAccount, requiredDocuments } from "@/lib/seller";
import type { Prisma } from "@/generated/prisma/client";
import type { ShopStatus } from "@/generated/prisma/enums";

export type Staff = { userId: string; login: string };

export const SHOP_TABS = ["pending", "approved", "restricted", "suspended", "rejected", "all"] as const;
export type ShopTab = (typeof SHOP_TABS)[number];

const TAB_WHERE: Record<ShopTab, Prisma.ShopWhereInput> = {
  pending: { status: "PENDING" },
  approved: { status: "APPROVED" },
  restricted: { status: "APPROVED", restrictedAt: { not: null } },
  suspended: { status: "SUSPENDED" },
  rejected: { status: "REJECTED" },
  all: { status: { not: "DRAFT" } },
};

export async function listShops(tab: ShopTab, opts: { q?: string; page: number }, pageSize = 25) {
  const q = opts.q?.trim();
  const where: Prisma.ShopWhereInput = { ...TAB_WHERE[tab], ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q.toLowerCase() } }, { taxId: q }, { owner: { login: { contains: q, mode: "insensitive" } } }] } : {}) };
  const [rows, total, counts] = await Promise.all([
    db.shop.findMany({ where, orderBy: tab === "pending" ? { updatedAt: "asc" } : { createdAt: "desc" }, skip: (opts.page - 1) * pageSize, take: pageSize, include: { owner: { select: { login: true, name: true, phone: true } }, _count: { select: { products: true, documents: true } } } }),
    db.shop.count({ where }),
    Promise.all(SHOP_TABS.map((t) => db.shop.count({ where: TAB_WHERE[t] }))),
  ]);
  return {
    total,
    counts: Object.fromEntries(SHOP_TABS.map((t, i) => [t, counts[i]])) as Record<ShopTab, number>,
    rows: rows.map((s) => ({ id: s.id, name: s.name, slug: s.slug, logoUrl: s.logoUrl, status: s.status, tier: s.tier, legalType: s.legalType, taxId: s.taxId, city: s.city, kycLevel: s.kycLevel, score: s.fulfillmentScore, rating: s.rating, restricted: !!s.restrictedAt, isOfficial: s.isOfficial, owner: s.owner, products: s._count.products, documents: s._count.documents, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() })),
  };
}

export async function shopDetail(id: string) {
  const s = await db.shop.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, login: true, name: true, phone: true, email: true, createdAt: true, status: true } },
      documents: { orderBy: { createdAt: "desc" } },
      warehouses: true,
      warnings: { orderBy: { createdAt: "desc" }, take: 10 },
      penalties: { orderBy: { createdAt: "desc" }, take: 10, include: { order: { select: { number: true } } } },
    },
  });
  if (!s) return null;
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [m, byStatus, gmv, audits, flags] = await Promise.all([
    measureShop(id),
    db.product.groupBy({ by: ["status"], where: { shopId: id, deletedAt: null }, _count: { _all: true } }),
    db.order.aggregate({ _sum: { total: true }, _count: { _all: true }, where: { shopId: id, status: "DELIVERED", deliveredAt: { gte: since } } }),
    db.auditLog.findMany({ where: { entityType: "Shop", entityId: id }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.fraudFlag.findMany({ where: { shopId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const required = s.legalType ? requiredDocuments(s.legalType) : [];
  return {
    ...s,
    bankAccount: s.bankAccount ? maskAccount(decrypt(s.bankAccount)) : null,
    required,
    metrics: m,
    products: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Record<string, number>,
    gmv90: gmv._sum.total ?? 0,
    orders90: gmv._count._all,
    audits: audits.map((a) => ({ id: a.id, action: a.action, actorLogin: a.actorLogin, createdAt: a.createdAt.toISOString(), meta: a.meta, after: a.after })),
    flags,
  };
}

async function setStatus(id: string, staff: Staff, to: ShopStatus, data: Prisma.ShopUpdateInput, auditAction: string, reason?: string) {
  const s = await db.shop.findUnique({ where: { id } });
  if (!s) throw new AppError("notFound");
  await db.shop.update({ where: { id }, data: { status: to, ...data } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: auditAction, entityType: "Shop", entityId: id, before: { status: s.status }, after: { status: to }, meta: reason ? { reason } : undefined });
  return s;
}

export async function approveShop(id: string, staff: Staff) {
  const s = await db.shop.findUnique({ where: { id }, include: { documents: true } });
  if (!s || !["PENDING", "REJECTED"].includes(s.status)) throw new AppError("invalidTransition");
  const required = s.legalType ? requiredDocuments(s.legalType) : [];
  // Every required document must exist and not be rejected.
  if (required.some((t) => !s.documents.some((d) => d.type === t && d.status !== "REJECTED"))) throw new AppError("documentsMissing");
  await db.shopDocument.updateMany({ where: { shopId: id, status: "PENDING" }, data: { status: "APPROVED" } });
  await setStatus(id, staff, "APPROVED", { kycLevel: Math.max(2, s.kycLevel), approvedAt: s.approvedAt ?? new Date(), moderationNote: null }, "shop.approved");
  await notify({ userId: s.ownerId, type: "seller.approved", title: "Do‘kon tasdiqlandi", body: `«${s.name}» endi sotuvda. Mahsulot qo‘shing va buyurtmalarni qabul qiling.`, href: "/seller", channels: ["sms", "telegram", "email"] });
}

export async function rejectShop(id: string, staff: Staff, reason: string) {
  const s = await db.shop.findUnique({ where: { id } });
  if (!s || s.status !== "PENDING") throw new AppError("invalidTransition");
  await setStatus(id, staff, "REJECTED", { moderationNote: reason }, "shop.rejected", reason);
  await notify({ userId: s.ownerId, type: "seller.rejected", title: "Ariza rad etildi", body: reason, href: "/seller/onboarding", channels: ["sms", "telegram", "email"] });
}

/** Suspension hides the storefront and products, stops ads; open orders still have to be fulfilled. */
export async function suspendShop(id: string, staff: Staff, reason: string) {
  const s = await db.shop.findUnique({ where: { id } });
  if (!s || s.status !== "APPROVED") throw new AppError("invalidTransition");
  await setStatus(id, staff, "SUSPENDED", { moderationNote: reason }, "shop.suspended", reason);
  await db.adCampaign.updateMany({ where: { shopId: id, status: "ACTIVE" }, data: { status: "PAUSED" } });
  await db.shopWarning.create({ data: { shopId: id, type: "SUSPENDED", message: reason } });
  await notify({ userId: s.ownerId, type: "seller.suspended", title: "Do‘kon to‘xtatildi", body: reason, href: "/seller", channels: ["sms", "telegram", "email"] });
}

export async function unsuspendShop(id: string, staff: Staff) {
  const s = await db.shop.findUnique({ where: { id } });
  if (!s || s.status !== "SUSPENDED") throw new AppError("invalidTransition");
  await setStatus(id, staff, "APPROVED", { moderationNote: null }, "shop.unsuspended");
  await db.shopWarning.updateMany({ where: { shopId: id, type: "SUSPENDED", resolvedAt: null }, data: { resolvedAt: new Date() } });
  await notify({ userId: s.ownerId, type: "seller.unsuspended", title: "Do‘kon qayta faol", body: "Do‘koningiz yana sotuvda.", href: "/seller", channels: ["telegram", "email"] });
}

export async function reviewDocument(docId: string, staff: Staff, status: "APPROVED" | "REJECTED", note?: string) {
  const d = await db.shopDocument.findUnique({ where: { id: docId }, include: { shop: { select: { ownerId: true, id: true } } } });
  if (!d) throw new AppError("notFound");
  await db.shopDocument.update({ where: { id: docId }, data: { status, note: status === "REJECTED" ? (note ?? null) : null } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: `shop.document_${status.toLowerCase()}`, entityType: "Shop", entityId: d.shop.id, meta: { type: d.type, note } });
  if (status === "REJECTED") await notify({ userId: d.shop.ownerId, type: "seller.document", title: "Hujjat rad etildi", body: note ?? d.type, href: "/seller/settings" });
}

/** Commercial terms: tier, official badge, individual commission override, KYC level. */
export async function updateShopTerms(id: string, staff: Staff, input: { tier: "BASIC" | "PRO"; isOfficial: boolean; commissionRate: number | null; kycLevel: number }) {
  const s = await db.shop.findUnique({ where: { id } });
  if (!s) throw new AppError("notFound");
  const data = { tier: input.tier, isOfficial: input.isOfficial, commissionRate: input.commissionRate, kycLevel: input.kycLevel, ...(input.tier !== s.tier ? { tierSince: new Date() } : {}) };
  await db.shop.update({ where: { id }, data });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "shop.terms", entityType: "Shop", entityId: id, before: { tier: s.tier, isOfficial: s.isOfficial, commissionRate: s.commissionRate, kycLevel: s.kycLevel }, after: data });
}

export async function warnShop(id: string, staff: Staff, message: string) {
  const s = await db.shop.findUnique({ where: { id } });
  if (!s) throw new AppError("notFound");
  await db.shopWarning.create({ data: { shopId: id, type: "MANUAL", message } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "shop.warned", entityType: "Shop", entityId: id, meta: { message } });
  await notify({ userId: s.ownerId, type: "seller.warning", title: "Ogohlantirish", body: message, href: "/seller/rating", channels: ["telegram", "email"] });
}

export async function penalizeShop(id: string, staff: Staff, input: { amount: number; reason: string; type: string }) {
  const s = await db.shop.findUnique({ where: { id } });
  if (!s) throw new AppError("notFound");
  const p = await db.penalty.create({ data: { shopId: id, type: input.type, amount: input.amount, reason: input.reason } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "shop.penalty", entityType: "Shop", entityId: id, after: { amount: input.amount, type: input.type }, meta: { reason: input.reason } });
  await notify({ userId: s.ownerId, type: "seller.penalty", title: "Jarima", body: `${input.amount.toLocaleString("ru-RU")} so‘m · ${input.reason}`, href: "/seller/finance", channels: ["telegram", "email"] });
  return p;
}
