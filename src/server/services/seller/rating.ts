import "server-only";
import { db } from "@/server/db";
import { measureShop, recomputeShopMetrics, SCORE_RESTRICT, SCORE_WARNING } from "@/server/services/shop-metrics";
import { fulfillmentScore, scoreLevel, SCORE_WEIGHTS } from "@/lib/seller";

/** Everything behind the seller's fulfillment score, refreshed on view. */
export async function ratingOverview(shopId: string) {
  await recomputeShopMetrics(shopId).catch(() => {});
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [shop, m, warnings, penalties] = await Promise.all([
    db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { fulfillmentScore: true, rating: true, reviewCount: true, restrictedAt: true, tier: true, responseTimeMins: true } }),
    measureShop(shopId),
    db.shopWarning.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.penalty.findMany({ where: { shopId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 50, include: { order: { select: { id: true, number: true } } } }),
  ]);
  const { parts } = fulfillmentScore({ ...m, rating: shop.rating, reviewCount: shop.reviewCount });
  return {
    score: shop.fulfillmentScore,
    level: scoreLevel(shop.fulfillmentScore),
    thresholds: { warning: SCORE_WARNING, restrict: SCORE_RESTRICT },
    weights: SCORE_WEIGHTS,
    parts,
    measures: { ...m, rating: shop.rating, reviewCount: shop.reviewCount, responseTimeMins: shop.responseTimeMins },
    restrictedAt: shop.restrictedAt?.toISOString() ?? null,
    tier: shop.tier,
    warnings: warnings.map((w) => ({ id: w.id, type: w.type, message: w.message, createdAt: w.createdAt.toISOString(), resolvedAt: w.resolvedAt?.toISOString() ?? null })),
    penalties: penalties.map((p) => ({ id: p.id, type: p.type, amount: p.amount, reason: p.reason, createdAt: p.createdAt.toISOString(), order: p.order })),
    penaltiesTotal: penalties.reduce((s, p) => s + p.amount, 0),
  };
}
