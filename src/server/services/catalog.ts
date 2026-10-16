import "server-only";
import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { loc, locText } from "@/lib/localized";
import { bestMonthly, DEFAULT_PLANS, type Plan } from "@/lib/installment";
import { normalizeSearch } from "@/lib/search-text";
import { deliveryDays } from "@/lib/delivery";
import type { ProductCardData } from "@/lib/types";

export const getPlans = unstable_cache(
  async (): Promise<Plan[]> => {
    const rows = await db.installmentPlan.findMany({ where: { isActive: true }, orderBy: { months: "asc" } });
    return rows.length ? rows : DEFAULT_PLANS;
  },
  ["installment-plans"],
  { revalidate: 600, tags: ["plans"] },
);

/** Card relations; a function so the campaign time window is evaluated per request. */
export const cardInclude = () => ({
  media: { where: { type: "IMAGE" as const }, orderBy: { sort: "asc" as const }, take: 2 },
  variants: { orderBy: [{ isDefault: "desc" as const }, { price: "asc" as const }], select: { id: true, stock: true, price: true, oldPrice: true } },
  shop: { select: { name: true, slug: true, isOfficial: true } },
  category: { select: { nasiyaEligible: true } },
  campaignItems: {
    where: { status: "APPROVED" as const, campaign: { status: "ACTIVE" as const, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } } },
    select: { salePrice: true, campaign: { select: { endsAt: true, type: true } } },
    take: 1,
  },
}) satisfies Prisma.ProductInclude;

export type CardProduct = Prisma.ProductGetPayload<{ include: ReturnType<typeof cardInclude> }>;

/** Shape a product row into the card DTO (localized, with active campaign price and monthly installment). */
export function toCard(p: CardProduct, locale: string, plans: Plan[]): ProductCardData {
  const campaign = p.campaignItems[0];
  const price = campaign ? Math.min(campaign.salePrice, p.price) : p.price;
  const oldPrice = campaign ? Math.max(p.oldPrice ?? p.price, p.price) : p.oldPrice;
  const inStock = p.variants.some((v) => v.stock > 0);
  const nasiyaEligible = p.nasiyaEligible ?? p.category.nasiyaEligible;
  const monthly = nasiyaEligible ? bestMonthly(price, plans) : null;
  return {
    id: p.id,
    slug: p.slug,
    title: loc(p, "title", locale),
    image: p.media[0]?.url ?? null,
    hoverImage: p.media[1]?.url ?? null,
    price,
    oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
    discountPct: oldPrice && oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0,
    rating: p.rating,
    reviewCount: p.reviewCount,
    soldCount: p.soldCount,
    monthly: monthly ? { amount: monthly.monthly, months: monthly.months } : null,
    variantId: p.variants.find((v) => v.stock > 0)?.id ?? p.variants[0]?.id ?? null,
    variantCount: p.variants.length,
    inStock,
    shopName: locText(p.shop.name, locale),
    badges: {
      halal: p.isHalal,
      madeInUz: p.madeInUz,
      official: p.shop.isOfficial,
      preorder: p.isPreorder,
      used: p.condition !== "NEW",
      fast: p.fulfillment === "FBO",
      flash: campaign?.campaign.type === "FLASH_SALE",
      lowest90: !!p.lowest90 && price <= p.lowest90,
    },
    dealEndsAt: campaign?.campaign.endsAt.toISOString() ?? null,
  };
}

export async function cardsByIds(ids: string[], locale: string): Promise<ProductCardData[]> {
  if (!ids.length) return [];
  const [rows, plans] = await Promise.all([db.product.findMany({ where: { id: { in: ids }, status: "ACTIVE", deletedAt: null, shop: LIVE_SHOP }, include: cardInclude() }), getPlans()]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => (byId.has(id) ? [toCard(byId.get(id)!, locale, plans)] : []));
}

/** Category + all descendants (ids). */
export async function categorySubtree(slug: string) {
  const all = await db.category.findMany({ where: { isActive: true }, select: { id: true, parentId: true, slug: true } });
  const root = all.find((c) => c.slug === slug);
  if (!root) return null;
  const ids = [root.id];
  for (let i = 0; i < ids.length; i++) for (const c of all) if (c.parentId === ids[i]) ids.push(c.id);
  return ids;
}

export async function categoryBySlug(slug: string) {
  const cat = await db.category.findUnique({ where: { slug }, include: { children: { where: { isActive: true }, orderBy: { sort: "asc" } } } });
  if (!cat) return null;
  const path: Array<{ slug: string; nameUz: string; nameRu: string; nameCyrl: string | null }> = [];
  let cur: typeof cat | null = cat;
  while (cur) {
    path.unshift({ slug: cur.slug, nameUz: cur.nameUz, nameRu: cur.nameRu, nameCyrl: cur.nameCyrl });
    cur = cur.parentId ? await db.category.findUnique({ where: { id: cur.parentId }, include: { children: true } }) : null;
  }
  return { ...cat, path };
}

