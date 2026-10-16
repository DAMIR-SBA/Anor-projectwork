/**
 * Feature flags and A/B variants, evaluated deterministically per visitor so the same
 * person always lands in the same bucket (no flicker, no per-request randomness).
 */

export type FlagVariant = { key: string; weight: number };
export type FlagDef = { key: string; enabled: boolean; rolloutPercent: number; variants: FlagVariant[] | null };
export type FlagResult = { on: boolean; variant: string | null };

/** Flags the code actually reads. Admins can create others, but only these change behaviour. */
export const KNOWN_FLAGS: Record<string, { variants?: string[] }> = {
  "home.layout": { variants: ["classic", "deals_first", "personal_first"] },
  "home.stories": {},
  "home.made_in_uz": {},
};

/** Homepage block order per `home.layout` variant. */
export const HOME_LAYOUTS: Record<string, string[]> = {
  classic: ["categories", "season", "deal", "flash", "popular", "strip", "fresh", "madeInUz", "recommended", "recent"],
  deals_first: ["season", "deal", "flash", "categories", "popular", "strip", "fresh", "madeInUz", "recommended", "recent"],
  personal_first: ["recommended", "categories", "season", "deal", "flash", "popular", "strip", "fresh", "madeInUz", "recent"],
};

/** FNV-1a 32-bit → 0..9999. Stable across runtimes (no crypto needed). */
export function bucket(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 10_000;
}

export function normalizeVariants(raw: unknown): FlagVariant[] | null {
  if (!Array.isArray(raw)) return null;
  const v = raw.filter((x): x is FlagVariant => !!x && typeof x.key === "string" && typeof x.weight === "number" && x.weight > 0);
  return v.length ? v : null;
}

/**
 * Off flags are off. Visitors outside the rollout get "off" (control). Inside it, variants
 * are split by weight with an independent hash so changing the rollout doesn't reshuffle them.
 * Without a visitor id only a 100% rollout is on, and it shows the first variant.
 */
export function evaluateFlag(flag: FlagDef | undefined, visitorId: string | null): FlagResult {
  if (!flag || !flag.enabled) return { on: false, variant: null };
  const variants = flag.variants?.length ? flag.variants : null;
  if (!visitorId) return flag.rolloutPercent >= 100 ? { on: true, variant: variants?.[0]?.key ?? null } : { on: false, variant: null };
  if (bucket(`${flag.key}:rollout:${visitorId}`) % 100 >= flag.rolloutPercent) return { on: false, variant: null };
  if (!variants) return { on: true, variant: null };
  const total = variants.reduce((s, v) => s + v.weight, 0);
  let point = bucket(`${flag.key}:variant:${visitorId}`) % total;
  for (const v of variants) {
    if (point < v.weight) return { on: true, variant: v.key };
    point -= v.weight;
  }
  return { on: true, variant: variants[variants.length - 1].key };
}

/**
 * Two-proportion z-test of `b` against `a` (converting visitors / visitors).
 * Returns null until both arms have enough data for the normal approximation.
 */
export function compareRates(a: { n: number; x: number }, b: { n: number; x: number }): { lift: number; z: number; significant: boolean } | null {
  if (a.n < 30 || b.n < 30 || a.x + b.x < 10) return null;
  const pa = a.x / a.n;
  const pb = b.x / b.n;
  const p = (a.x + b.x) / (a.n + b.n);
  const se = Math.sqrt(p * (1 - p) * (1 / a.n + 1 / b.n));
  if (!se) return null;
  const z = (pb - pa) / se;
  return { lift: pa ? (pb - pa) / pa : 0, z, significant: Math.abs(z) >= 1.96 };
}
