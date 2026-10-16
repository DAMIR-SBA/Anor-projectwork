import "server-only";
import { db } from "@/server/db";
import { categoryAncestors } from "@/server/services/cart";
import { startOfTashkentDay, tashkentDayKey } from "@/lib/dates";

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

/** Orders that count toward GMV: placed and not cancelled or still awaiting payment. */
const COUNTED = `status NOT IN ('CANCELLED', 'PENDING_PAYMENT')`;

type Totals = { gmv: number; orders: number; buyers: number; newUsers: number; visitors: number; converted: number; cancelled: number; created: number };

async function totals(from: Date, to: Date): Promise<Totals> {
  const [o, u, v] = await Promise.all([
    db.$queryRawUnsafe<Array<{ gmv: bigint; orders: number; buyers: number; cancelled: number; created: number }>>(
      `SELECT COALESCE(SUM(total) FILTER (WHERE ${COUNTED}), 0)::bigint AS gmv,
              (COUNT(*) FILTER (WHERE ${COUNTED}))::int AS orders,
              (COUNT(DISTINCT "userId") FILTER (WHERE ${COUNTED}))::int AS buyers,
              (COUNT(*) FILTER (WHERE status = 'CANCELLED'))::int AS cancelled,
              (COUNT(*) FILTER (WHERE status <> 'PENDING_PAYMENT'))::int AS created
       FROM "Order" WHERE "createdAt" >= $1 AND "createdAt" < $2`,
      from,
      to,
    ),
    db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM "User" u WHERE u."createdAt" >= ${from} AND u."createdAt" < ${to} AND u."deletedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "StaffProfile" s WHERE s."userId" = u.id)`,
    // A visitor (anonymous cookie, else account) converts when their account placed an order in
    // the same period — a share of visitors, so it can never exceed 100%.
    db.$queryRawUnsafe<Array<{ visitors: number; converted: number }>>(
      `SELECT COUNT(DISTINCT COALESCE(v."anonId", v."userId"))::int AS visitors,
              (COUNT(DISTINCT COALESCE(v."anonId", v."userId")) FILTER (WHERE EXISTS (
                SELECT 1 FROM "Order" o WHERE o."userId" = v."userId" AND o."createdAt" >= $1 AND o."createdAt" < $2 AND o.${COUNTED})))::int AS converted
       FROM "ProductView" v WHERE v."createdAt" >= $1 AND v."createdAt" < $2`,
      from,
      to,
    ),
  ]);
  const r = o[0];
  return { gmv: Number(r.gmv), orders: r.orders, buyers: r.buyers, cancelled: r.cancelled, created: r.created, newUsers: u[0].n, visitors: v[0].visitors, converted: v[0].converted };
}

const derive = (t: Totals) => ({
  ...t,
  aov: t.orders ? Math.round(t.gmv / t.orders) : 0,
  conversion: t.visitors ? t.converted / t.visitors : 0,
  cancelRate: t.created ? t.cancelled / t.created : 0,
});

