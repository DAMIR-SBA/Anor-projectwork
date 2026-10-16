import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, getStaffSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { invoicePdf } from "@/server/services/invoice-pdf";

/** GET /api/invoices/:id — bank-transfer invoice PDF (the buying company, or staff with finance.view). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const inv = await db.invoice.findUnique({ where: { id }, select: { userId: true } });
  if (!inv) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const [user, staff] = await Promise.all([getCurrentUser(), getStaffSession()]);
  if (user?.id !== inv.userId && !staff?.permissions.has("finance.view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const locale = req.nextUrl.searchParams.get("locale") === "ru" ? "ru" : "uz";
  const { pdf, number } = await invoicePdf(id, locale);
  return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="anor-${number}.pdf"`, "Cache-Control": "private, no-store" } });
}
