import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { compareRates, KNOWN_FLAGS, normalizeVariants, type FlagVariant } from "@/lib/flags";
import { mergePlatform, type PlatformSettings } from "@/lib/platform";
import type { Staff } from "./shops";

// ── Feature flags & A/B tests ─────────────────────────────────────────────

export type ArmStats = { variant: string; visitors: number; converters: number; orders: number; revenue: number; rate: number; vsControl: ReturnType<typeof compareRates> };

/** Flags with per-arm results; the first variant is the control the others are compared against. */
export async function adminFlags() {
  const [flags, arms, converted] = await Promise.all([
    db.featureFlag.findMany({ orderBy: { key: "asc" } }),
    db.flagExposure.groupBy({ by: ["flagKey", "variant"], _count: { _all: true }, _sum: { orders: true, revenue: true }, _min: { createdAt: true } }),
    db.flagExposure.groupBy({ by: ["flagKey", "variant"], where: { orders: { gt: 0 } }, _count: { _all: true } }),
  ]);
  const conv = new Map(converted.map((c) => [`${c.flagKey}:${c.variant}`, c._count._all]));
  return flags.map((f) => {
    const variants = normalizeVariants(f.variants) ?? [];
    const raw = arms.filter((a) => a.flagKey === f.key);
    // Keep the configured order (control first), then any arm that was removed since.
    const keys = [...variants.map((v) => v.key), ...raw.map((a) => a.variant).filter((k) => !variants.some((v) => v.key === k))];
    const base = keys.map((k) => {
      const a = raw.find((r) => r.variant === k);
      const visitors = a?._count._all ?? 0;
      const converters = conv.get(`${f.key}:${k}`) ?? 0;
      return { variant: k, visitors, converters, orders: a?._sum.orders ?? 0, revenue: a?._sum.revenue ?? 0, rate: visitors ? converters / visitors : 0 };
    });
    const control = base[0];
    const stats: ArmStats[] = base.map((b, i) => ({ ...b, vsControl: i && control ? compareRates({ n: control.visitors, x: control.converters }, { n: b.visitors, x: b.converters }) : null }));
    const since = raw.reduce<Date | null>((m, a) => (a._min.createdAt && (!m || a._min.createdAt < m) ? a._min.createdAt : m), null);
    return { ...f, variants, stats, since, known: KNOWN_FLAGS[f.key] ?? null };
  });
}

export type FlagInput = { id?: string; key: string; description: string | null; enabled: boolean; rolloutPercent: number; variants: FlagVariant[] };

export async function saveFlag(staff: Staff, i: FlagInput) {
  const keys = i.variants.map((v) => v.key);
  if (new Set(keys).size !== keys.length) throw new AppError("invalidInput", undefined, "variants");
  const known = KNOWN_FLAGS[i.key]?.variants;
  if (known && keys.some((k) => !known.includes(k))) throw new AppError("unknownVariant", { list: known.join(", ") }, "variants");
  const taken = await db.featureFlag.findUnique({ where: { key: i.key } });
  if (taken && taken.id !== i.id) throw new AppError("codeTaken", undefined, "key");
  const data = { key: i.key, description: i.description, enabled: i.enabled, rolloutPercent: i.rolloutPercent, variants: i.variants.length ? i.variants : undefined };
  const before = i.id ? await db.featureFlag.findUnique({ where: { id: i.id } }) : null;
  const row = i.id ? await db.featureFlag.update({ where: { id: i.id }, data: { ...data, variants: i.variants.length ? i.variants : [] } }) : await db.featureFlag.create({ data });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: i.id ? "flag.updated" : "flag.created", entityType: "FeatureFlag", entityId: row.id, before: before ?? undefined, after: row });
  return row;
}

export async function deleteFlag(staff: Staff, id: string) {
  const row = await db.featureFlag.delete({ where: { id } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "flag.deleted", entityType: "FeatureFlag", entityId: id, before: row });
}

/** Start a test over (e.g. after changing arms): forget who saw what. */
export async function resetFlagStats(staff: Staff, id: string) {
  const f = await db.featureFlag.findUniqueOrThrow({ where: { id } });
  const { count } = await db.flagExposure.deleteMany({ where: { flagKey: f.key } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "flag.stats_reset", entityType: "FeatureFlag", entityId: id, meta: { exposures: count } });
}

// ── Platform settings ─────────────────────────────────────────────────────

export async function adminPlatformSettings() {
  const row = await db.setting.findUnique({ where: { key: "platform" } });
  const by = row?.updatedById ? await db.user.findUnique({ where: { id: row.updatedById }, select: { login: true } }) : null;
  return { settings: mergePlatform(row?.value), updatedAt: row?.updatedAt ?? null, updatedBy: by?.login ?? null };
}

export async function savePlatformSettings(staff: Staff, s: PlatformSettings) {
  const a = s.announcement;
  if (a.enabled && !a.textUz.trim() && !a.textRu.trim()) throw new AppError("invalidInput", undefined, "announcement.textUz");
  if (a.startsAt && a.endsAt && new Date(a.endsAt) <= new Date(a.startsAt)) throw new AppError("dateRange", undefined, "announcement.endsAt");
  if (s.ordersPaused.enabled && !s.ordersPaused.messageUz.trim() && !s.ordersPaused.messageRu.trim()) throw new AppError("invalidInput", undefined, "ordersPaused.messageUz");
  const before = await db.setting.findUnique({ where: { key: "platform" } });
  await db.setting.upsert({ where: { key: "platform" }, create: { key: "platform", value: s, updatedById: staff.userId }, update: { value: s, updatedById: staff.userId } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "settings.updated", entityType: "Setting", entityId: "platform", before: before?.value ?? undefined, after: s });
}
