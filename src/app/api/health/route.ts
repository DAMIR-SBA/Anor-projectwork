import { NextResponse } from "next/server";
import { healthReport } from "@/server/health";

export const dynamic = "force-dynamic";

/** GET /api/health (also /health) — 200 when the database answers, 503 otherwise. */
export async function GET() {
  const r = await healthReport();
  return NextResponse.json(r, { status: r.status === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