export type Sort = "popular" | "new" | "price_asc" | "price_desc" | "rating" | "discount";

export type Filters = {
  category?: string;
  q?: string;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock?: boolean;
  delivery?: "today" | "tomorrow";
  halal?: boolean;
  madeInUz?: boolean;
  used?: boolean;
  shopSlug?: string;
  brandSlug?: string;
  ids?: string[];
  sort?: Sort;
  page?: number;
  pageSize?: number;
};

/** Storefront visibility: only products of approved (not suspended) shops. */
export const LIVE_SHOP = { status: "APPROVED" } as const;

const ORDER: Record<Sort, Prisma.ProductOrderByWithRelationInput[]> = {
  // Restricted shops (low fulfillment score) rank below everyone else in the default order.
  popular: [{ shop: { restrictedAt: { sort: "asc", nulls: "first" } } }, { soldCount: "desc" }, { rating: "desc" }],
  new: [{ publishedAt: "desc" }],
  price_asc: [{ price: "asc" }],
  price_desc: [{ price: "desc" }],
  rating: [{ rating: "desc" }, { reviewCount: "desc" }],
  discount: [{ discountPct: "desc" }, { soldCount: "desc" }],
};

/**
 * Typo-tolerant search: every query word must match either as a substring or by trigram
 * word-similarity (handles "smartfn", "nautbuk", Cyrillic/Latin mixes). Ranked by FTS rank + similarity.
 */
export async function searchProductIds(raw: string, limit = 400): Promise<string[]> {
  const q = normalizeSearch(raw);
  if (!q) return [];
  const words = q.split(" ").filter((w) => w.length > 0).slice(0, 6);
  const conds = words.map((w) => Prisma.sql`("searchText" ILIKE ${"%" + w + "%"} OR ${w} <% "searchText")`);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL pg_trgm.word_similarity_threshold = 0.45`;
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Product"
      WHERE status = 'ACTIVE' AND "deletedAt" IS NULL AND ${Prisma.join(conds, " AND ")}
      ORDER BY
        ts_rank(to_tsvector('simple', "searchText"), plainto_tsquery('simple', ${q})) * 2
        + word_similarity(${q}, "searchText")
        + ln(1 + "soldCount") * 0.02 DESC
      LIMIT ${limit}`;
    return rows.map((r) => r.id);
  });
}

/** "Did you mean": closest known title/category when a search has no results. */
export async function suggestCorrection(raw: string): Promise<string | null> {
  const q = normalizeSearch(raw);
  if (q.length < 3) return null;
  const rows = await db.$queryRaw<Array<{ term: string; score: number }>>`
    SELECT term, similarity(term, ${q}) AS score FROM (
      SELECT lower("titleUz") AS term FROM "Product" WHERE status = 'ACTIVE'
      UNION SELECT lower("nameUz") FROM "Category"
      UNION SELECT lower("nameRu") FROM "Category"
      UNION SELECT lower(name) FROM "Brand"
    ) t ORDER BY score DESC LIMIT 1`;
  return rows[0] && rows[0].score > 0.2 ? rows[0].term : null;
}

export async function buildWhere(f: Filters): Promise<{ where: Prisma.ProductWhereInput; searchIds: string[] | null }> {
  const where: Prisma.ProductWhereInput = { status: "ACTIVE", deletedAt: null, shop: LIVE_SHOP };
  const and: Prisma.ProductWhereInput[] = [];
  if (f.category) {
    const ids = await categorySubtree(f.category);
    and.push({ categoryId: { in: ids ?? [] } });
  }
  let searchIds: string[] | null = null;
  if (f.q) {
    searchIds = await searchProductIds(f.q);
    and.push({ id: { in: searchIds } });
  }
  if (f.ids) and.push({ id: { in: f.ids } });
  if (f.brands?.length) and.push({ brand: { slug: { in: f.brands } } });
  if (f.brandSlug) and.push({ brand: { slug: f.brandSlug } });
  if (f.shopSlug) and.push({ shop: { slug: f.shopSlug } });
  if (f.minPrice != null) and.push({ price: { gte: f.minPrice } });
  if (f.maxPrice != null) and.push({ price: { lte: f.maxPrice } });
  if (f.rating) and.push({ rating: { gte: f.rating } });
  if (f.inStock) and.push({ variants: { some: { stock: { gt: 0 } } } });
  if (f.halal) and.push({ isHalal: true });
  if (f.madeInUz) and.push({ madeInUz: true });
  if (f.used) and.push({ condition: { not: "NEW" } });
  if (f.delivery) {
    // Tashkent: today = FBO before cutoff; tomorrow = FBO or FBS.
    const today = deliveryDays("FBO", "toshkent_sh", "COURIER") === 0;
    and.push(f.delivery === "today" ? (today ? { fulfillment: "FBO" } : { id: "__none__" }) : { fulfillment: { in: ["FBO", "FBS"] } });
  }
  if (and.length) where.AND = and;
  return { where, searchIds };
}

