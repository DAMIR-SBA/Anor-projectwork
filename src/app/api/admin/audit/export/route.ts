import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { toCsv, toXlsx } from "@/server/services/export";

export async function GET(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff || !staff.permissions.has("audit.export")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const where = {
    ...(sp.get("action") ? { action: { contains: sp.get("action")! } } : {}),
    ...(sp.get("actor") ? { actorLogin: { contains: sp.get("actor")!.toLowerCase() } } : {}),
  };
  const rows = await db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 50_000 });
  const columns = ["createdAt", "actorLogin", "actorKind", "action", "entityType", "entityId", "ip", "userAgent", "before", "after", "meta"];
  const data = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    before: r.before ? JSON.stringify(r.before) : "",
    after: r.after ? JSON.stringify(r.after) : "",
    meta: r.meta ? JSON.stringify(r.meta) : "",
  }));
  await audit({ actorId: staff.user.id, actorLogin: staff.user.login, action: "audit.exported", meta: { rows: rows.length, format: sp.get("format") } });
  const stamp = new Date().toISOString().slice(0, 10);
  if (sp.get("format") === "xlsx") {
    const buf = await toXlsx("Audit", columns, data);
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="anor-audit-${stamp}.xlsx"` } });
  }
  return new NextResponse(toCsv(columns, data), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="anor-audit-${stamp}.csv"` } });
}
