import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { hmac, safeEqual } from "@/server/security/crypto";
import { cardInclude, earlyCampaignIds, getPlans, toCard } from "@/server/services/catalog";
import { adCharge, adMetrics, adScore } from "@/lib/seller";
import { dayKey } from "@/lib/chat";
import { normalizeForMatch } from "@/lib/review-moderation";
import type { ProductCardData } from "@/lib/types";
import type { AdPlacement, BidModel } from "@/generated/prisma/enums";

export const MIN_BID = { CPC: 300, CPM: 10_000 } as const;
export const MIN_DAILY_BUDGET = 20_000;
export const AD_ATTRIBUTION_DAYS = 7;
export const AD_COOKIE = "anor_adc";

// ── Seller side ──────────────────────────────────────────────────────────

export type CampaignInput = { name: string; placement: AdPlacement; bidModel: BidModel; bid: number; dailyBudget: number; totalBudget?: number | null; keywords: string[]; categoryId?: string | null; productIds: string[]; endsAt?: Date | null };

export async function saveCampaign(shop: { id: string; restrictedAt: Date | null; status: string }, actor: { userId: string; login: string }, input: CampaignInput, id?: string) {
  if (shop.status !== "APPROVED") throw new AppError("forbidden");
  if (shop.restrictedAt) throw new AppError("shopRestricted");
  if (input.bid < MIN_BID[input.bidModel]) throw new AppError("bidTooLow", { min: MIN_BID[input.bidModel] }, "bid");
  if (input.dailyBudget < MIN_DAILY_BUDGET) throw new AppError("budgetTooLow", { min: MIN_DAILY_BUDGET }, "dailyBudget");
  if (input.placement === "SEARCH" && !input.keywords.length) throw new AppError("keywordsRequired", undefined, "keywords");
  const own = await db.product.count({ where: { id: { in: input.productIds }, shopId: shop.id, status: "ACTIVE", deletedAt: null } });
  if (!input.productIds.length || own !== input.productIds.length) throw new AppError("adProducts", undefined, "productIds");
  const data = {
    name: input.name.trim(),
    placement: input.placement,
    bidModel: input.bidModel,
    bid: input.bid,
    dailyBudget: input.dailyBudget,
    totalBudget: input.totalBudget ?? null,
    keywords: [...new Set(input.keywords.map((k) => normalizeForMatch(k.trim())).filter((k) => k.length >= 2))].slice(0, 30),
    categoryId: input.placement === "CATEGORY" ? (input.categoryId ?? null) : null,
    productIds: input.productIds,
    endsAt: input.endsAt ?? null,
  };
  const c = id ? await db.adCampaign.update({ where: { id, shopId: shop.id }, data }) : await db.adCampaign.create({ data: { ...data, shopId: shop.id } });
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: id ? "ads.update" : "ads.create", entityType: "AdCampaign", entityId: c.id, after: { bid: c.bid, bidModel: c.bidModel, dailyBudget: c.dailyBudget } });
  return c;
}

export async function setCampaignStatus(shopId: string, id: string, status: "ACTIVE" | "PAUSED" | "ENDED") {
  const c = await db.adCampaign.findFirst({ where: { id, shopId } });
  if (!c || c.status === "ENDED") throw new AppError("notFound");
  await db.adCampaign.update({ where: { id }, data: { status } });
}

export async function listCampaigns(shopId: string, days = 30) {
  const since = dayKey(new Date(Date.now() - days * 86_400_000));
  const rows = await db.adCampaign.findMany({ where: { shopId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { stats: { where: { day: { gte: since } }, orderBy: { day: "asc" } }, category: { select: { nameUz: true, nameRu: true } } } });
  const today = dayKey(new Date());
  return rows.map((c) => {
    const s = c.stats.reduce((a, x) => ({ impressions: a.impressions + x.impressions, clicks: a.clicks + x.clicks, orders: a.orders + x.orders, revenue: a.revenue + x.revenue, spend: a.spend + x.spend }), { impressions: 0, clicks: 0, orders: 0, revenue: 0, spend: 0 });
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      placement: c.placement,
      bidModel: c.bidModel,
      bid: c.bid,
      dailyBudget: c.dailyBudget,
      totalBudget: c.totalBudget,
      spent: c.spent,
      spentToday: c.spentDay === today ? c.spentToday : 0,
      keywords: c.keywords,
      category: c.category,
      productIds: c.productIds,
      endsAt: c.endsAt?.toISOString() ?? null,
      stats: s,
      metrics: adMetrics(s),
      series: c.stats.map((x) => ({ day: x.day, clicks: x.clicks, spend: x.spend, impressions: x.impressions })),
    };
  });
}

// ── Serving ──────────────────────────────────────────────────────────────

type Context = { placement: "SEARCH"; query: string } | { placement: "CATEGORY"; categoryIds: string[] };

/** Signed click URL so third parties cannot burn a competitor's budget by forging clicks. */
export function clickUrl(campaignId: string, productId: string) {
  const sig = hmac(`${campaignId}.${productId}`, "ad-click").slice(0, 16);
  return `/api/ads/click?c=${campaignId}&p=${productId}&s=${sig}`;
}