export async function listProducts(f: Filters, locale: string) {
  const pageSize = Math.min(48, f.pageSize ?? 24);
  const page = Math.max(1, f.page ?? 1);
  const { where, searchIds } = await buildWhere(f);
  const plans = await getPlans();
  // Search keeps relevance order unless the user picks another sort.
  if (searchIds && (!f.sort || f.sort === "popular")) {
    const matching = await db.product.findMany({ where, select: { id: true, shop: { select: { restrictedAt: true } } } });
    const allowed = new Set(matching.filter((m) => !m.shop.restrictedAt).map((m) => m.id));
    const demoted = new Set(matching.filter((m) => m.shop.restrictedAt).map((m) => m.id));
    const ordered = [...searchIds.filter((id) => allowed.has(id)), ...searchIds.filter((id) => demoted.has(id))];
    const slice = ordered.slice((page - 1) * pageSize, page * pageSize);
    return { items: await cardsByIds(slice, locale), total: ordered.length, page, pageSize };
  }
  const [rows, total] = await Promise.all([
    db.product.findMany({ where, include: cardInclude(), orderBy: ORDER[f.sort ?? "popular"], skip: (page - 1) * pageSize, take: pageSize }),
    db.product.count({ where }),
  ]);
  return { items: rows.map((r) => toCard(r, locale, plans)), total, page, pageSize };
}

/** Facets for the filter sidebar, computed over the filter set minus the facet itself. */
export async function facets(f: Filters) {
  const { where } = await buildWhere({ ...f, brands: undefined, minPrice: undefined, maxPrice: undefined });
  const [brandGroups, price] = await Promise.all([
    db.product.groupBy({ by: ["brandId"], where: { ...where, brandId: { not: null } }, _count: { _all: true } }),
    db.product.aggregate({ where, _min: { price: true }, _max: { price: true } }),
  ]);
  const brands = await db.brand.findMany({ where: { id: { in: brandGroups.map((b) => b.brandId!).filter(Boolean) } } });
  return {
    brands: brandGroups
      .map((g) => ({ slug: brands.find((b) => b.id === g.brandId)?.slug ?? "", name: brands.find((b) => b.id === g.brandId)?.name ?? "", count: g._count._all }))
      .filter((b) => b.slug)
      .sort((a, b) => b.count - a.count),
    priceMin: price._min.price ?? 0,
    priceMax: price._max.price ?? 0,
  };
}

export async function getProduct(slug: string) {
  return db.product.findFirst({
    where: { slug, deletedAt: null, status: { in: ["ACTIVE", "ARCHIVED"] }, shop: LIVE_SHOP },
    include: {
      media: { orderBy: { sort: "asc" } },
      variants: { orderBy: [{ isDefault: "desc" }, { price: "asc" }], include: { stocks: { include: { warehouse: { select: { type: true, region: true } } } } } },
      shop: { select: { id: true, slug: true, name: true, logoUrl: true, rating: true, reviewCount: true, isOfficial: true, fulfillmentScore: true, city: true, tier: true, responseTimeMins: true, createdAt: true, _count: { select: { products: true } } } },
      brand: true,
      category: true,
      campaignItems: {
        where: { status: "APPROVED", campaign: { status: "ACTIVE", startsAt: { lte: new Date() }, endsAt: { gt: new Date() } } },
        include: { campaign: true },
        take: 1,
      },
    },
  });
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

export async function priceHistory(variantId: string) {
  return db.priceHistory.findMany({ where: { variantId, recordedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } }, orderBy: { recordedAt: "asc" }, select: { price: true, recordedAt: true } });
}

