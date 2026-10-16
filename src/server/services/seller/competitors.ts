import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { syncProductPrice } from "@/server/services/products";
import { pricePosition } from "@/lib/seller";
import { locText } from "@/lib/localized";

type Offer = { ownId: string; id: string; slug: string; titleUz: string; price: number; rating: number; soldCount: number; shop: string; match: "barcode" | "similar"; sim: number };

/**
 * Competing offers for the shop's active products: other shops' listings with the same barcode,
 * or (same category and brand) a title trigram similarity ≥ 0.45. Top 5 per product.
 */
export async function competitorPrices(shopId: string, locale: string, opts: { page: number; onlyExpensive?: boolean }, pageSize = 20) {
  const own = await db.product.findMany({
    where: { shopId, status: "ACTIVE", deletedAt: null },
    orderBy: { soldCount: "desc" },
    select: { id: true, slug: true, titleUz: true, price: true, media: { take: 1, orderBy: { sort: "asc" }, select: { url: true } } },
    take: 500,
  });
  if (!own.length) return { rows: [], total: 0, summary: { cheapest: 0, competitive: 0, expensive: 0, alone: 0 } };
  const ids = own.map((p) => p.id);
  const offers = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL pg_trgm.similarity_threshold = 0.45`;
    return tx.$queryRaw<Offer[]>`
      SELECT o.id AS "ownId", c.id, c.slug, c."titleUz", c.price, c.rating, c."soldCount", c.shop, c.match, c.sim
      FROM "Product" o
      CROSS JOIN LATERAL (
        SELECT p.id, p.slug, p."titleUz", p.price, p.rating, p."soldCount", s.name AS shop,
          CASE WHEN bc.hit THEN 'barcode' ELSE 'similar' END AS match,
          similarity(o."titleUz", p."titleUz")::float AS sim
        FROM "Product" p
        JOIN "Shop" s ON s.id = p."shopId" AND s.status = 'APPROVED'
        CROSS JOIN LATERAL (
          SELECT EXISTS (
            SELECT 1 FROM "Variant" v1 JOIN "Variant" v2 ON v2.barcode = v1.barcode
            WHERE v1."productId" = o.id AND v2."productId" = p.id AND v1.barcode IS NOT NULL
          ) AS hit
        ) bc
        WHERE p."shopId" <> o."shopId" AND p.status = 'ACTIVE' AND p."deletedAt" IS NULL AND p.price > 0
          AND (bc.hit OR (p."categoryId" = o."categoryId" AND (o."brandId" IS NULL OR p."brandId" = o."brandId") AND o."titleUz" % p."titleUz"))
        ORDER BY bc.hit DESC, sim DESC
        LIMIT 5
      ) c
      WHERE o.id IN (${Prisma.join(ids)})`;
  });
  const byOwn = new Map<string, Offer[]>();
  for (const o of offers) byOwn.set(o.ownId, [...(byOwn.get(o.ownId) ?? []), o]);
  const all = own.map((p) => {
    const list = (byOwn.get(p.id) ?? []).sort((a, b) => a.price - b.price);
    return {
      id: p.id,
      slug: p.slug,
      title: locText(p.titleUz, locale),
      image: p.media[0]?.url ?? null,
      price: p.price,
      position: pricePosition(
        p.price,
        list.map((o) => o.price),
      ),
      offers: list.map((o) => ({ id: o.id, slug: o.slug, title: locText(o.titleUz, locale), price: o.price, rating: o.rating, sold: o.soldCount, shop: o.shop, match: o.match })),
    };
  });
  const summary = { cheapest: 0, competitive: 0, expensive: 0, alone: 0 };
  for (const r of all) summary[r.position.status]++;
  // Products with competition first, most overpriced on top.
  const sorted = all.filter((r) => (opts.onlyExpensive ? r.position.status === "expensive" : true)).sort((a, b) => (b.position.diff ?? -1) - (a.position.diff ?? -1));
  return { rows: sorted.slice((opts.page - 1) * pageSize, opts.page * pageSize), total: sorted.length, summary };
}

/** "Match price": sets the default variant to the given price (records price history). */
export async function matchPrice(shopId: string, productId: string, price: number) {
  const v = await db.variant.findFirst({ where: { product: { id: productId, shopId, deletedAt: null } }, orderBy: [{ isDefault: "desc" }, { price: "asc" }] });
  if (!v) throw new AppError("notFound");
  if (price < 1000 || price > v.price * 2) throw new AppError("invalidInput");
  await db.variant.update({ where: { id: v.id }, data: { price, oldPrice: v.oldPrice && v.oldPrice > price ? v.oldPrice : null } });
  await db.priceHistory.create({ data: { variantId: v.id, price } });
  await syncProductPrice(productId);
  return { price };
}