/** Platform analytics for the last `days` Tashkent days, with the previous period for comparison. */
export async function platformAnalytics(days: Range) {
  const end = new Date(startOfTashkentDay().getTime() + 86_400_000);
  const start = new Date(end.getTime() - days * 86_400_000);
  const prevStart = new Date(start.getTime() - days * 86_400_000);

  const [cur, prev, daily, signups, regions, payments, shops, items] = await Promise.all([
    totals(start, end),
    totals(prevStart, start),
    db.$queryRawUnsafe<Array<{ day: string; gmv: bigint; orders: number }>>(
      `SELECT to_char("createdAt" + interval '5 hours', 'YYYY-MM-DD') AS day, COALESCE(SUM(total), 0)::bigint AS gmv, COUNT(*)::int AS orders
       FROM "Order" WHERE "createdAt" >= $1 AND "createdAt" < $2 AND ${COUNTED} GROUP BY 1`,
      start,
      end,
    ),
    db.$queryRaw<Array<{ day: string; n: number }>>`SELECT to_char(u."createdAt" + interval '5 hours', 'YYYY-MM-DD') AS day, COUNT(*)::int AS n FROM "User" u
       WHERE u."createdAt" >= ${start} AND u."createdAt" < ${end} AND u."deletedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "StaffProfile" s WHERE s."userId" = u.id) GROUP BY 1`,
    db.order.groupBy({ by: ["region"], where: { createdAt: { gte: start, lt: end }, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } }, _sum: { total: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ["paymentMethod"], where: { createdAt: { gte: start, lt: end }, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } }, _sum: { total: true }, _count: { _all: true } }),
    db.order.groupBy({ by: ["shopId"], where: { createdAt: { gte: start, lt: end }, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } }, _sum: { total: true, commissionTotal: true }, _count: { _all: true }, orderBy: { _sum: { total: "desc" } }, take: 10 }),
    db.$queryRawUnsafe<Array<{ categoryId: string; revenue: bigint; units: number }>>(
      `SELECT p."categoryId", SUM(i."unitPrice" * i.quantity - i.discount)::bigint AS revenue, SUM(i.quantity)::int AS units
       FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" JOIN "Product" p ON p.id = i."productId"
       WHERE o."createdAt" >= $1 AND o."createdAt" < $2 AND o.${COUNTED} GROUP BY 1`,
      start,
      end,
    ),
  ]);

  // Dense day series so gaps read as zero, not as missing points.
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const usersByDay = new Map(signups.map((d) => [d.day, d.n]));
  const series = Array.from({ length: days }, (_, i) => {
    const day = tashkentDayKey(new Date(start.getTime() + i * 86_400_000 + 3_600_000));
    const d = byDay.get(day);
    return { day, gmv: Number(d?.gmv ?? 0), orders: d?.orders ?? 0, newUsers: usersByDay.get(day) ?? 0 };
  });

  // Roll leaf categories up to their top-level parent.
  const chains = await categoryAncestors();
  const roots = new Map<string, { revenue: number; units: number }>();
  for (const r of items) {
    const chain = chains[r.categoryId] ?? [r.categoryId];
    const root = chain[chain.length - 1];
    const acc = roots.get(root) ?? { revenue: 0, units: 0 };
    acc.revenue += Number(r.revenue);
    acc.units += r.units;
    roots.set(root, acc);
  }
  const [cats, shopRows] = await Promise.all([
    db.category.findMany({ where: { id: { in: [...roots.keys()] } }, select: { id: true, slug: true, nameUz: true, nameRu: true, nameCyrl: true } }),
    db.shop.findMany({ where: { id: { in: shops.map((s) => s.shopId) } }, select: { id: true, name: true, tier: true, rating: true } }),
  ]);

  return {
    days,
    from: tashkentDayKey(start),
    to: tashkentDayKey(new Date(end.getTime() - 1)),
    kpis: { cur: derive(cur), prev: derive(prev) },
    series,
    categories: cats.map((c) => ({ ...c, ...roots.get(c.id)! })).sort((a, b) => b.revenue - a.revenue),
    regions: regions.map((r) => ({ region: r.region, gmv: r._sum.total ?? 0, orders: r._count._all })).sort((a, b) => b.gmv - a.gmv),
    payments: payments.map((p) => ({ method: p.paymentMethod, gmv: p._sum.total ?? 0, orders: p._count._all })).sort((a, b) => b.gmv - a.gmv),
    shops: shops.map((s) => ({ ...shopRows.find((r) => r.id === s.shopId)!, gmv: s._sum.total ?? 0, commission: s._sum.commissionTotal ?? 0, orders: s._count._all })).filter((s) => s.id),
  };
}

export type PlatformAnalytics = Awaited<ReturnType<typeof platformAnalytics>>;

/** Daily GMV/orders for the dashboard sparkline (cheaper than the full report). */
export async function gmvSeries(days: number) {
  const end = new Date(startOfTashkentDay().getTime() + 86_400_000);
  const start = new Date(end.getTime() - days * 86_400_000);
  const rows = await db.$queryRawUnsafe<Array<{ day: string; gmv: bigint; orders: number }>>(
    `SELECT to_char("createdAt" + interval '5 hours', 'YYYY-MM-DD') AS day, COALESCE(SUM(total), 0)::bigint AS gmv, COUNT(*)::int AS orders
     FROM "Order" WHERE "createdAt" >= $1 AND "createdAt" < $2 AND ${COUNTED} GROUP BY 1`,
    start,
    end,
  );
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const day = tashkentDayKey(new Date(start.getTime() + i * 86_400_000 + 3_600_000));
    return { day, gmv: Number(byDay.get(day)?.gmv ?? 0), orders: byDay.get(day)?.orders ?? 0, newUsers: 0 };
  });
}
