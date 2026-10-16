import "server-only";
import { db } from "@/server/db";
import { unitEconomics } from "@/lib/seller";
import { dayKey } from "@/lib/chat";

const DAY = 86_400_000;
const LIVE: Array<"PLACED" | "CONFIRMED" | "PACKED" | "SHIPPED" | "DELIVERED" | "RETURNED"> = ["PLACED", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "RETURNED"];

async function periodStats(shopId: string, from: Date, to: Date) {
  const [orders, views, cancelled, returns] = await Promise.all([
    db.order.findMany({ where: { shopId, createdAt: { gte: from, lt: to }, status: { in: LIVE } }, select: { total: true, createdAt: true, items: { select: { quantity: true } } } }),
    db.productView.count({ where: { product: { shopId }, createdAt: { gte: from, lt: to } } }),
    db.order.count({ where: { shopId, createdAt: { gte: from, lt: to }, status: "CANCELLED" } }),
    db.return.count({ where: { order: { shopId }, createdAt: { gte: from, lt: to } } }),
  ]);
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const units = orders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
  return { orders, revenue, count: orders.length, units, views, cancelled, returns, aov: orders.length ? Math.round(revenue / orders.length) : 0, conversion: views ? orders.length / views : 0 };
}

export async function sellerAnalytics(shopId: string, days: number) {
  const now = Date.now();
  const end = new Date(now);
  const start = new Date(now - days * DAY);
  const [cur, prev] = await Promise.all([periodStats(shopId, start, end), periodStats(shopId, new Date(now - 2 * days * DAY), start)]);
  // Daily series in Tashkent days, zero-filled.
  const byDay = new Map<string, { revenue: number; orders: number }>();
  for (let i = days - 1; i >= 0; i--) byDay.set(dayKey(new Date(now - i * DAY)), { revenue: 0, orders: 0 });
  for (const o of cur.orders) {
    const k = dayKey(o.createdAt);
    const d = byDay.get(k);
    if (d) {
      d.revenue += o.total;
      d.orders++;
    }
  }
  const delta = (a: number, b: number) => (b ? (a - b) / b : null);
  const top = await topProducts(shopId, start, end);
  return {
    kpi: {
      revenue: { value: cur.revenue, delta: delta(cur.revenue, prev.revenue) },
      orders: { value: cur.count, delta: delta(cur.count, prev.count) },
      aov: { value: cur.aov, delta: delta(cur.aov, prev.aov) },
      units: { value: cur.units, delta: delta(cur.units, prev.units) },
      views: { value: cur.views, delta: delta(cur.views, prev.views) },
      conversion: { value: cur.conversion, delta: delta(cur.conversion, prev.conversion) },
      cancelRate: { value: cur.count + cur.cancelled ? cur.cancelled / (cur.count + cur.cancelled) : 0, delta: null },
      returnRate: { value: cur.count ? cur.returns / cur.count : 0, delta: null },
    },
    series: [...byDay.entries()].map(([day, v]) => ({ day, ...v })),
    top,
  };
}

