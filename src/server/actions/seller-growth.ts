"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, AppError, zInt } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { activeShop } from "@/server/services/seller/context";
import { submitQuiz, upgradeToPro } from "@/server/services/seller/academy";
import { matchPrice } from "@/server/services/seller/competitors";

export const submitQuizAction = action(
  { rateLimit: { key: "seller.quiz", limit: 20, window: 3600 }, schema: z.object({ course: z.string().max(40), answers: z.array(z.number().int().min(0).max(9).nullable()).max(30) }) },
  async (input, ctx) => {
    const shop = await activeShop(ctx.user.id);
    const r = await submitQuiz(shop.id, input.course, input.answers);
    revalidatePath("/[locale]/seller/academy", "page");
    return { ok: true, data: r };
  },
);

export const upgradeProAction = action({ rateLimit: { key: "seller.tier", ...LIMITS.mutation }, schema: z.object({}) }, async (_input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  if (shop.status !== "APPROVED") throw new AppError("forbidden");
  await upgradeToPro(shop.id, { userId: ctx.user.id, login: ctx.user.login });
  revalidatePath("/[locale]/seller", "layout");
});

export const matchPriceAction = action({ rateLimit: { key: "seller.price", ...LIMITS.mutation }, schema: z.object({ productId: z.string(), price: zInt(1000, 1_000_000_000) }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  if (shop.tier !== "PRO") throw new AppError("proOnly");
  const r = await matchPrice(shop.id, input.productId, input.price);
  revalidatePath("/[locale]/seller/competitors", "page");
  return { ok: true, data: r };
});
