import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { activeShop } from "@/server/services/seller/context";
import { exportCsv } from "@/server/services/seller/products";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const shop = await activeShop(user.id).catch(() => null);
  if (!shop) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const csv = await exportCsv(shop.id);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="anor-${shop.slug}-products.csv"`, "Cache-Control": "no-store" } });
}
