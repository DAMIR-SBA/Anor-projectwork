import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { cardsByIds } from "@/server/services/catalog";
import { locText } from "@/lib/localized";

/** GET /api/v1/products/compare?ids=a,b,c — cards + merged spec rows for up to 4 products. */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 4);
  const locale = req.nextUrl.searchParams.get("locale") ?? "uz";
  const [cards, rows] = await Promise.all([cardsByIds(ids, locale), db.product.findMany({ where: { id: { in: ids } }, select: { id: true, specs: true, titleUz: true, titleRu: true, brand: { select: { name: true } }, shop: { select: { name: true } } } })]);
  const keys: string[] = [];
  const values: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    values[r.id] = {};
    for (const s of (r.specs as Array<{ keyUz: string; keyRu: string; value: string }> | null) ?? []) {
      const key = locale === "ru" ? s.keyRu : locText(s.keyUz, locale);
      if (!keys.includes(key)) keys.push(key);
      values[r.id][key] = s.value;
    }
    values[r.id]["Brand"] = r.brand?.name ?? "—";
    values[r.id]["Shop"] = locText(r.shop.name, locale);
  }
  return NextResponse.json({ cards, keys: ["Brand", "Shop", ...keys], values });
}
