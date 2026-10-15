import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);
const ANON_COOKIE = "anor_aid";

// Locale negotiation + prefix handling, and an anonymous visitor id for recently-viewed/recommendations.
// Auth is enforced inside each layout, server action and route handler (proxy coverage is not a security boundary).
export default function proxy(req: NextRequest) {
  const res = intl(req);
  if (!req.cookies.get(ANON_COOKIE)) {
    res.cookies.set(ANON_COOKIE, crypto.randomUUID(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" });
  }
  return res;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|media|uploads|brand|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|\\.well-known|.*\\..*).*)"],
};
