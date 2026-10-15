import { NextResponse, type NextRequest } from "next/server";
import { googleCallback, localizedUrl } from "@/server/auth/oauth";
import { log } from "@/server/log";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(await localizedUrl("/auth/login?error=generic"));
  try {
    const r = await googleCallback(code, state);
    if (!r) return NextResponse.redirect(await localizedUrl("/auth/login?error=generic"));
    return NextResponse.redirect(await localizedUrl(r.needsPin ? `/auth/pin?next=${encodeURIComponent(r.next)}` : r.next));
  } catch (err) {
    log.error("google callback failed", { err });
    return NextResponse.redirect(await localizedUrl("/auth/login?error=generic"));
  }
}
