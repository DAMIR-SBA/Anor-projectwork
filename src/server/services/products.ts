import "server-only";
import { db } from "@/server/db";
import { buildSearchText } from "@/lib/search-text";

/** Recompute cached product price fields from variants (min price, old price, discount, 90-day low). */
export async function syncProductPrice(productId: string) {
  const variants = await db.variant.findMany({ where: { productId } });
  if (!variants.length) return;
  const min = variants.reduce((m, v) => (v.price < m.price ? v : m), variants[0]);
  const old = min.oldPrice && min.oldPrice > min.price ? min.oldPrice : null;
  const low = await db.priceHistory.aggregate({ _min: { price: true }, where: { variant: { productId }, recordedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } } });
  await db.product.update({
    where: { id: productId },
    data: { price: min.price, oldPrice: old, discountPct: old ? Math.round(((old - min.price) / old) * 100) : 0, lowest90: Math.min(low._min.price ?? min.price, min.price) },
  });
}

export async function syncStock(variantId: string) {
  const agg = await db.warehouseStock.aggregate({ _sum: { quantity: true }, where: { variantId } });
  await db.variant.update({ where: { id: variantId }, data: { stock: agg._sum.quantity ?? 0 } });
}

export async function rebuildSearchText(productId: string, keywords?: string | null) {
  const p = await db.product.findUniqueOrThrow({ where: { id: productId }, include: { brand: true, category: true, variants: { select: { sku: true } } } });
  const chain = [];
  let cur: { nameUz: string; nameRu: string; parentId: string | null } | null = p.category;
  while (cur) {
    chain.push(cur);
    cur = cur.parentId ? await db.category.findUnique({ where: { id: cur.parentId } }) : null;
  }
  await db.product.update({ where: { id: productId }, data: { searchText: buildSearchText({ titleUz: p.titleUz, titleRu: p.titleRu, brand: p.brand?.name, categories: chain, keywords, sku: p.variants.map((v) => v.sku) }) } });
}
