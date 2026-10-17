import "server-only";
import { bannerState, nextYear } from "@/lib/admin";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { isOwnStorageUrl } from "@/server/storage";
import { slugify } from "@/lib/seller";
import type { BannerPlacement, CampaignStatus, CampaignType, CouponType } from "@/generated/prisma/enums";
import type { Staff } from "./shops";

// ── Campaigns ────────────────────────────────────────────────────────────

export type Block = { type: "hero" | "countdown" | "products" | "text" | "coupons"; textUz?: string; textRu?: string; codes?: string[] };
export type CampaignInput = { slug?: string; type: CampaignType; nameUz: string; nameRu: string; descriptionUz?: string | null; descriptionRu?: string | null; season?: string | null; startsAt: Date; endsAt: Date; minDiscountPercent: number; plusEarlyHours: number; themeColor: string; bannerUrl?: string | null; recurring: boolean; spinEnabled: boolean; blocks: Block[] };

export async function listCampaigns() {
  const rows = await db.campaign.findMany({ orderBy: [{ status: "asc" }, { startsAt: "asc" }], include: { products: { select: { status: true } } } });
  return rows.map((c) => ({ ...c, participants: { total: c.products.length, pending: c.products.filter((p) => p.status === "PENDING").length, approved: c.products.filter((p) => p.status === "APPROVED").length } }));
}

export async function campaignDetail(id: string) {
  const c = await db.campaign.findUnique({
    where: { id },
    include: { products: { orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { product: { select: { id: true, titleUz: true, titleRu: true, price: true, slug: true, media: { take: 1, orderBy: { sort: "asc" }, select: { url: true } } } }, shop: { select: { id: true, name: true } } } } },
  });
  return c;
}

export async function saveCampaign(staff: Staff, input: CampaignInput, id?: string) {
  if (input.endsAt <= input.startsAt) throw new AppError("dateRange", undefined, "endsAt");
  const slug = slugify(input.slug || input.nameUz);
  if (slug.length < 3) throw new AppError("slugInvalid", undefined, "slug");
  if (await db.campaign.findFirst({ where: { slug, NOT: { id: id ?? "-" } } })) throw new AppError("slugTaken", undefined, "slug");
  if (input.bannerUrl && !isOwnStorageUrl(input.bannerUrl)) throw new AppError("fileType", undefined, "bannerUrl");
  const data = { slug, type: input.type, nameUz: input.nameUz.trim(), nameRu: input.nameRu.trim(), descriptionUz: input.descriptionUz?.trim() || null, descriptionRu: input.descriptionRu?.trim() || null, season: input.season?.trim() || null, startsAt: input.startsAt, endsAt: input.endsAt, minDiscountPercent: input.minDiscountPercent, plusEarlyHours: input.plusEarlyHours, themeColor: input.themeColor, bannerUrl: input.bannerUrl || null, recurring: input.recurring, spinEnabled: input.spinEnabled, blocks: input.blocks };
  const c = id ? await db.campaign.update({ where: { id }, data }) : await db.campaign.create({ data: { ...data, status: "DRAFT" } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: id ? "campaign.updated" : "campaign.created", entityType: "Campaign", entityId: c.id, after: { slug, startsAt: data.startsAt, endsAt: data.endsAt, minDiscount: data.minDiscountPercent } });
  return c;
}

/** Manual status control; the scheduler job moves SCHEDULED → ACTIVE → ENDED by date. */
export async function setCampaignStatus(staff: Staff, id: string, status: CampaignStatus) {
  const c = await db.campaign.findUnique({ where: { id } });
  if (!c) throw new AppError("notFound");
  const now = new Date();
  const next = status === "SCHEDULED" && c.startsAt <= now && c.endsAt > now ? "ACTIVE" : status;
  await db.campaign.update({ where: { id }, data: { status: next, ...(status === "ENDED" && c.endsAt > now ? { endsAt: now } : {}) } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "campaign.status", entityType: "Campaign", entityId: id, before: { status: c.status }, after: { status: next } });
}

export async function moderateParticipants(staff: Staff, campaignId: string, ids: string[], decision: "APPROVED" | "REJECTED", reason?: string) {
  const rows = await db.campaignProduct.findMany({ where: { id: { in: ids }, campaignId }, include: { shop: { select: { ownerId: true } }, product: { select: { titleUz: true } }, campaign: { select: { nameUz: true } } } });
  await db.campaignProduct.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: decision } });
  if (decision === "REJECTED")
    for (const r of rows) await notify({ userId: r.shop.ownerId, type: "seller.campaign", title: `${r.campaign.nameUz}: rad etildi`, body: `${r.product.titleUz}${reason ? ` — ${reason}` : ""}`, href: "/seller/promotions" });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: `campaign.participants_${decision.toLowerCase()}`, entityType: "Campaign", entityId: campaignId, meta: { count: rows.length, reason } });
  return rows.length;
}

/**
 * Scheduler: start and end campaigns by date; when a recurring (seasonal) campaign ends, schedule
 * next year's edition with the same settings and landing blocks.
 */
