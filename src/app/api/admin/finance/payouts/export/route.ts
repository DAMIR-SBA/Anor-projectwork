import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getStaffSession } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { toXlsxBook } from "@/server/services/export";

/** All payouts of the last 26 weeks for accounting (finance.view). */
export async function GET() {
  const staff = await getStaffSession();
  if (!staff || !staff.permissions.has("finance.view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rows = await db.payout.findMany({ where: { periodStart: { gte: new Date(Date.now() - 26 * 7 * 86_400_000) } }, orderBy: [{ periodStart: "desc" }], include: { shop: { select: { name: true, taxId: true } } } });
  const buf = await toXlsxBook([
    {
      name: "Payouts",
      columns: ["shop", "taxId", "periodStart", "periodEnd", "orders", "gross", "commission", "logistics", "adSpend", "penalties", "refunds", "net", "status", "reference", "paidAt"],
      rows: rows.map((p) => ({ shop: p.shop.name, taxId: p.shop.taxId ?? "", periodStart: p.periodStart, periodEnd: p.periodEnd, orders: p.ordersCount, gross: p.gross, commission: p.commission, logistics: p.logistics, adSpend: p.adSpend, penalties: p.penalties, refunds: p.refunds, net: p.net, status: p.status, reference: p.reference ?? "", paidAt: p.paidAt ?? "" })),
    },
  ]);
  await audit({ actorId: staff.user.id, actorLogin: staff.user.login, actorKind: "staff", action: "finance.export", entityType: "Payout", meta: { rows: rows.length } });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="anor-payouts-${new Date().toISOString().slice(0, 10)}.xlsx"`, "Cache-Control": "no-store" } });
}
