"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { activeShop } from "@/server/services/seller/context";
import { addShopDocument, saveWarehouse, updateBank, updateProfile } from "@/server/services/seller/settings";

const refresh = () => revalidatePath("/[locale]/seller", "layout");

export const updateShopProfileAction = action(
  { rateLimit: { key: "seller.settings", ...LIMITS.mutation }, schema: z.object({ name: z.string().trim().min(2).max(60), descriptionUz: z.string().max(2000).default(""), descriptionRu: z.string().max(2000).default(""), city: z.string().max(60).default(""), logoUrl: z.string().max(500).nullable().optional(), bannerUrl: z.string().max(500).nullable().optional() }) },
  async (input, ctx) => {
    const shop = await activeShop(ctx.user.id);
    await updateProfile(shop.id, { userId: ctx.user.id, login: ctx.user.login }, input);
    refresh();
  },
);

export const updateBankAction = action(
  { rateLimit: { key: "seller.bank", limit: 5, window: 3600 }, schema: z.object({ bankName: z.string().trim().min(2).max(80), bankAccount: z.string().max(30).optional(), bankMfo: z.string().max(10), confirm: z.string().max(200).default("") }) },
  async (input, ctx) => {
    const shop = await activeShop(ctx.user.id);
    await updateBank(shop.id, { userId: ctx.user.id, login: ctx.user.login }, { ...input, bankAccount: input.bankAccount || undefined });
    refresh();
  },
);

export const addShopDocumentAction = action({ rateLimit: { key: "seller.settings", ...LIMITS.mutation }, schema: z.object({ type: z.string().max(40), fileUrl: z.string().max(500), fileName: z.string().max(200) }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await addShopDocument(shop.id, input);
  refresh();
});

export const saveWarehouseAction = action(
  { rateLimit: { key: "seller.settings", ...LIMITS.mutation }, schema: z.object({ id: z.string().optional(), name: z.string().trim().min(2).max(80), region: z.string().max(40), city: z.string().trim().min(2).max(60), address: z.string().trim().min(5).max(200), isActive: z.boolean().default(true) }) },
  async (input, ctx) => {
    const shop = await activeShop(ctx.user.id);
    await saveWarehouse(shop.id, input);
    refresh();
  },
);
