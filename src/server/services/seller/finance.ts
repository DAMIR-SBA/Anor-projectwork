import "server-only";
import { db } from "@/server/db";
import { notify } from "@/server/notify";
import { audit } from "@/server/audit";
import { randomDigits } from "@/server/security/crypto";
import { nextPayoutDate, payoutNet, payoutWeek } from "@/lib/seller";
import { dayKey } from "@/lib/chat";

/** Money for orders delivered in [start, end): gross minus commission, logistics, ads, penalties and refunds. */
export async function computePeriod(shopId: string, start: Date, end: Date) {
  const [orders, penalties, refunds, ads] = await Promise.all([
    db.order.findMany({ where: { shopId, status: { in: ["DELIVERED", "RETURNED"] }, deliveredAt: { gte: start, lt: end } }, select: { id: true, number: true, deliveredAt: true, subtotal: true, discountTotal: true, logisticsFee: true, total: true, paymentMethod: true, items: { select: { commissionAmount: true } } } }),
    db.penalty.aggregate({ _sum: { amount: true }, where: { shopId, createdAt: { gte: start, lt: end } } }),
    db.return.aggregate({ _sum: { amount: true }, where: { order: { shopId }, status: "REFUNDED", decidedAt: { gte: start, lt: end } } }),
    db.adStat.aggregate({ _sum: { spend: true }, where: { campaign: { shopId }, day: { gte: dayKey(start), lt: dayKey(end) } } }),
  ]);
  const lines = orders.map((o) => {
    const gross = o.subtotal - o.discountTotal;
    const commission = o.items.reduce((s, i) => s + i.commissionAmount, 0);
    return { orderId: o.id, number: o.number, deliveredAt: o.deliveredAt!, gross, commission, logistics: o.logisticsFee, net: gross - commission - o.logisticsFee, paymentMethod: o.paymentMethod };
  });
  const totals = {
    gross: lines.reduce((s, l) => s + l.gross, 0),
    commission: lines.reduce((s, l) => s + l.commission, 0),
    logistics: lines.reduce((s, l) => s + l.logistics, 0),
    adSpend: ads._sum.spend ?? 0,
    penalties: penalties._sum.amount ?? 0,
    refunds: refunds._sum.amount ?? 0,
  };
  return { lines, totals, net: payoutNet(totals), ordersCount: lines.length };
}

/** Weekly settlement (job): one Payout per shop for the previous Monday–Sunday. */
export async function generatePayouts(now = new Date()) {
  const { start: thisWeek } = payoutWeek(now);
  const start = new Date(thisWeek.getTime() - 7 * 86_400_000);
  const shops = await db.shop.findMany({ where: { status: "APPROVED" }, select: { id: true, ownerId: true } });
  let created = 0;
  for (const s of shops) {
    if (await db.payout.findUnique({ where: { shopId_periodStart: { shopId: s.id, periodStart: start } } })) continue;
    const p = await computePeriod(s.id, start, thisWeek);
    if (!p.ordersCount && !p.totals.penalties && !p.totals.adSpend) continue;
    await db.payout.create({ data: { shopId: s.id, periodStart: start, periodEnd: thisWeek, ...p.totals, net: p.net, ordersCount: p.ordersCount } });
    created++;
  }
  return { created };
}

/** Bank transfer (mocked): pending payouts become PAID with a reference on payout day. */
export const BANK_CHANGE_HOLD_HOURS = 48;

export async function settlePayouts() {
  const due = await db.payout.findMany({ where: { status: "PENDING" }, orderBy: { periodStart: "asc" }, include: { shop: { select: { ownerId: true, bankAccount: true } } } });
  // Payout account changed in the last 48 h → hold (account-takeover protection).
  const held = new Set((await db.auditLog.findMany({ where: { action: "shop.bank_changed", createdAt: { gt: new Date(Date.now() - BANK_CHANGE_HOLD_HOURS * 3_600_000) } }, select: { entityId: true } })).map((a) => a.entityId));
  // Net all pending weeks per shop: a negative week (refunds/ads/penalties above sales) is offset
  // against later positive weeks; nothing is transferred while the balance is not positive.
  const byShop = new Map<string, typeof due>();
  for (const p of due) byShop.set(p.shopId, [...(byShop.get(p.shopId) ?? []), p]);
  let paid = 0;
  for (const [shopId, rows] of byShop) {
    const shop = rows[0].shop;
    const total = rows.reduce((s, p) => s + p.net, 0);
    if (!shop.bankAccount || held.has(shopId) || total <= 0) continue;
    const reference = `ANR-PO-${randomDigits(10)}`;
    const now = new Date();
    await db.payout.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "PAID", reference, paidAt: now } });
    paid++;
    await notify({ userId: shop.ownerId, type: "seller.payout", title: "To‘lov o‘tkazildi", body: `${total.toLocaleString("ru-RU")} so‘m · ${reference}`, href: "/seller/finance", channels: ["telegram", "email"] });
    await audit({ actorKind: "system", action: "payout.paid", entityType: "Shop", entityId: shopId, after: { total, weeks: rows.length, reference } });
  }
  return { paid, held: held.size };
}

export async function financeOverview(shopId: string) {
  const now = new Date();
  const { start } = payoutWeek(now);
  const [current, payouts, penalties, lastPaid] = await Promise.all([
    computePeriod(shopId, start, now),
    db.payout.findMany({ where: { shopId }, orderBy: { periodStart: "desc" }, take: 26 }),
    db.penalty.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 20, include: { order: { select: { number: true } } } }),
    db.payout.findFirst({ where: { shopId, status: "PAID" }, orderBy: { paidAt: "desc" } }),
  ]);
  const pending = payouts.filter((p) => p.status !== "PAID").reduce((s, p) => s + p.net, 0);
  return { current: { ...current, start: start.toISOString() }, payouts, penalties, pending, nextPayout: nextPayoutDate(now).toISOString(), lastPaid };
}

export async function payoutDetail(shopId: string, payoutId: string) {
  const p = await db.payout.findFirst({ where: { id: payoutId, shopId } });
  if (!p) return null;
  const period = await computePeriod(shopId, p.periodStart, p.periodEnd);
  return { payout: p, lines: period.lines };
}
