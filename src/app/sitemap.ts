import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db";

const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

// Built on request (not at build time, when there may be no database) and cached for an hour.
export const dynamic = "force-dynamic";

/** Every public URL once, with its Cyrillic (/oz) and Russian (/ru) alternates. */
function entry(path: string, lastModified?: Date, priority = 0.5, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "weekly"): MetadataRoute.Sitemap[number] {
  const p = path === "/" ? "" : path;
  return {
    url: `${APP_URL}${p || "/"}`,
    lastModified,
    changeFrequency,
    priority,
    alternates: { languages: { uz: `${APP_URL}${p || "/"}`, "uz-Cyrl": `${APP_URL}/oz${p}`, ru: `${APP_URL}/ru${p}` } },
  };
}

const publicUrls = unstable_cache(
  async () => {
    const [categories, products, shops, brands, articles] = await Promise.all([
      db.category.findMany({ where: { isActive: true }, select: { slug: true } }),
      // 45k keeps the file under the 50k-URL sitemap limit together with everything else.
      db.product.findMany({ where: { status: "ACTIVE", deletedAt: null, shop: { status: "APPROVED" } }, select: { slug: true, updatedAt: true }, orderBy: { soldCount: "desc" }, take: 45_000 }),
      db.shop.findMany({ where: { status: "APPROVED" }, select: { slug: true, updatedAt: true } }),
      db.brand.findMany({ select: { slug: true } }),
      db.helpArticle.findMany({ select: { slug: true } }),
    ]);
    return { categories, products: products.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt.toISOString() })), shops: shops.map((s) => ({ slug: s.slug, updatedAt: s.updatedAt.toISOString() })), brands, articles };
  },
  ["sitemap-urls"],
  { revalidate: 3600 },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics = ["/", "/catalog", "/deals", "/made-in-uzbekistan", "/nasiya", "/plus", "/videos", "/live", "/trade-in", "/gift-cards", "/pvz", "/help", "/developers", "/legal/privacy", "/legal/terms", "/legal/cookies"];
  const { categories, products, shops, brands, articles } = await publicUrls();
  return [
    ...statics.map((p) => entry(p, undefined, p === "/" ? 1 : 0.6, p === "/" || p === "/deals" ? "daily" : "weekly")),
    ...categories.map((c) => entry(`/c/${c.slug}`, undefined, 0.8, "daily")),
    ...products.map((p) => entry(`/p/${p.slug}`, new Date(p.updatedAt), 0.7, "daily")),
    ...shops.map((s) => entry(`/shop/${s.slug}`, new Date(s.updatedAt), 0.5)),
    ...brands.map((b) => entry(`/brand/${b.slug}`, undefined, 0.4)),
    ...articles.map((a) => entry(`/help/${a.slug}`, undefined, 0.3, "monthly")),
  ];
}