async function topProducts(shopId: string, from: Date, to: Date) {
  const items = await db.orderItem.groupBy({ by: ["productId"], where: { order: { shopId, createdAt: { gte: from, lt: to }, status: { in: LIVE } } }, _sum: { quantity: true, unitPrice: true }, _count: { _all: true } });
  const revenueRows = await db.$queryRaw<Array<{ productId: string; revenue: bigint }>>`
    SELECT oi."productId", SUM(oi."unitPrice" * oi.quantity - oi.discount)::bigint AS revenue
    FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
    WHERE o."shopId" = ${shopId} AND o."createdAt" >= ${from} AND o."createdAt" < ${to} AND o.status::text IN ('PLACED','CONFIRMED','PACKED','SHIPPED','DELIVERED','RETURNED')
    GROUP BY 1`;
  const ids = items.map((i) => i.productId);
  const [products, views] = await Promise.all([
    db.product.findMany({ where: { id: { in: ids } }, select: { id: true, titleUz: true, slug: true, media: { take: 1, orderBy: { sort: "asc" }, select: { url: true } } } }),
    db.productView.groupBy({ by: ["productId"], where: { productId: { in: ids }, createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
  ]);
  return items
    .map((i) => {
      const p = products.find((x) => x.id === i.productId);
      const revenue = Number(revenueRows.find((r) => r.productId === i.productId)?.revenue ?? 0);
      const v = views.find((x) => x.productId === i.productId)?._count._all ?? 0;
      return { productId: i.productId, title: p?.titleUz ?? "—", slug: p?.slug ?? "", image: p?.media[0]?.url ?? null, units: i._sum.quantity ?? 0, orders: i._count._all, revenue, views: v, conversion: v ? i._count._all / v : 0 };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
}

/** Per-SKU unit economics over the period from real orders, ad spend and returns. */
export async function skuEconomics(shopId: string, days: number) {
  const from = new Date(Date.now() - days * DAY);
  const lines = await db.orderItem.findMany({
    where: { order: { shopId, createdAt: { gte: from }, status: { in: LIVE } } },
    select: { variantId: true, quantity: true, unitPrice: true, discount: true, commissionAmount: true, returns: { select: { quantity: true, status: true } }, order: { select: { logisticsFee: true, items: { select: { quantity: true } } } }, variant: { select: { sku: true, costPrice: true, product: { select: { titleUz: true, id: true } } } } },
  });
  const campaigns = await db.adCampaign.findMany({ where: { shopId }, select: { productIds: true, stats: { where: { day: { gte: dayKey(from) } }, select: { spend: true } } } });
  const adByProduct = new Map<string, number>();
  for (const c of campaigns) {
    const spend = c.stats.reduce((s, x) => s + x.spend, 0);
    if (!c.productIds.length || !spend) continue;
    for (const pid of c.productIds) adByProduct.set(pid, (adByProduct.get(pid) ?? 0) + spend / c.productIds.length);
  }
  type Acc = { sku: string; title: string; productId: string; units: number; revenue: number; commission: number; logistics: number; returned: number; cost: number | null };
  const acc = new Map<string, Acc>();
  for (const l of lines) {
    const a = acc.get(l.variantId) ?? { sku: l.variant.sku, title: l.variant.product.titleUz, productId: l.variant.product.id, units: 0, revenue: 0, commission: 0, logistics: 0, returned: 0, cost: l.variant.costPrice };
    const orderUnits = l.order.items.reduce((s, i) => s + i.quantity, 0) || 1;
    a.units += l.quantity;
    a.revenue += l.unitPrice * l.quantity - l.discount;
    a.commission += l.commissionAmount;
    a.logistics += Math.round((l.order.logisticsFee * l.quantity) / orderUnits);
    a.returned += l.returns.filter((r) => r.status !== "REJECTED").reduce((s, r) => s + r.quantity, 0);
    acc.set(l.variantId, a);
  }
  const productUnits = new Map<string, number>();
  for (const a of acc.values()) productUnits.set(a.productId, (productUnits.get(a.productId) ?? 0) + a.units);
  return [...acc.values()]
    .map((a) => {
      const price = Math.round(a.revenue / a.units);
      const ads = (adByProduct.get(a.productId) ?? 0) / (productUnits.get(a.productId) || 1);
      const e = unitEconomics({ price, commissionRate: a.revenue ? a.commission / a.revenue : 0, logisticsFee: Math.round(a.logistics / a.units), adSpendPerUnit: ads, returnRate: a.units ? a.returned / a.units : 0, costPrice: a.cost });
      return { sku: a.sku, title: a.title, units: a.units, returnRate: a.units ? a.returned / a.units : 0, ...e };
    })
    .sort((x, y) => y.units - x.units)
    .slice(0, 50);
}
