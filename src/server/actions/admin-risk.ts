"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { action, AppError, zInt } from "@/server/action";
import type { StaffContext } from "@/server/auth/session";
import { resetLockout, resolveFlag, restoreUser, revokeUserSessions, runFraudScan, suspendUser } from "@/server/services/admin/fraud";
import { adjustWallet, saveNasiya } from "@/server/services/admin/finance";
import { generatePayouts, settlePayouts } from "@/server/services/seller/finance";
import { audit } from "@/server/audit";

const who = (s: StaffContext) => ({ userId: s.user.id, login: s.user.login });
const zReason = z.string().trim().min(3).max(1000);

// ── Fraud ────────────────────────────────────────────────────────────────

export const runFraudScanAction = action({ auth: "staff", permission: "fraud.manage", rateLimit: { key: "admin.fraud-scan", limit: 6, window: 600 }, schema: z.object({}) }, async (_i, ctx) => {
  const r = await runFraudScan();
  await audit({ actorId: ctx.staff.user.id, actorLogin: ctx.staff.user.login, actorKind: "staff", action: "fraud.scan", entityType: "FraudFlag", after: r });
  revalidatePath("/[locale]/admin/fraud", "page");
  return { ok: true, data: r };
});

export const resolveFlagAction = action(
  { auth: "staff", permission: "fraud.manage", schema: z.object({ id: z.string(), decision: z.enum(["CONFIRMED", "DISMISSED"]), action: z.enum(["none", "suspend_user", "suspend_shop", "take_down", "hide_review"]).default("none"), reason: zReason }) },
  async (i, ctx) => {
    // Consequences reach into other areas, so they need those permissions too.
    if (i.action === "suspend_user" && !ctx.staff.permissions.has("users.manage")) throw new AppError("forbidden");
    if (i.action === "suspend_shop" && !ctx.staff.permissions.has("shops.moderate")) throw new AppError("forbidden");
    if (i.action === "take_down" && !ctx.staff.permissions.has("products.moderate")) throw new AppError("forbidden");
    await resolveFlag(i.id, who(ctx.staff), i.decision, i.reason, i.action);
    revalidatePath("/[locale]/admin/fraud", "page");
  },
);

// ── Users ────────────────────────────────────────────────────────────────

const users = () => revalidatePath("/[locale]/admin/users", "layout");

export const suspendUserAction = action({ auth: "staff", permission: "users.manage", schema: z.object({ id: z.string(), reason: zReason }) }, async (i, ctx) => {
  await suspendUser(i.id, who(ctx.staff), i.reason);
  users();
});

export const restoreUserAction = action({ auth: "staff", permission: "users.manage", schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  await restoreUser(i.id, who(ctx.staff));
  users();
});

export const resetLockoutAction = action({ auth: "staff", permission: "users.manage", schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  await resetLockout(i.id, who(ctx.staff));
  users();
});

export const revokeUserSessionsAction = action({ auth: "staff", permission: "users.manage", schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  await revokeUserSessions(i.id, who(ctx.staff));
  users();
});

export const adjustWalletAction = action({ auth: "staff", permission: "finance.manage", rateLimit: { key: "admin.wallet-adjust", limit: 30, window: 3600 }, schema: z.object({ id: z.string(), amount: z.number().int().min(-50_000_000).max(50_000_000), reason: zReason }) }, async (i, ctx) => {
  await adjustWallet(i.id, who(ctx.staff), i.amount, i.reason);
  users();
});

// ── Finance ──────────────────────────────────────────────────────────────

export const generatePayoutsAction = action({ auth: "staff", permission: "finance.manage", schema: z.object({}) }, async (_i, ctx) => {
  const r = await generatePayouts();
  await audit({ actorId: ctx.staff.user.id, actorLogin: ctx.staff.user.login, actorKind: "staff", action: "payouts.generated", entityType: "Payout", after: r });
  revalidatePath("/[locale]/admin/finance", "page");
  return { ok: true, data: r };
});

export const settlePayoutsAction = action({ auth: "staff", permission: "finance.manage", schema: z.object({}) }, async (_i, ctx) => {
  const r = await settlePayouts();
  await audit({ actorId: ctx.staff.user.id, actorLogin: ctx.staff.user.login, actorKind: "staff", action: "payouts.settled", entityType: "Payout", after: r });
  revalidatePath("/[locale]/admin/finance", "page");
  return { ok: true, data: r };
});

export const saveNasiyaAction = action(
  {
    auth: "staff",
    permission: "nasiya.manage",
    schema: z.object({
      settings: z.object({ defaultLimit: zInt(100_000, 500_000_000), maxLimit: zInt(100_000, 500_000_000), minMonthlyIncome: zInt(0, 100_000_000), minAgeYears: zInt(18, 70), maxActiveContracts: zInt(1, 20), incomeMultiplier: z.number().min(0.5).max(24) }),
      plans: z.array(z.object({ id: z.string(), markupPercent: z.number().min(0).max(1), minPrice: zInt(0, 1_000_000_000), maxPrice: zInt(0, 1_000_000_000), isActive: z.boolean() })).max(12),
    }),
  },
  async (i, ctx) => {
    await saveNasiya(who(ctx.staff), i.settings, i.plans);
    updateTag("plans");
    revalidatePath("/[locale]/admin/nasiya", "page");
  },
);
