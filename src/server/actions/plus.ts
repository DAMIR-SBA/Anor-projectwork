"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/server/action";
import { setAutoRenew, subscribePlus } from "@/server/services/plus";

export const subscribePlusAction = action(
  { rateLimit: { key: "plus.subscribe", limit: 10, window: 600 }, schema: z.object({ plan: z.enum(["PLUS_MONTHLY", "PLUS_ANNUAL"]), method: z.enum(["WALLET", "CLICK", "PAYME", "UZCARD", "HUMO", "CARD"]), savedCardId: z.string().nullish() }) },
  async (i, ctx) => {
    const r = await subscribePlus(ctx.user.id, i.plan, i.method, i.savedCardId);
    revalidatePath("/[locale]", "layout");
    return { ok: true, data: r };
  },
);

export const plusAutoRenewAction = action({ schema: z.object({ on: z.boolean() }) }, async (i, ctx) => {
  await setAutoRenew(ctx.user.id, i.on);
  revalidatePath("/[locale]/account/plus", "page");
});
