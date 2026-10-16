"use server";

import { z } from "zod";
import { BANK_ACCOUNT_RE, MFO_RE, TAX_ID_RE } from "@/lib/b2b";
import { revalidatePath, updateTag } from "next/cache";
import { action, AppError, zInt } from "@/server/action";
import type { StaffContext } from "@/server/auth/session";
import { deleteFlag, resetFlagStats, saveFlag, savePlatformSettings } from "@/server/services/admin/platform";
import { resetDemoData } from "@/server/services/admin/system";
import { getJob, runJob } from "@/server/jobs/registry";
import { audit } from "@/server/audit";
import "@/server/jobs/all";

const who = (s: StaffContext) => ({ userId: s.user.id, login: s.user.login });

// ── Feature flags ────────────────────────────────────────────────────────

const flags = () => {
  updateTag("flags");
  revalidatePath("/[locale]/admin/flags", "page");
};

export const saveFlagAction = action(
  {
    auth: "staff",
    permission: "flags.manage",
    schema: z.object({
      id: z.string().optional(),
      key: z
        .string()
        .trim()
        .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/)
        .max(60),
      description: z.string().trim().max(300).nullish().transform((v) => v || null),
      enabled: z.boolean(),
      rolloutPercent: zInt(0, 100),
      variants: z
        .array(z.object({ key: z.string().trim().regex(/^[a-z0-9_]{1,30}$/), weight: zInt(1, 100) }))
        .max(6)
        .refine((v) => v.length !== 1, { message: "variants" }),
    }),
  },
  async (i, ctx) => {
    const row = await saveFlag(who(ctx.staff), i);
    flags();
    return { ok: true, data: { id: row.id } };
  },
);

export const deleteFlagAction = action({ auth: "staff", permission: "flags.manage", schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  await deleteFlag(who(ctx.staff), i.id);
  flags();
});

export const resetFlagStatsAction = action({ auth: "staff", permission: "flags.manage", schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  await resetFlagStats(who(ctx.staff), i.id);
  flags();
});

// ── Platform settings ────────────────────────────────────────────────────

const zText = (max: number) => z.string().trim().max(max);
const zDate = z
  .string()
  .nullish()
  .transform((v) => (v ? new Date(v).toISOString() : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)));

export const saveSettingsAction = action(
  {
    auth: "staff",
    permission: "settings.manage",
    schema: z.object({
      announcement: z.object({
        enabled: z.boolean(),
        textUz: zText(200),
        textRu: zText(200),
        // Internal links only, like banners.
        href: z
          .string()
          .trim()
          .max(200)
          .nullish()
          .transform((v) => v || null)
          .refine((v) => v === null || (v.startsWith("/") && !v.startsWith("//")), { message: "href" }),
        tone: z.enum(["info", "promo", "warning"]),
        startsAt: zDate,
        endsAt: zDate,
      }),
      ordersPaused: z.object({ enabled: z.boolean(), messageUz: zText(300), messageRu: zText(300) }),
      sellerSignupOpen: z.boolean(),
      support: z.object({
        phone: z
          .string()
          .trim()
          .max(20)
          .refine((v) => !v || /^\+?[0-9 ()-]{7,20}$/.test(v), { message: "phone" }),
        email: z.union([z.literal(""), z.string().trim().email().max(120)]),
        telegram: z
          .string()
          .trim()
          .max(60)
          .refine((v) => !v || /^(@|https:\/\/t\.me\/)?[A-Za-z][A-Za-z0-9_]{3,31}$/.test(v), { message: "telegram" }),
      }),
      requisites: z.object({
        legalName: zText(160),
        taxId: z.string().trim().refine((v) => !v || TAX_ID_RE.test(v), { message: "taxId" }),
        address: zText(240),
        bankName: zText(120),
        bankAccount: z.string().trim().refine((v) => !v || BANK_ACCOUNT_RE.test(v), { message: "bankAccount" }),
        mfo: z.string().trim().refine((v) => !v || MFO_RE.test(v), { message: "mfo" }),
      }),
    }),
  },
  async (i, ctx) => {
    await savePlatformSettings(who(ctx.staff), i);
    updateTag("settings");
    revalidatePath("/[locale]", "layout");
  },
);

// ── Status page ──────────────────────────────────────────────────────────

export const runJobAction = action({ auth: "staff", permission: "system.status", rateLimit: { key: "admin.run-job", limit: 20, window: 600 }, schema: z.object({ name: z.string().max(60) }) }, async (i, ctx) => {
  // Only scheduled jobs: they run without input. Event jobs (webhooks, broadcasts) need a payload.
  if (!getJob(i.name)?.cron) throw new AppError("notFound");
  await audit({ actorId: ctx.staff.user.id, actorLogin: ctx.staff.user.login, actorKind: "staff", action: "job.run_manual", entityType: "Job", entityId: i.name });
  try {
    await runJob(i.name);
  } catch {
    // runJob already recorded the failure on the JobRun row; the status page shows it.
    throw new AppError("jobFailed");
  } finally {
    revalidatePath("/[locale]/admin/status", "page");
  }
});

export const demoResetAction = action({ auth: "staff", permission: "system.demo_reset", rateLimit: { key: "admin.demo-reset", limit: 3, window: 3600 }, schema: z.object({ phrase: z.string().max(40) }) }, async (i, ctx) => {
  const r = await resetDemoData(who(ctx.staff), i.phrase);
  for (const tag of ["categories", "plans", "flags", "settings"]) updateTag(tag);
  revalidatePath("/", "layout");
  return { ok: true, data: r };
});
