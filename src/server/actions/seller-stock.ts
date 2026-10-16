"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, AppError, zInt } from "@/server/action";
import { env } from "@/server/env";
import { db } from "@/server/db";
import { LIMITS } from "@/server/security/rate-limit";
import { activeShop } from "@/server/services/seller/context";
import { advanceSupply, cancelSupply, createSupply, scanAdjust, scanLookup, setStock } from "@/server/services/seller/stock";

const rl = { key: "seller.stock", ...LIMITS.mutation };

export const setStockAction = action({ rateLimit: rl, schema: z.object({ variantId: z.string(), warehouseId: z.string(), quantity: zInt(0, 1_000_000), lowStockAt: zInt(0, 10_000).optional() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await setStock(shop.id, ctx.user.id, input.variantId, input.warehouseId, input.quantity, input.lowStockAt);
  revalidatePath("/[locale]/seller/stock", "page");
});

export const scanLookupAction = action({ rateLimit: { key: "seller.scan", limit: 300, window: 60 }, schema: z.object({ code: z.string().trim().min(2).max(40) }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  return { ok: true, data: await scanLookup(shop.id, input.code) };
});

export const scanAdjustAction = action({ rateLimit: { key: "seller.scan", limit: 300, window: 60 }, schema: z.object({ variantId: z.string(), delta: z.number().int().min(-1000).max(1000).optional(), set: zInt(0, 1_000_000).optional() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  const qty = await scanAdjust(shop.id, ctx.user.id, input.variantId, input.set !== undefined ? { set: input.set } : { delta: input.delta ?? 1 });
  return { ok: true, data: { quantity: qty } };
});

export const createSupplyAction = action(
  { rateLimit: rl, schema: z.object({ warehouseId: z.string(), plannedAt: z.coerce.date(), note: z.string().max(500).optional(), items: z.array(z.object({ variantId: z.string(), quantity: zInt(0, 100_000) })).min(1).max(200) }) },
  async (input, ctx) => {
    const shop = await activeShop(ctx.user.id);
    if (shop.status !== "APPROVED") throw new AppError("forbidden");
    if (!input.items.some((i) => i.quantity > 0)) throw new AppError("invalidInput");
    const s = await createSupply(shop.id, { userId: ctx.user.id, login: ctx.user.login }, input);
    revalidatePath("/[locale]/seller/stock", "page");
    return { ok: true, data: { id: s.id, number: s.number } };
  },
);

export const cancelSupplyAction = action({ schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await cancelSupply(shop.id, input.id);
  revalidatePath("/[locale]/seller/stock", "page");
});

/** DEMO_MODE: play the warehouse's part so FBO stock can be tested end to end. */
export const demoAdvanceSupplyAction = action({ schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  if (!env().DEMO_MODE) throw new AppError("forbidden");
  const shop = await activeShop(ctx.user.id);
  const s = await db.supplyRequest.findFirst({ where: { id: input.id, shopId: shop.id } });
  if (!s) throw new AppError("notFound");
  await advanceSupply(s.id, null);
  revalidatePath("/[locale]/seller/stock", "page");
});