export async function tickCampaigns(now = new Date()) {
  const started = await db.campaign.updateMany({ where: { status: "SCHEDULED", startsAt: { lte: now }, endsAt: { gt: now } }, data: { status: "ACTIVE" } });
  const ending = await db.campaign.findMany({ where: { status: { in: ["ACTIVE", "SCHEDULED"] }, endsAt: { lte: now } } });
  let renewed = 0;
  for (const c of ending) {
    await db.campaign.update({ where: { id: c.id }, data: { status: "ENDED" } });
    if (!c.recurring) continue;
    const startsAt = nextYear(c.startsAt);
    const base = c.slug.replace(/-\d{4}$/, "");
    const slug = `${base}-${startsAt.getUTCFullYear()}`;
    if (await db.campaign.findUnique({ where: { slug } })) continue;
    await db.campaign.create({ data: { slug, type: c.type, nameUz: c.nameUz, nameRu: c.nameRu, descriptionUz: c.descriptionUz, descriptionRu: c.descriptionRu, season: c.season, startsAt, endsAt: nextYear(c.endsAt), status: "SCHEDULED", minDiscountPercent: c.minDiscountPercent, plusEarlyHours: c.plusEarlyHours, themeColor: c.themeColor, bannerUrl: c.bannerUrl, blocks: c.blocks ?? undefined, recurring: true, spinEnabled: c.spinEnabled } });
    renewed++;
  }
  return { started: started.count, ended: ending.length, renewed };
}

// ── Coupons ──────────────────────────────────────────────────────────────

export type CouponInput = { code: string; type: CouponType; value: number; maxDiscount?: number | null; minCartTotal: number; categoryId?: string | null; shopId?: string | null; firstOrderOnly: boolean; usageLimit?: number | null; perUserLimit: number; startsAt?: Date | null; endsAt?: Date | null; isActive: boolean; descriptionUz?: string | null; descriptionRu?: string | null };

function couponData(i: CouponInput) {
  if (i.type === "PERCENT" && (i.value < 1 || i.value > 90)) throw new AppError("invalidInput", undefined, "value");
  if (i.startsAt && i.endsAt && i.endsAt <= i.startsAt) throw new AppError("dateRange", undefined, "endsAt");
  return { code: i.code.trim().toUpperCase(), type: i.type, value: i.type === "FREE_DELIVERY" ? 0 : i.value, maxDiscount: i.type === "PERCENT" ? (i.maxDiscount ?? null) : null, minCartTotal: i.minCartTotal, categoryId: i.categoryId || null, shopId: i.shopId || null, firstOrderOnly: i.firstOrderOnly, usageLimit: i.usageLimit ?? null, perUserLimit: i.perUserLimit, startsAt: i.startsAt ?? null, endsAt: i.endsAt ?? null, isActive: i.isActive, descriptionUz: i.descriptionUz?.trim() || null, descriptionRu: i.descriptionRu?.trim() || null };
}

export async function listCoupons(q?: string, page = 1, pageSize = 30) {
  const where = q ? { code: { contains: q.trim().toUpperCase() } } : {};
  const [rows, total] = await Promise.all([
    db.coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { category: { select: { nameUz: true, nameRu: true } }, shop: { select: { name: true } }, _count: { select: { redemptions: true } } } }),
    db.coupon.count({ where }),
  ]);
  return { rows, total };
}

export async function saveCoupon(staff: Staff, input: CouponInput, id?: string) {
  const data = couponData(input);
  if (await db.coupon.findFirst({ where: { code: data.code, NOT: { id: id ?? "-" } } })) throw new AppError("codeTaken", undefined, "code");
  const c = id ? await db.coupon.update({ where: { id }, data }) : await db.coupon.create({ data });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: id ? "coupon.updated" : "coupon.created", entityType: "Coupon", entityId: c.id, after: { code: c.code, type: c.type, value: c.value, usageLimit: c.usageLimit } });
  return c;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** Generate `count` single-use codes sharing the same rules (e.g. for a partner or a mailing). */
export async function bulkCoupons(staff: Staff, prefix: string, count: number, template: Omit<CouponInput, "code">) {
  const codes = new Set<string>();
  while (codes.size < count) {
    const bytes = randomBytes(8);
    codes.add(`${prefix.toUpperCase()}-${[...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")}`);
  }
  const base = couponData({ ...template, code: "X" });
  const res = await db.coupon.createMany({ data: [...codes].map((code) => ({ ...base, code, usageLimit: 1, perUserLimit: 1 })), skipDuplicates: true });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "coupon.bulk_created", entityType: "Coupon", meta: { prefix, count: res.count } });
  return { created: res.count, codes: [...codes] };
}

// ── Banners ──────────────────────────────────────────────────────────────

export type BannerInput = { titleUz: string; titleRu: string; subtitleUz?: string | null; subtitleRu?: string | null; imageUrl?: string | null; href: string; placement: BannerPlacement; bgColor: string; sort: number; startsAt?: Date | null; endsAt?: Date | null; isActive: boolean };

export async function listBanners() {
  const now = new Date();
  const rows = await db.banner.findMany({ orderBy: [{ placement: "asc" }, { sort: "asc" }] });
  return rows.map((b) => ({ ...b, state: bannerState(b, now), startsAt: b.startsAt?.toISOString() ?? null, endsAt: b.endsAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString() }));
}

export async function saveBanner(staff: Staff, input: BannerInput, id?: string) {
  if (input.imageUrl && !isOwnStorageUrl(input.imageUrl) && !input.imageUrl.startsWith("/media/")) throw new AppError("fileType", undefined, "imageUrl");
  // Internal links only (no open redirects through banners).
  if (!input.href.startsWith("/") || input.href.startsWith("//")) throw new AppError("invalidInput", undefined, "href");
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) throw new AppError("dateRange", undefined, "endsAt");
  const data = { ...input, subtitleUz: input.subtitleUz || null, subtitleRu: input.subtitleRu || null, imageUrl: input.imageUrl || null, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null };
  const b = id ? await db.banner.update({ where: { id }, data }) : await db.banner.create({ data });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: id ? "banner.updated" : "banner.created", entityType: "Banner", entityId: b.id, after: { placement: b.placement, startsAt: b.startsAt, endsAt: b.endsAt, isActive: b.isActive } });
  return b;
}

export async function deleteBanner(staff: Staff, id: string) {
  await db.banner.delete({ where: { id } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "banner.deleted", entityType: "Banner", entityId: id });
}
