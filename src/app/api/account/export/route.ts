import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { rateLimit } from "@/server/security/rate-limit";
import { exportUserData } from "@/server/services/privacy";

/** GET /api/account/export — the signed-in user's data as a JSON download. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit(`export:${user.id}`, 3, 3600)).success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="anor-data-${user.login}-${data.exportedAt.slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
