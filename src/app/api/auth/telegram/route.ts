import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { localizedUrl, signInWithTelegram, verifyTelegramLogin } from "@/server/auth/oauth";
import { safeNext } from "@/server/auth/guards";
import { log } from "@/server/log";

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const next = safeNext(params.next, "/");
  try {
    let tg: { id: string; username?: string; first_name?: string; last_name?: string; photo_url?: string };
    if (params.demo && env().DEMO_MODE && !env().TELEGRAM_BOT_TOKEN) {
      tg = { id: "700000001", username: "anor_tg_demo", first_name: "Telegram", last_name: "Demo" };
    } else {
      if (!verifyTelegramLogin(params)) return NextResponse.redirect(await localizedUrl("/auth/login?error=invalidCredentials"));
      tg = { id: params.id, username: params.username, first_name: params.first_name, last_name: params.last_name, photo_url: params.photo_url };
    }
    const r = await signInWithTelegram(tg);
    return NextResponse.redirect(await localizedUrl(r.needsPin ? `/auth/pin?next=${encodeURIComponent(next)}` : next));
  } catch (err) {
    log.error("telegram login failed", { err });
    return NextResponse.redirect(await localizedUrl("/auth/login?error=generic"));
  }
}
