"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, AppError, zInt } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { db } from "@/server/db";
import { activeShop } from "@/server/services/seller/context";
import { saveCampaign, setCampaignStatus } from "@/server/services/ads";

const zCampaign = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(3).max(80),
  placement: z.enum(["SEARCH", "CATEGORY"]),
  bidModel: z.enum(["CPC", "CPM"]),
  bid: zInt(1, 10_000_000),
  dailyBudget: zInt(1, 1_000_000_000),
  totalBudget: zInt(1, 10_000_000_000).nullable().optional(),
  keywords: z.array(z.string().max(40)).max(30).default([]),
  categoryId: z.string().nullable().optional(),
  productIds: z.array(z.string()).min(1).max(20),
  endsAt: z.coerce.date().nullable().optional(),
});

export const saveCampaignAction = action({ rateLimit: { key: "seller.ads", ...LIMITS.mutation }, schema: zCampaign }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  const full = await db.shop.findUniqueOrThrow({ where: { id: shop.id }, select: { id: true, restrictedAt: true, status: true } });
  const c = await saveCampaign(full, { userId: ctx.user.id, login: ctx.user.login }, input, input.id);
  revalidatePath("/[locale]/seller/ads", "page");
  return { ok: true, data: { id: c.id } };
});

export const campaignStatusAction = action({ schema: z.object({ id: z.string(), status: z.enum(["ACTIVE", "PAUSED", "ENDED"]) }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  if (input.status === "ACTIVE" && shop.restrictedAt) throw new AppError("shopRestricted");
  await setCampaignStatus(shop.id, input.id, input.status);
  revalidatePath("/[locale]/seller/ads", "page");
});
