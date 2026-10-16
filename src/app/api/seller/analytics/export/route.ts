import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { activeShop } from "@/server/services/seller/context";
import { skuEconomics } from "@/server/services/seller/analytics";
import { toXlsxBook } from "@/server/services/export";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const shop = await activeShop(user.id).catch(() => null);
  if (!shop) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 30));
  const from = new Date(Date.now() - days * 86_400_000);
  const [orders, sku] = await Promise.all([
    db.order.findMany({ where: { shopId: shop.id, createdAt: { gte: from }, status: { not: "PENDING_PAYMENT" } }, orderBy: { createdAt: "asc" }, include: { items: true } }),
    skuEconomics(shop.id, days),
  ]);
  const buf = await toXlsxBook([
    {
      name: "Orders",
      columns: ["number", "createdAt", "status", "fulfillment", "items", "subtotal", "discount", "commission", "logistics", "total"],
      rows: orders.map((o) => ({ number: o.number, createdAt: o.createdAt, status: o.status, fulfillment: o.fulfillment, items: o.items.map((i) => `${i.title} ×${i.quantity}`).join("; "), subtotal: o.subtotal, discount: o.discountTotal, commission: o.items.reduce((s, i) => s + i.commissionAmount, 0), logistics: o.logisticsFee, total: o.total })),
    },
    { name: "SKU economics", columns: ["sku", "title", "units", "price", "commission", "logistics", "ads", "returnsCost", "payout", "cost", "profit", "margin"], rows: sku.map((s) => ({ ...s, margin: s.margin === null ? null : Math.round(s.margin * 1000) / 10 })) },
  ]);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="anor-${shop.slug}-${days}d.xlsx"`, "Cache-Control": "no-store" } });
}
