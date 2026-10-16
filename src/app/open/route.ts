import { NextResponse, type NextRequest } from "next/server";
import { resolveDeepLink } from "@/lib/deeplink";

/** GET /open?to=… — target of web+anor:// links (PWA protocol handler) and shared app links. */
export function GET(req: NextRequest) {
  const to = resolveDeepLink(req.nextUrl.searchParams.get("to"), req.nextUrl.host);
  return NextResponse.redirect(new URL(to, req.nextUrl.origin), 302);
}
