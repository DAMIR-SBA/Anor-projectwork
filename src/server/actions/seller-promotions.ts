"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, zInt } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { activeShop } from "@/server/services/seller/context";
import { deletePromotion, joinCampaign, leaveCampaign, savePromotion, setPromotionActive } from "@/server/services/seller/promotions";

const refresh = () => revalidatePath("/[locale]/seller/promotions", "page");

export const joinCampaignAction = action(
  { rateLimit: { key: "seller.campaign", ...LIMITS.mutation }, schema: z.object({ campaignId: z.string(), items: z.array(z.object({ productId: z.string(), salePrice: zInt(1, 1_000_000_000), stockLimit: zInt(1, 1_000_000).nullable().optional() })).min(1).max(100) }) },
  async (input, ctx) => {
    const shop = await activeShop(ctx.user.id);
    const r = await joinCampaign(shop, { userId: ctx.user.id, login: ctx.user.login }, input.campaignId, input.items);
    refresh();
    return { ok: true, data: r };
  },
);

export const leaveCampaignAction = action({ schema: z.object({ campaignId: z.string(), productId: z.string() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await leaveCampaign(shop.id, input.campaignId, input.productId);
  refresh();
});

export const savePromotionAction = action(
  {
    rateLimit: { key: "seller.promotion", ...LIMITS.mutation },
    schema: z.object({
      id: z.string().optional(),
      type: z.enum(["BUNDLE", "BUY_TOGETHER", "MULTI_BUY"]),
      nameUz: z.string().trim().min(3).max(80),
      nameRu: z.string().trim().max(80).default(""),
      discountPercent: zInt(3, 70),
      minQty: zInt(1, 20).default(2),
      productIds: z.array(z.string()).min(1).max(50),
      startsAt: z.coerce.date().nullable().optional(),
      endsAt: z.coerce.date().nullable().optional(),
    }),
  },
  async (input, ctx) => {
    const shop = await activeShop(ctx.user.id);
    const p = await savePromotion(shop.id, { userId: ctx.user.id, login: ctx.user.login }, input, input.id);
    refresh();
    return { ok: true, data: { id: p.id } };
  },
);

export const togglePromotionAction = action({ schema: z.object({ id: z.string(), isActive: z.boolean() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await setPromotionActive(shop.id, input.id, input.isActive);
  refresh();
});

export const deletePromotionAction = action({ schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await deletePromotion(shop.id, input.id);
  refresh();
});
