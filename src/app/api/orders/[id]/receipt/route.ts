import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getStaffSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { receiptPdf } from "@/server/services/receipt-pdf";

/** GET /api/orders/:id/receipt — fiscal receipt PDF (buyer, the shop owner, or staff with orders.view). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const order = await db.order.findUnique({ where: { id }, include: { shop: { select: { ownerId: true } }, receipt: true } });
  if (!order?.receipt) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const user = await getCurrentUser();
  const staff = await getStaffSession();
  const allowed = user?.id === order.userId || user?.id === order.shop.ownerId || staff?.permissions.has("orders.view");
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const locale = req.nextUrl.searchParams.get("locale") === "ru" ? "ru" : "uz";
  const pdf = await receiptPdf(id, locale);
  return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="anor-receipt-${order.number}.pdf"` } });
}
