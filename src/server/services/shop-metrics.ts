import "server-only";
import { db } from "@/server/db";
import { notify } from "@/server/notify";
import { fulfillmentScore, PRO_KEEP_SCORE } from "@/lib/seller";

export const SCORE_WARNING = 80;
export const SCORE_RESTRICT = 65;

/** Raw 90-day counts behind the score (also shown on the seller rating page). */
export async function measureShop(shopId: string) {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const orders = await db.order.findMany({ where: { shopId, createdAt: { gte: since }, status: { not: "PENDING_PAYMENT" } }, select: { status: true, cancelReason: true, fulfillment: true, slaDeadline: true, shipments: { select: { handedOverAt: true } }, returns: { select: { id: true } } } });
  const total = orders.length;
  const sellerCancels = orders.filter((o) => o.status === "CANCELLED" && o.cancelReason?.startsWith("seller")).length;
  const returns = orders.filter((o) => o.returns.length > 0).length;
  const fbs = orders.filter((o) => o.fulfillment === "FBS" && o.slaDeadline && o.shipments[0]?.handedOverAt);
  const onTime = fbs.filter((o) => o.shipments[0]!.handedOverAt! <= o.slaDeadline!).length;
  return {
    orders: total,
    sellerCancels,
    returns,
    handovers: fbs.length,
    onTime,
    cancellationRate: sellerCancels / (total || 1),
    returnRate: returns / (total || 1),
    slaCompliance: fbs.length ? (onTime / fbs.length) * 100 : 100,
  };
}

/**
 * Seller rating over the last 90 days: cancellation rate (seller-initiated), return rate,
 * SLA compliance (FBS handovers before deadline) and review score → a 0–100 fulfillment score.
 * Low scores trigger warnings, very low scores restrict the shop (no ads, lower ranking).
 */
export async function recomputeShopMetrics(shopId: string) {
  const [m, shop] = await Promise.all([measureShop(shopId), db.shop.findUniqueOrThrow({ where: { id: shopId } })]);
  const { cancellationRate, returnRate, slaCompliance } = m;
  const { score } = fulfillmentScore({ slaCompliance, rating: shop.rating, reviewCount: shop.reviewCount, cancellationRate, returnRate });
  const restrict = score < SCORE_RESTRICT;
  const downgrade = shop.tier === "PRO" && score < PRO_KEEP_SCORE;
  await db.shop.update({ where: { id: shopId }, data: { cancellationRate, returnRate, slaCompliance, fulfillmentScore: score, restrictedAt: restrict ? (shop.restrictedAt ?? new Date()) : null, ...(downgrade ? { tier: "BASIC", tierSince: new Date() } : {}) } });
  const href = "/seller/rating";
  if (score < SCORE_WARNING && shop.fulfillmentScore >= SCORE_WARNING) {
    await db.shopWarning.create({ data: { shopId, type: "LOW_SCORE", message: `Fulfillment score dropped to ${score.toFixed(0)}` } });
    await notify({ userId: shop.ownerId, type: "seller.warning", title: "Reyting pasaydi", body: `Bajarish ko‘rsatkichi ${score.toFixed(0)}%. SLA va bekor qilishlarni kamaytiring.`, href });
  }
  if (restrict && !shop.restrictedAt) {
    await db.shopWarning.create({ data: { shopId, type: "RESTRICTED", message: `Score ${score.toFixed(0)} < ${SCORE_RESTRICT}: ads paused, lower search ranking` } });
    await notify({ userId: shop.ownerId, type: "seller.restricted", title: "Do‘kon cheklandi", body: `Ko‘rsatkich ${score.toFixed(0)}%. Reklama to‘xtatildi, qidiruvda pastroq ko‘rsatiladi.`, href, channels: ["telegram", "sms"] });
  }
  if (downgrade) {
    await db.shopWarning.create({ data: { shopId, type: "TIER_DOWNGRADE", message: `Pro → Basic: score ${score.toFixed(0)} < ${PRO_KEEP_SCORE}` } });
    await notify({ userId: shop.ownerId, type: "seller.tier", title: "Pro tarif o‘chirildi", body: `Ko‘rsatkich ${PRO_KEEP_SCORE}% dan past. Qayta yuqoriga chiqib, Pro’ni yana yoqing.`, href: "/seller/academy" });
  }
  // Recovered: close open score warnings.
  if (score >= SCORE_WARNING) await db.shopWarning.updateMany({ where: { shopId, type: { in: ["LOW_SCORE", "RESTRICTED"] }, resolvedAt: null }, data: { resolvedAt: new Date() } });
  return { score, cancellationRate, returnRate, slaCompliance };
}
