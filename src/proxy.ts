import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);
const ANON_COOKIE = "anor_aid";

// Locale negotiation + prefix handling, and an anonymous visitor id for recently-viewed/recommendations.
// Auth is enforced inside each layout, server action and route handler (proxy coverage is not a security boundary).
export default function proxy(req: NextRequest) {
  const fresh = req.cookies.get(ANON_COOKIE) ? null : crypto.randomUUID();
  // Also put it on the request so the first render already sees it (A/B arms stay stable).
  if (fresh) req.cookies.set(ANON_COOKIE, fresh);
  const res = intl(req);
  if (fresh) res.cookies.set(ANON_COOKIE, fresh, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" });
  return res;
}

// Everything except API routes, Next internals, the two root route handlers and files (any path
// with a dot: /media/*.svg, /uploads/*, /sw.js, /robots.txt, /.well-known/*). Exclusions are whole
// segments, so storefront pages such as /brand/<slug> or /opengraph-image still get a locale.
export const config = {
  matcher: ["/((?!api(?:/|$)|_next/|_vercel|health$|open$|.*\\..*).*)"],
};
