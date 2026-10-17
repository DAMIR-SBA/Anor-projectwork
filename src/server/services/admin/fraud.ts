import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { revokeAllSessions } from "@/server/auth/session";
import { inflatedOldPrice } from "@/lib/seller";
import type { FraudType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { rejectProducts } from "./products";
import { suspendShop, type Staff } from "./shops";

type Detected = { type: FraudType; entityType: string; entityId: string; userId?: string | null; shopId?: string | null; score: number; details: Record<string, unknown> };

/** Open flags are refreshed; dismissed or confirmed ones stay closed unless the risk grew a lot. */
async function upsertFlag(f: Detected) {
  const existing = await db.fraudFlag.findUnique({ where: { type_entityType_entityId: { type: f.type, entityType: f.entityType, entityId: f.entityId } } });
  if (!existing) return db.fraudFlag.create({ data: { ...f, details: f.details as Prisma.InputJsonValue } }).then(() => 1);
  if (existing.status === "OPEN" || f.score >= existing.score + 20) {
    await db.fraudFlag.update({ where: { id: existing.id }, data: { score: f.score, details: f.details as Prisma.InputJsonValue, ...(existing.status !== "OPEN" ? { status: "OPEN", resolvedAt: null, resolvedById: null } : {}) } });
    return existing.status === "OPEN" ? 0 : 1;
  }
  return 0;
}

/** Several buyer accounts on one device (phone numbers are unique per account already). */
async function duplicateAccounts(): Promise<Detected[]> {
  const out: Detected[] = [];
  const shared = await db.device.groupBy({ by: ["fingerprint"], _count: { userId: true }, having: { userId: { _count: { gt: 1 } } } });
  for (const g of shared) {
    const devices = await db.device.findMany({ where: { fingerprint: g.fingerprint }, select: { userId: true, user: { select: { login: true, staffProfile: { select: { id: true } } } } } });
    const buyers = devices.filter((d) => !d.user.staffProfile);
    if (buyers.length < 2) continue;
    out.push({ type: "DUPLICATE_ACCOUNT", entityType: "Device", entityId: g.fingerprint, userId: buyers[0].userId, score: Math.min(95, 40 + 15 * (buyers.length - 1)), details: { signal: "device", userIds: buyers.map((d) => d.userId), logins: buyers.map((d) => d.user.login) } });
  }
  return out;
}

/**
 * Price games around sales: the price was pushed up shortly before joining a campaign, or the
 * crossed-out "old price" was never a real price.
 */
async function priceManipulation(): Promise<Detected[]> {
  const out: Detected[] = [];
  const since = new Date(Date.now() - 90 * 86_400_000);
  const joins = await db.campaignProduct.findMany({ where: { createdAt: { gte: since } }, include: { product: { select: { id: true, titleUz: true, shopId: true, variants: { where: { isDefault: true }, select: { id: true } } } } } });
  for (const j of joins) {
    const variantId = j.product.variants[0]?.id;
    if (!variantId) continue;
    const before = j.createdAt.getTime();
    const hist = await db.priceHistory.findMany({ where: { variantId, recordedAt: { gte: new Date(before - 45 * 86_400_000), lte: j.createdAt } }, orderBy: { recordedAt: "asc" } });
    const early = hist.filter((h) => h.recordedAt.getTime() < before - 14 * 86_400_000).map((h) => h.price);
    const late = hist.filter((h) => h.recordedAt.getTime() >= before - 14 * 86_400_000).map((h) => h.price);
    if (!early.length || !late.length) continue;
    const base = Math.min(...early);
    const peak = Math.max(...late);
    const jump = (peak - base) / base;
    if (jump >= 0.3) out.push({ type: "PRICE_MANIPULATION", entityType: "Product", entityId: j.product.id, shopId: j.product.shopId, score: Math.min(95, Math.round(50 + jump * 60)), details: { signal: "pre_sale_raise", title: j.product.titleUz, base, peak, salePrice: j.salePrice, jumpPct: Math.round(jump * 100), campaignId: j.campaignId } });
  }
  const variants = await db.variant.findMany({ where: { oldPrice: { not: null }, product: { status: "ACTIVE", deletedAt: null } }, select: { price: true, oldPrice: true, sku: true, product: { select: { id: true, titleUz: true, shopId: true } }, priceHistory: { where: { recordedAt: { gte: since } }, select: { price: true } } } });
  for (const v of variants) {
    if (!inflatedOldPrice(v.oldPrice, v.priceHistory.map((h) => h.price), v.price)) continue;
    const maxSeen = Math.max(v.price, ...v.priceHistory.map((h) => h.price));
    out.push({ type: "PRICE_MANIPULATION", entityType: "Product", entityId: v.product.id, shopId: v.product.shopId, score: Math.min(90, Math.round(40 + ((v.oldPrice! - maxSeen) / maxSeen) * 80)), details: { signal: "fake_old_price", title: v.product.titleUz, sku: v.sku, price: v.price, oldPrice: v.oldPrice, maxSeen } });
  }
  return out;
}

/** Serial returners: at least 3 returns in 90 days and returns ≥ 40% of delivered orders. */
async function suspiciousReturns(): Promise<Detected[]> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const returns = await db.return.groupBy({ by: ["userId"], where: { createdAt: { gte: since } }, _count: { _all: true }, _sum: { amount: true }, having: { userId: { _count: { gte: 3 } } } });
  const out: Detected[] = [];
  for (const r of returns) {
    const delivered = await db.order.count({ where: { userId: r.userId, status: { in: ["DELIVERED", "RETURNED"] }, deliveredAt: { gte: since } } });
    const ratio = r._count._all / Math.max(1, delivered);
    if (ratio < 0.4) continue;
    const reasons = await db.return.groupBy({ by: ["reason"], where: { userId: r.userId, createdAt: { gte: since } }, _count: { _all: true } });
    out.push({ type: "SUSPICIOUS_RETURN", entityType: "User", entityId: r.userId, userId: r.userId, score: Math.min(95, Math.round(40 + ratio * 50)), details: { returns: r._count._all, delivered, ratioPct: Math.round(ratio * 100), amount: r._sum.amount ?? 0, reasons: Object.fromEntries(reasons.map((x) => [x.reason, x._count._all])) } });
  }
  return out;
}