export async function similarProducts(p: { id: string; categoryId: string; price: number }, locale: string, take = 12) {
  const rows = await db.product.findMany({
    where: { categoryId: p.categoryId, id: { not: p.id }, status: "ACTIVE", deletedAt: null, shop: LIVE_SHOP, price: { gte: Math.round(p.price * 0.4), lte: Math.round(p.price * 2.2) } },
    include: cardInclude(),
    orderBy: [{ soldCount: "desc" }],
    take,
  });
  const plans = await getPlans();
  if (rows.length < 4) {
    const parent = await db.category.findUnique({ where: { id: p.categoryId }, select: { parentId: true } });
    if (parent?.parentId) {
      const more = await db.product.findMany({ where: { category: { parentId: parent.parentId }, id: { notIn: [p.id, ...rows.map((r) => r.id)] }, status: "ACTIVE", deletedAt: null, shop: LIVE_SHOP }, include: cardInclude(), orderBy: { soldCount: "desc" }, take: take - rows.length });
      rows.push(...more);
    }
  }
  return rows.map((r) => toCard(r, locale, plans));
}

/** "Customers also bought": co-occurrence in the same order group; falls back to the shop's bestsellers. */
export async function alsoBought(productId: string, shopId: string, locale: string, take = 10) {
  const rows = await db.$queryRaw<Array<{ productId: string; n: bigint }>>`
    SELECT oi2."productId", COUNT(*) AS n
    FROM "OrderItem" oi1
    JOIN "Order" o1 ON o1.id = oi1."orderId"
    JOIN "Order" o2 ON o2."groupId" = o1."groupId"
    JOIN "OrderItem" oi2 ON oi2."orderId" = o2.id AND oi2."productId" <> oi1."productId"
    WHERE oi1."productId" = ${productId}
    GROUP BY oi2."productId" ORDER BY n DESC LIMIT ${take}`;
  let ids = rows.map((r) => r.productId);
  if (ids.length < 4) {
    const fill = await db.product.findMany({ where: { shopId, id: { notIn: [productId, ...ids] }, status: "ACTIVE" }, orderBy: { soldCount: "desc" }, select: { id: true }, take: take - ids.length });
    ids = [...ids, ...fill.map((f) => f.id)];
  }
  return cardsByIds(ids, locale);
}

export async function recordView(productId: string, userId: string | null, anonId: string | null) {
  await db.$transaction([
    db.productView.create({ data: { productId, userId, anonId: userId ? null : anonId } }),
    db.product.update({ where: { id: productId }, data: { viewCount: { increment: 1 } } }),
  ]);
}

export async function recentlyViewedIds(userId: string | null, anonId: string | null, excludeId?: string, take = 12): Promise<string[]> {
  if (!userId && !anonId) return [];
  const rows = await db.productView.findMany({
    where: userId ? { userId } : { anonId },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { productId: true },
  });
  return [...new Set(rows.map((r) => r.productId))].filter((id) => id !== excludeId).slice(0, take);
}

/**
 * Personalized recommendations: categories the user viewed/bought recently weighted by recency,
 * then bestsellers in those categories they have not bought yet. Falls back to global bestsellers.
 */
export async function recommendedIds(userId: string | null, anonId: string | null, take = 12): Promise<string[]> {
  const viewed = userId || anonId ? await db.productView.findMany({ where: userId ? { userId } : { anonId }, orderBy: { createdAt: "desc" }, take: 40, select: { product: { select: { categoryId: true, id: true } } } }) : [];
  const weights = new Map<string, number>();
  viewed.forEach((v, i) => weights.set(v.product.categoryId, (weights.get(v.product.categoryId) ?? 0) + 1 / (1 + i / 5)));
  const topCats = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
  const seen = new Set(viewed.map((v) => v.product.id));
  const pool = topCats.length
    ? await db.product.findMany({ where: { categoryId: { in: topCats }, status: "ACTIVE", deletedAt: null, shop: LIVE_SHOP }, orderBy: [{ rating: "desc" }, { soldCount: "desc" }], select: { id: true }, take: take * 2 })
    : [];
  const ids = pool.map((p) => p.id).filter((id) => !seen.has(id));
  if (ids.length < take) {
    const best = await db.product.findMany({ where: { status: "ACTIVE", deletedAt: null, shop: LIVE_SHOP, id: { notIn: ids } }, orderBy: [{ soldCount: "desc" }], select: { id: true }, take: take - ids.length });
    ids.push(...best.map((b) => b.id));
  }
  return ids.slice(0, take);
}

export async function trendingSearches(take = 8): Promise<string[]> {
  const rows = await db.searchQuery.groupBy({ by: ["query"], where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) }, resultsCount: { gt: 0 } }, _count: { query: true }, orderBy: { _count: { query: "desc" } }, take });
  const fallback = ["iphone", "krossovka", "choynak", "atlas", "noutbuk", "asal", "do‘ppi", "quloqchin"];
  const out = rows.map((r) => r.query);
  for (const f of fallback) if (out.length < take && !out.includes(f)) out.push(f);
  return out;
}
