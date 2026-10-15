import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { searchProductIds, trendingSearches } from "@/server/services/catalog";
import { normalizeSearch } from "@/lib/search-text";
import { loc } from "@/lib/localized";
import { rateLimit } from "@/server/security/rate-limit";
import { ipFromHeaders } from "@/server/security/request";

/** GET /api/v1/search/suggest?q= — autocomplete (products, categories, brands) + trending queries. */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(`suggest:${ipFromHeaders(req.headers)}`, 120, 60);
  if (!rl.success) return NextResponse.json({ suggestions: [], trending: [], history: [] }, { status: 429 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const locale = req.nextUrl.searchParams.get("locale") ?? "uz";
  const trending = await trendingSearches(8);
  const nq = normalizeSearch(q);
  if (!nq) return NextResponse.json({ suggestions: [], trending, history: [] });

  const [ids, cats, brands] = await Promise.all([
    searchProductIds(nq, 6),
    db.category.findMany({ where: { isActive: true, OR: [{ nameUz: { contains: nq, mode: "insensitive" } }, { nameRu: { contains: nq, mode: "insensitive" } }] }, take: 3 }),
    db.brand.findMany({ where: { name: { contains: nq, mode: "insensitive" } }, take: 2 }),
  ]);
  const products = ids.length ? await db.product.findMany({ where: { id: { in: ids } }, include: { media: { take: 1, orderBy: { sort: "asc" } } } }) : [];
  const ordered = ids.map((id) => products.find((p) => p.id === id)!).filter(Boolean);
  return NextResponse.json({
    trending,
    history: [],
    suggestions: [
      ...cats.map((c) => ({ type: "category", label: loc(c, "name", locale), href: `/c/${c.slug}` })),
      ...brands.map((b) => ({ type: "brand", label: b.name, href: `/brand/${b.slug}` })),
      ...ordered.map((p) => ({ type: "product", label: loc(p, "title", locale), href: `/p/${p.slug}`, image: p.media[0]?.url ?? null })),
    ],
  });
}