export async function runFraudScan() {
  const found = [...(await duplicateAccounts()), ...(await priceManipulation()), ...(await suspiciousReturns())];
  let opened = 0;
  for (const f of found) opened += await upsertFlag(f);
  return { detected: found.length, opened };
}

export const FRAUD_TYPES = ["DUPLICATE_ACCOUNT", "FAKE_REVIEW", "PRICE_MANIPULATION", "SUSPICIOUS_RETURN", "REFERRAL_ABUSE"] as const;

export async function listFlags(f: { status: "OPEN" | "CONFIRMED" | "DISMISSED"; type?: string; page: number }, pageSize = 25) {
  const where: Prisma.FraudFlagWhereInput = { status: f.status, ...(f.type && (FRAUD_TYPES as readonly string[]).includes(f.type) ? { type: f.type as FraudType } : {}) };
  const [rows, total, counts] = await Promise.all([
    db.fraudFlag.findMany({ where, orderBy: [{ score: "desc" }, { createdAt: "desc" }], skip: (f.page - 1) * pageSize, take: pageSize, include: { user: { select: { id: true, login: true, name: true, status: true } } } }),
    db.fraudFlag.count({ where }),
    db.fraudFlag.groupBy({ by: ["type"], where: { status: "OPEN" }, _count: { _all: true } }),
  ]);
  const shopIds = [...new Set(rows.map((r) => r.shopId).filter((x): x is string => !!x))];
  const shops = await db.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true, status: true } });
  return { rows: rows.map((r) => ({ ...r, shop: shops.find((s) => s.id === r.shopId) ?? null })), total, openByType: Object.fromEntries(counts.map((c) => [c.type, c._count._all])) as Record<string, number> };
}

export type FlagAction = "none" | "suspend_user" | "suspend_shop" | "take_down" | "hide_review";

/**
 * Close a flag. Confirming can apply a consequence in the same step; every action is audited and
 * the decision is kept on the flag.
 */
