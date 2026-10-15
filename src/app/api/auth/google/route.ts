import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { googleAuthorizeUrl, localizedUrl, signInWithGoogle } from "@/server/auth/oauth";
import { safeNext } from "@/server/auth/guards";

export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"), "/");
  const e = env();
  if (e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET) return NextResponse.redirect(await googleAuthorizeUrl(next));
  if (!e.DEMO_MODE) return NextResponse.redirect(await localizedUrl("/auth/login?error=forbidden"));
  // Demo mode without credentials: sign in a deterministic test Google account.
  const r = await signInWithGoogle({ sub: "demo-google-1001", email: "demo.google@example.com", email_verified: true, name: "Demo Google" });
  return NextResponse.redirect(await localizedUrl(r.needsPin ? `/auth/pin?next=${encodeURIComponent(next)}` : next));
}
