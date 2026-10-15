import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Locale negotiation + prefix handling. Auth is enforced inside each layout,
// server action and route handler (proxy coverage is not a security boundary).
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|media|uploads|brand|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|\\.well-known|.*\\..*).*)"],
};