export async function resolveFlag(id: string, staff: Staff, decision: "CONFIRMED" | "DISMISSED", note: string, act: FlagAction = "none") {
  const f = await db.fraudFlag.findUnique({ where: { id } });
  if (!f || f.status !== "OPEN") throw new AppError("invalidTransition");
  if (decision === "CONFIRMED") {
    if (act === "suspend_user" && f.userId) await suspendUser(f.userId, staff, `fraud:${f.type} ${note}`);
    if (act === "suspend_shop" && f.shopId) await suspendShop(f.shopId, staff, `fraud:${f.type} ${note}`);
    if (act === "take_down" && f.entityType === "Product") await rejectProducts([f.entityId], staff, note);
    if (act === "hide_review" && f.type === "FAKE_REVIEW") {
      const ids = ((f.details as { reviews?: string[] }).reviews ?? []).filter(Boolean);
      await db.review.updateMany({ where: { id: { in: ids } }, data: { status: "REJECTED" } });
      const { recomputeProductRating } = await import("@/server/services/reviews");
      if (f.entityType === "Product") await recomputeProductRating(f.entityId);
    }
  }
  const details = { ...(f.details as Record<string, unknown>), decision: { note, action: act, by: staff.login, at: new Date().toISOString() } };
  await db.fraudFlag.update({ where: { id }, data: { status: decision, resolvedById: staff.userId, resolvedAt: new Date(), details: details as Prisma.InputJsonValue } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: `fraud.${decision.toLowerCase()}`, entityType: "FraudFlag", entityId: id, meta: { type: f.type, action: act, note } });
}

// ── Users ────────────────────────────────────────────────────────────────

export async function suspendUser(userId: string, staff: Staff, reason: string) {
  const u = await db.user.findUnique({ where: { id: userId }, include: { staffProfile: true } });
  if (!u) throw new AppError("notFound");
  // Staff accounts are managed in Staff (role checks, last SUPER_ADMIN rule).
  if (u.staffProfile) throw new AppError("staffAccount");
  if (u.status === "SUSPENDED") return;
  await db.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
  await revokeAllSessions(userId, { kind: "USER" });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "user.suspended", entityType: "User", entityId: userId, meta: { reason } });
}

export async function restoreUser(userId: string, staff: Staff) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || u.status !== "SUSPENDED") throw new AppError("invalidTransition");
  await db.user.update({ where: { id: userId }, data: { status: "ACTIVE", failedLoginCount: 0, lockedUntil: null } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "user.restored", entityType: "User", entityId: userId });
  await notify({ userId, type: "account.restored", title: "Hisob tiklandi", body: "Hisobingizga yana kirishingiz mumkin.", href: "/account", channels: ["sms", "email"] });
}

export async function resetLockout(userId: string, staff: Staff) {
  await db.user.update({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil: null } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "user.lockout_reset", entityType: "User", entityId: userId });
}

export async function revokeUserSessions(userId: string, staff: Staff) {
  await revokeAllSessions(userId, { kind: "USER" });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "user.sessions_revoked", entityType: "User", entityId: userId });
}

export async function listUsers(f: { q?: string; status?: string; page: number }, pageSize = 30) {
  const q = f.q?.trim();
  const digits = q?.replace(/\D/g, "");
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    staffProfile: null,
    ...(f.status === "SUSPENDED" ? { status: "SUSPENDED" } : f.status === "flagged" ? { fraudFlags: { some: { status: "OPEN" } } } : f.status === "plus" ? { subscriptions: { some: { status: "ACTIVE", currentPeriodEnd: { gt: new Date() } } } } : f.status === "sellers" ? { shops: { some: {} } } : {}),
    ...(q ? { OR: [{ login: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, ...(digits && digits.length >= 5 ? [{ phone: { contains: digits } }] : [])] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * pageSize, take: pageSize, select: { id: true, login: true, name: true, phone: true, email: true, status: true, loyaltyTier: true, createdAt: true, lastSeenAt: true, subscriptions: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 }, _count: { select: { orders: true, shops: true, fraudFlags: { where: { status: "OPEN" } } } } } }),
    db.user.count({ where }),
  ]);
  return { rows, total };
}

export async function userDetail(id: string) {
  const u = await db.user.findUnique({
    where: { id },
    include: {
      wallet: true,
      shops: { select: { id: true, name: true, status: true } },
      devices: { orderBy: { lastSeenAt: "desc" }, take: 10 },
      sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 10 },
      fraudFlags: { orderBy: { createdAt: "desc" }, take: 10 },
      staffProfile: { select: { id: true } },
    },
  });
  if (!u) return null;
  const [orders, spend, returns, audits, recent] = await Promise.all([
    db.order.count({ where: { userId: id } }),
    db.order.aggregate({ _sum: { total: true }, where: { userId: id, status: "DELIVERED" } }),
    db.return.count({ where: { userId: id } }),
    db.auditLog.findMany({ where: { OR: [{ entityType: "User", entityId: id }, { actorId: id }] }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.order.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, number: true, status: true, total: true, createdAt: true } }),
  ]);
  return { ...u, stats: { orders, spend: spend._sum.total ?? 0, returns }, audits, recent };
}
