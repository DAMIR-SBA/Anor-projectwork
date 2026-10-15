import { NextResponse, type NextRequest } from "next/server";
import { listProducts, type Filters, type Sort } from "@/server/services/catalog";
import { routing } from "@/i18n/routing";

/** GET /api/v1/products — public catalog listing (used by infinite scroll and native apps). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  const locale = (routing.locales as readonly string[]).includes(sp.get("locale") ?? "") ? sp.get("locale")! : "uz";
  const filters: Filters = {
    category: sp.get("category") ?? undefined,
    q: sp.get("q") ?? undefined,
    brands: sp.getAll("brand").filter(Boolean),
    minPrice: num("min"),
    maxPrice: num("max"),
    rating: num("rating"),
    inStock: sp.get("stock") === "1",
    delivery: (sp.get("delivery") as Filters["delivery"]) ?? undefined,
    halal: sp.get("halal") === "1",
    madeInUz: sp.get("uz") === "1",
    used: sp.get("used") === "1",
    shopSlug: sp.get("shop") ?? undefined,
    brandSlug: sp.get("brandSlug") ?? undefined,
    ids: sp.get("ids") ? sp.get("ids")!.split(",").slice(0, 50) : undefined,
    sort: (sp.get("sort") as Sort) ?? undefined,
    page: num("page") ?? 1,
    pageSize: num("pageSize") ?? 24,
  };
  const data = await listProducts(filters, locale);
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
}
