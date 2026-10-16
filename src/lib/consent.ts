// Cookie consent: "anor_consent" = "v1.a<0|1>.m<0|1>" (analytics, marketing). Necessary cookies
// (session, cart, language, anonymous visitor id for the cart and recently viewed) need no consent.

export const CONSENT_COOKIE = "anor_consent";
export const CONSENT_VERSION = "2026-01";
export type CookieConsent = { analytics: boolean; marketing: boolean };

export function parseConsent(value: string | undefined | null): CookieConsent | null {
  const m = /^v1\.a([01])\.m([01])$/.exec(value ?? "");
  return m ? { analytics: m[1] === "1", marketing: m[2] === "1" } : null;
}

export function serializeConsent(c: CookieConsent): string {
  return `v1.a${c.analytics ? 1 : 0}.m${c.marketing ? 1 : 0}`;
}

/** How long data is kept (days). The privacy policy quotes these numbers; the retention job enforces them. */
export const RETENTION_DAYS = {
  notifications: 180,
  productViews: 180,
  searchQueries: 365,
  loginAttempts: 365,
  resolvedSupportChats: 3 * 365,
  errorEvents: 90,
  jobRuns: 90,
  auditLog: 5 * 365,
} as const;
