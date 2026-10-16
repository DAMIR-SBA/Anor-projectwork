import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { activeShop } from "@/server/services/seller/context";
import { payoutDetail } from "@/server/services/seller/finance";
import { toXlsxBook } from "@/server/services/export";

/** Payout reconciliation: summary sheet + every order included in the settlement. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const shop = await activeShop(user.id).catch(() => null);
  if (!shop) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const d = await payoutDetail(shop.id, (await ctx.params).id);
  if (!d) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const p = d.payout;
  const buf = await toXlsxBook([
    { name: "Payout", columns: ["field", "value"], rows: [["periodStart", p.periodStart], ["periodEnd", p.periodEnd], ["orders", p.ordersCount], ["gross", p.gross], ["commission", -p.commission], ["logistics", -p.logistics], ["adSpend", -p.adSpend], ["penalties", -p.penalties], ["refunds", -p.refunds], ["net", p.net], ["status", p.status], ["reference", p.reference ?? ""]].map(([field, value]) => ({ field, value })) },
    { name: "Orders", columns: ["number", "deliveredAt", "gross", "commission", "logistics", "net", "paymentMethod"], rows: d.lines },
  ]);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="anor-payout-${p.periodStart.toISOString().slice(0, 10)}.xlsx"`, "Cache-Control": "no-store" } });
}
