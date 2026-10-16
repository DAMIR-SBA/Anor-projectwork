// Deep links: web+anor://p/<slug>, https://<host>/p/<slug> or a bare path all resolve to an
// internal storefront path; anything else (other hosts, admin, protocol tricks) goes home.
const ALLOWED = /^\/(?:(?:oz|ru)\/)?(?:p\/[\w-]+|c\/[\w-]+|shop\/[\w-]+|brand\/[\w-]+|live(?:\/\w+)?|videos|deals|campaign\/[\w-]+|cart|account\/orders(?:\/\w+)?|trade-in|nasiya|plus|search)?(?:\?[\w=&%.+-]*)?$/;

export function resolveDeepLink(raw: string | null | undefined, host: string): string {
  if (!raw) return "/";
  let v = raw.trim();
  try {
    v = decodeURIComponent(v);
  } catch {
    return "/";
  }
  v = v.replace(/^web\+anor:(\/\/)?/i, "/");
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      if (u.host !== host) return "/";
      v = u.pathname + u.search;
    } catch {
      return "/";
    }
  }
  if (!v.startsWith("/")) v = `/${v}`;
  v = v.replace(/\/{2,}/g, "/");
  return ALLOWED.test(v) ? v : "/";
}
