import { NextResponse, type NextRequest } from "next/server";
import { recent } from "@/server/realtime/bus";
import { db } from "@/server/db";
import { rateLimit, LIMITS } from "@/server/security/rate-limit";
import { realtimeChannels } from "../channels";

export const dynamic = "force-dynamic";

/** Polling fallback: events since `?since=<ms>` for the caller's channels. */
export async function GET(req: NextRequest) {
  const who = await realtimeChannels(req.nextUrl.searchParams.get("as") === "staff");
  if (!who) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rl = await rateLimit(`poll:${who.userId}`, LIMITS.mutation.limit, LIMITS.mutation.window);
  if (!rl.success) return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  const since = Number(req.nextUrl.searchParams.get("since")) || Date.now() - 10_000;
  void db.user.update({ where: { id: who.userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
  const events = recent(who.channels, since).map((e) => ({ type: e.type, data: { ...((e.data as object) ?? {}), at: e.at } }));
  return NextResponse.json({ events, now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
