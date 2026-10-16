"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { action, AppError } from "@/server/action";
import { env } from "@/server/env";
import { db } from "@/server/db";
import { ACTIVE_SHOP_COOKIE } from "@/server/auth/guards";
import { addDocument, demoApprove, removeDocument, saveBank, saveLegal, saveProfile, submitOnboarding } from "@/server/services/seller/onboarding";

const rl = { key: "seller.onboarding", limit: 60, window: 600 };

export const saveLegalAction = action({ rateLimit: rl, schema: z.object({ legalType: z.enum(["LLC", "SELF_EMPLOYED", "INDIVIDUAL_ENTREPRENEUR"]), legalName: z.string().trim().min(3).max(200), taxId: z.string().trim().min(9).max(20) }) }, async (input, ctx) => {
  await saveLegal(ctx.user.id, input);
});

export const saveProfileAction = action(
  { rateLimit: rl, schema: z.object({ name: z.string().trim().min(3).max(60), slug: z.string().trim().max(48).optional(), descriptionUz: z.string().max(2000).default(""), descriptionRu: z.string().max(2000).default(""), region: z.string().max(40), city: z.string().trim().min(2).max(80), address: z.string().trim().min(5).max(300), logoUrl: z.string().max(500).nullable().optional() }) },
  async (input, ctx) => {
    await saveProfile(ctx.user.id, input);
  },
);

export const saveBankAction = action({ rateLimit: rl, schema: z.object({ bankName: z.string().trim().min(3).max(120), bankAccount: z.string().trim().max(40).optional().transform((v) => v || undefined), bankMfo: z.string().trim().min(5).max(10) }) }, async (input, ctx) => {
  await saveBank(ctx.user.id, input);
});

export const addDocumentAction = action({ rateLimit: rl, schema: z.object({ type: z.enum(["registration_certificate", "director_passport", "charter", "ie_certificate", "passport", "self_employed_certificate"]), fileUrl: z.string().max(500), fileName: z.string().max(200) }) }, async (input, ctx) => {
  await addDocument(ctx.user.id, input);
});

export const removeDocumentAction = action({ schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  await removeDocument(ctx.user.id, input.id);
});

export const submitOnboardingAction = action({ rateLimit: rl }, async (_input, ctx) => {
  await submitOnboarding(ctx.user.id);
  revalidatePath("/[locale]/seller", "layout");
});

export const demoApproveShopAction = action({}, async (_input, ctx) => {
  if (!env().DEMO_MODE) throw new AppError("forbidden");
  const id = await demoApprove(ctx.user.id);
  (await cookies()).set(ACTIVE_SHOP_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 86_400 });
  revalidatePath("/[locale]/seller", "layout");
});

export const switchShopAction = action({ schema: z.object({ shopId: z.string() }) }, async (input, ctx) => {
  const shop = await db.shop.findFirst({ where: { id: input.shopId, ownerId: ctx.user.id } });
  if (!shop) throw new AppError("forbidden");
  (await cookies()).set(ACTIVE_SHOP_COOKIE, shop.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 86_400 });
  revalidatePath("/[locale]/seller", "layout");
});
