import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { signInWithTelegram } from "@/server/auth/oauth";
import { rateLimit } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/security/request";
import { verifyWebAppInitData } from "@/lib/telegram";

const body = z.object({ initData: z.string().max(4096).optional(), demo: z.boolean().optional() });

/** Mini App sign-in: validate Telegram's signed initData, then open a normal ANOR session. */
export async function POST(req: NextRequest) {
  const { ip } = await requestMeta();
  if (!(await rateLimit(`tg-webapp:${ip}`, 20, 600)).success) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const e = env();
  let tg: { id: string; username?: string; first_name?: string; last_name?: string; photo_url?: string };
  let startParam: string | null = null;
  if (e.TELEGRAM_BOT_TOKEN) {
    const v = verifyWebAppInitData(parsed.data.initData ?? "", e.TELEGRAM_BOT_TOKEN);
    if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 401 });
    tg = { id: String(v.user.id), username: v.user.username, first_name: v.user.first_name, last_name: v.user.last_name, photo_url: v.user.photo_url };
    startParam = v.startParam;
  } else if (e.DEMO_MODE && parsed.data.demo) {
    // No bot configured: DEMO_MODE signs in a fixed demo Telegram user.
    tg = { id: "700000001", username: "anor_tg_demo", first_name: "Telegram", last_name: "Demo" };
  } else {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  try {
    const r = await signInWithTelegram(tg);
    // start_param "p_<slug>" opens a product shared from the Mini App.
    const next = startParam?.startsWith("p_") ? `/p/${startParam.slice(2).replace(/[^a-z0-9-]/gi, "")}` : "/";
    const res = NextResponse.json({ ok: true, next: r.needsPin ? `/auth/pin?next=${encodeURIComponent(next)}` : next });
    res.cookies.set("anor_tg", "1", { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
    return res;
  } catch (err) {
    log.warn("mini app sign-in failed", { err });
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
}
