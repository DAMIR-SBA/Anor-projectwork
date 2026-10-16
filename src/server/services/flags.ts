import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db";
import { log } from "@/server/log";
import { evaluateFlag, normalizeVariants, type FlagDef, type FlagResult } from "@/lib/flags";
import { getCurrentUser } from "@/server/auth/session";
import { anonId } from "./home";

/** All flags (cached one minute; the admin flags page invalidates tag "flags"). */
export const getFlagDefs = unstable_cache(
  async (): Promise<Record<string, FlagDef>> => {
    const rows = await db.featureFlag.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, { key: r.key, enabled: r.enabled, rolloutPercent: r.rolloutPercent, variants: normalizeVariants(r.variants) }]));
  },
  ["feature-flags"],
  { revalidate: 60, tags: ["flags"] },
);

/** The anonymous visitor cookie is stable across sign-in, so it wins over the user id. */
export async function visitorId(): Promise<string | null> {
  return (await anonId()) ?? (await getCurrentUser())?.id ?? null;
}

/**
 * Evaluate several flags for the current visitor in one go. The value given per key is what a
 * flag that doesn't exist yet means (kill switches default on, experiments default off).
 */
export async function flagsFor<K extends string>(defaults: Record<K, boolean>): Promise<{ visitor: string | null; flags: Record<K, FlagResult> }> {
  const [defs, visitor] = await Promise.all([getFlagDefs(), visitorId()]);
  const keys = Object.keys(defaults) as K[];
  const flags = Object.fromEntries(keys.map((k) => [k, defs[k] ? evaluateFlag(defs[k], visitor) : { on: defaults[k], variant: null }])) as Record<K, FlagResult>;
  return { visitor, flags };
}

/** First exposure wins: later weight changes don't move a visitor's recorded arm. Call from `after()`. */
export async function trackExposures(visitor: string | null, exposures: Array<{ key: string; variant: string | null }>) {
  if (!visitor) return;
  const data = exposures.filter((e): e is { key: string; variant: string } => !!e.variant).map((e) => ({ flagKey: e.key, visitorId: visitor, variant: e.variant }));
  if (!data.length) return;
  await db.flagExposure.createMany({ data, skipDuplicates: true }).catch((err) => log.warn("flag exposure failed", { err }));
}

/** Credit an order to every running experiment this visitor was exposed to. */
export async function attributeFlagOrder(visitor: string | null, revenue: number) {
  if (!visitor) return;
  await db.flagExposure.updateMany({ where: { visitorId: visitor, flag: { enabled: true } }, data: { orders: { increment: 1 }, revenue: { increment: revenue } } });
}
