"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, zInt } from "@/server/action";
import { applyForNasiya, decideApplication, repay } from "@/server/services/nasiya";
import { EMPLOYMENT, PASSPORT_RE, PINFL_RE } from "@/lib/nasiya";

export const applyNasiyaAction = action(
  {
    rateLimit: { key: "nasiya.apply", limit: 5, window: 3600 },
    schema: z.object({
      fullName: z.string().trim().min(5).max(120),
      passport: z
        .string()
        .transform((v) => v.replace(/\s/g, "").toUpperCase())
        .refine((v) => PASSPORT_RE.test(v), { message: "passport" }),
      pinfl: z
        .string()
        .transform((v) => v.replace(/\s/g, ""))
        .refine((v) => PINFL_RE.test(v), { message: "pinfl" }),
      birthDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)) && Date.parse(v) < Date.now(), { message: "birthDate" }),
      monthlyIncome: zInt(0, 1_000_000_000),
      employment: z.enum(EMPLOYMENT),
      consent: z.literal(true),
    }),
  },
  async (i, ctx) => {
    const r = await applyForNasiya(ctx.user.id, { ...i, birthDate: new Date(`${i.birthDate}T00:00:00Z`) });
    revalidatePath("/[locale]/account/nasiya", "page");
    return { ok: true, data: r };
  },
);

export const repayAction = action(
  { rateLimit: { key: "nasiya.repay", limit: 20, window: 600 }, schema: z.object({ contractId: z.string(), mode: z.enum(["next", "overdue", "payoff"]), method: z.enum(["WALLET", "CLICK", "PAYME", "UZCARD", "HUMO", "CARD"]), savedCardId: z.string().nullish() }) },
  async (i, ctx) => {
    const r = await repay(ctx.user.id, i.contractId, i.mode, i.method, i.savedCardId);
    revalidatePath("/[locale]/account/nasiya", "page");
    return { ok: true, data: r };
  },
);

export const decideApplicationAction = action(
  { auth: "staff", permission: "nasiya.manage", schema: z.object({ id: z.string(), approve: z.boolean(), limit: zInt(0, 500_000_000).default(0), reason: z.string().trim().max(300).optional() }) },
  async (i, ctx) => {
    await decideApplication(i.id, { userId: ctx.staff.user.id, login: ctx.staff.user.login }, i.approve, i.limit, i.reason ?? null);
    revalidatePath("/[locale]/admin/nasiya", "page");
  },
);
