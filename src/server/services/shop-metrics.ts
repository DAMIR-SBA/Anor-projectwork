import "server-only";
import { db } from "@/server/db";
import { notify } from "@/server/notify";

export const SCORE_WARNING = 80;
export const SCORE_RESTRICT = 65;

/**
 * Seller rating over the last 90 days: cancellation rate (seller-initiated), return rate,
 * SLA compliance (FBS handovers before deadline) and review score → a 0–100 fulfillment score.
 * Low scores trigger warnings, very low scores restrict the shop (no ads, lower ranking).
 */
export async function recomputeShopMetrics(shopId: string) {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [orders, shop] = await Promise.all([
    db.order.findMany({ where: { shopId, createdAt: { gte: since }, status: { not: "PENDING_PAYMENT" } }, select: { status: true, cancelReason: true, fulfillment: true, slaDeadline: true, shipments: { select: { handedOverAt: true } }, returns: { select: { id: true } } } }),
    db.shop.findUniqueOrThrow({ where: { id: shopId } }),
  ]);
  const total = orders.length || 1;
  const sellerCancels = orders.filter((o) => o.status === "CANCELLED" && o.cancelReason?.startsWith("seller")).length;
  const returns = orders.filter((o) => o.returns.length > 0).length;
  const fbs = orders.filter((o) => o.fulfillment === "FBS" && o.slaDeadline && o.shipments[0]?.handedOverAt);
  const onTime = fbs.filter((o) => o.shipments[0]!.handedOverAt! <= o.slaDeadline!).length;
  const cancellationRate = sellerCancels / total;
  const returnRate = returns / total;
  const slaCompliance = fbs.length ? (onTime / fbs.length) * 100 : 100;
  const reviewScore = shop.reviewCount ? (shop.rating / 5) * 100 : 90;
  const score = Math.max(0, Math.min(100, slaCompliance * 0.35 + reviewScore * 0.35 + (1 - cancellationRate * 4) * 100 * 0.2 + (1 - returnRate * 3) * 100 * 0.1));
  await db.shop.update({ where: { id: shopId }, data: { cancellationRate, returnRate, slaCompliance, fulfillmentScore: Math.round(score * 10) / 10, restrictedAt: score < SCORE_RESTRICT ? (shop.restrictedAt ?? new Date()) : null } });
  if (score < SCORE_WARNING && shop.fulfillmentScore >= SCORE_WARNING) {
    await db.shopWarning.create({ data: { shopId, type: "LOW_SCORE", message: `Fulfillment score dropped to ${score.toFixed(0)}` } });
    await notify({ userId: shop.ownerId, type: "seller.warning", title: "Reyting pasaydi", body: `Bajarish ko‘rsatkichi ${score.toFixed(0)}%. SLA va bekor qilishlarni kamaytiring.`, href: "/seller/rating" });
  }
  return { score, cancellationRate, returnRate, slaCompliance };
}
