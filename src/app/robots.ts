import type { MetadataRoute } from "next";

const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const PRIVATE = ["/account", "/cart", "/checkout", "/pay", "/auth", "/seller", "/admin", "/staff", "/courier", "/tg", "/open", "/api/"];

/** Crawl the storefront in all three languages; keep private and transactional pages out. */
export default function robots(): MetadataRoute.Robots {
  // Staging and preview deployments stay out of search results entirely.
  if (process.env.NOINDEX === "true") return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE, ...PRIVATE.map((p) => `/ru${p}`), ...PRIVATE.map((p) => `/oz${p}`), "/*?*sort=", "/*?*page="] }],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  };
}