export function verifyClick(campaignId: string, productId: string, sig: string) {
  return safeEqual(hmac(`${campaignId}.${productId}`, "ad-click").slice(0, 16), sig);
}

/**
 * Up to `limit` sponsored cards for a search query or category page. Eligible campaigns are
 * active, within schedule and budget, from shops in good standing; ranking = bid value × quality.
 */
export async function sponsoredCards(ctx: Context, locale: string, excludeIds: string[] = [], limit = 2): Promise<Array<ProductCardData & { campaignId: string }>> {
  const now = new Date();
  const today = dayKey(now);
  const campaigns = await db.adCampaign.findMany({
    where: { status: "ACTIVE", placement: ctx.placement, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], shop: { status: "APPROVED", restrictedAt: null }, ...(ctx.placement === "CATEGORY" ? { categoryId: { in: ctx.categoryIds } } : {}) },
    include: { stats: { orderBy: { day: "desc" }, take: 14 }, shop: { select: { rating: true } } },
    take: 200,
  });
  const words = ctx.placement === "SEARCH" ? normalizeForMatch(ctx.query).split(/[^\p{L}\d']+/u).filter((w) => w.length >= 2) : [];
  const eligible = campaigns.filter((c) => {
    const spentToday = c.spentDay === today ? c.spentToday : 0;
    if (spentToday >= c.dailyBudget) return false;
    if (c.totalBudget && c.spent >= c.totalBudget) return false;
    if (ctx.placement === "SEARCH") return c.keywords.some((k) => words.some((w) => w.startsWith(k) || k.startsWith(w)));
    return true;
  });
  const ranked = eligible
    .map((c) => {
      const s = c.stats.reduce((a, x) => ({ i: a.i + x.impressions, c: a.c + x.clicks }), { i: 0, c: 0 });
      return { c, score: adScore({ bidModel: c.bidModel, bid: c.bid }, { ctr: s.i >= 100 ? s.c / s.i : 0.02, rating: c.shop.rating }) };
    })
    .sort((a, b) => b.score - a.score);
  const out: Array<ProductCardData & { campaignId: string }> = [];
  const plans = await getPlans();
  const seenShops = new Set<string>();
  for (const { c } of ranked) {
    if (out.length >= limit) break;
    if (seenShops.has(c.shopId)) continue;
    const product = await db.product.findFirst({ where: { id: { in: c.productIds.filter((id) => !excludeIds.includes(id)) }, status: "ACTIVE", deletedAt: null, variants: { some: { stock: { gt: 0 } } } }, include: cardInclude(await earlyCampaignIds()), orderBy: { soldCount: "desc" } });
    if (!product) continue;
    seenShops.add(c.shopId);
    out.push({ ...toCard(product, locale, plans), href: clickUrl(c.id, product.id), sponsored: true, campaignId: c.id });
  }
  return out;
}

async function charge(campaignId: string, amount: number, field: "impressions" | "clicks", n: number) {
  const day = dayKey(new Date());
  await db.$transaction([
    db.adStat.upsert({ where: { adCampaignId_day: { adCampaignId: campaignId, day } }, create: { adCampaignId: campaignId, day, [field]: n, spend: amount }, update: { [field]: { increment: n }, spend: { increment: amount } } }),
    // Reset the daily counter lazily when the first event of a new day arrives.
    db.$executeRaw`UPDATE "AdCampaign" SET "spentToday" = CASE WHEN "spentDay" = ${day} THEN "spentToday" + ${amount} ELSE ${amount} END, "spentDay" = ${day}, spent = spent + ${amount} WHERE id = ${campaignId}`,
  ]);
}

export async function recordImpressions(campaignIds: string[]) {
  if (!campaignIds.length) return;
  const cs = await db.adCampaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, bidModel: true, bid: true } });
  for (const c of cs) await charge(c.id, adCharge(c.bidModel, c.bid, "impression"), "impressions", 1);
}

export async function recordClick(campaignId: string) {
  const c = await db.adCampaign.findUnique({ where: { id: campaignId }, select: { id: true, bidModel: true, bid: true } });
  if (!c) return;
  await charge(c.id, adCharge(c.bidModel, c.bid, "click"), "clicks", 1);
}

/** Last-click attribution: an order of the clicked product within 7 days counts for the campaign. */
export async function attributeOrders(groupId: string, cookie: { campaignId: string; productId: string; at: number } | null) {
  if (!cookie || Date.now() - cookie.at > AD_ATTRIBUTION_DAYS * 86_400_000) return;
  const items = await db.orderItem.findMany({ where: { order: { groupId }, productId: cookie.productId } });
  if (!items.length) return;
  const revenue = items.reduce((s, i) => s + i.unitPrice * i.quantity - i.discount, 0);
  const day = dayKey(new Date());
  await db.adStat.upsert({ where: { adCampaignId_day: { adCampaignId: cookie.campaignId, day } }, create: { adCampaignId: cookie.campaignId, day, orders: 1, revenue }, update: { orders: { increment: 1 }, revenue: { increment: revenue } } });
}
