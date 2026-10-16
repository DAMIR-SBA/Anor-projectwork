"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, zInt } from "@/server/action";
import type { StaffContext } from "@/server/auth/session";
import { approveShop, penalizeShop, rejectShop, reviewDocument, suspendShop, unsuspendShop, updateShopTerms, warnShop } from "@/server/services/admin/shops";
import { approveProducts, rejectProducts } from "@/server/services/admin/products";
import { deleteCategory, saveCategory, saveCommissions } from "@/server/services/admin/categories";

const who = (s: StaffContext) => ({ userId: s.user.id, login: s.user.login });
const zReason = z.string().trim().min(3).max(1000);
const shops = () => revalidatePath("/[locale]/admin/moderation/shops", "layout");

// ── Shops ────────────────────────────────────────────────────────────────

export const approveShopAction = action({ auth: "staff", permission: "shops.moderate", schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  await approveShop(i.id, who(ctx.staff));
  shops();
});

export const rejectShopAction = action({ auth: "staff", permission: "shops.moderate", schema: z.object({ id: z.string(), reason: zReason }) }, async (i, ctx) => {
  await rejectShop(i.id, who(ctx.staff), i.reason);
  shops();
});

export const suspendShopAction = action({ auth: "staff", permission: "shops.moderate", schema: z.object({ id: z.string(), reason: zReason }) }, async (i, ctx) => {
  await suspendShop(i.id, who(ctx.staff), i.reason);
  shops();
});

export const unsuspendShopAction = action({ auth: "staff", permission: "shops.moderate", schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  await unsuspendShop(i.id, who(ctx.staff));
  shops();
});

export const reviewDocumentAction = action({ auth: "staff", permission: "shops.moderate", schema: z.object({ id: z.string(), status: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().max(500).optional() }) }, async (i, ctx) => {
  await reviewDocument(i.id, who(ctx.staff), i.status, i.reason);
  shops();
});

export const shopTermsAction = action(
  { auth: "staff", permission: "shops.moderate", schema: z.object({ id: z.string(), tier: z.enum(["BASIC", "PRO"]), isOfficial: z.boolean(), commissionRate: z.number().min(0).max(0.5).nullable(), kycLevel: zInt(0, 3) }) },
  async (i, ctx) => {
    await updateShopTerms(i.id, who(ctx.staff), i);
    shops();
  },
);

export const warnShopAction = action({ auth: "staff", permission: "shops.moderate", schema: z.object({ id: z.string(), reason: zReason }) }, async (i, ctx) => {
  await warnShop(i.id, who(ctx.staff), i.reason);
  shops();
});

export const penalizeShopAction = action(
  { auth: "staff", permission: "finance.manage", schema: z.object({ id: z.string(), amount: zInt(1000, 100_000_000), type: z.enum(["QUALITY", "CANCELLATION", "LATE_HANDOVER", "OTHER"]), reason: zReason }) },
  async (i, ctx) => {
    await penalizeShop(i.id, who(ctx.staff), i);
    shops();
  },
);

// ── Products ─────────────────────────────────────────────────────────────

export const approveProductsAction = action({ auth: "staff", permission: "products.moderate", schema: z.object({ ids: z.array(z.string()).min(1).max(100) }) }, async (i, ctx) => {
  const n = await approveProducts(i.ids, who(ctx.staff));
  revalidatePath("/[locale]/admin/moderation/products", "page");
  return { ok: true, data: { count: n } };
});

export const rejectProductsAction = action({ auth: "staff", permission: "products.moderate", schema: z.object({ ids: z.array(z.string()).min(1).max(100), reason: zReason }) }, async (i, ctx) => {
  const n = await rejectProducts(i.ids, who(ctx.staff), i.reason);
  revalidatePath("/[locale]/admin/moderation/products", "page");
  return { ok: true, data: { count: n } };
});

// ── Categories & commissions ─────────────────────────────────────────────

const zAttr = z.object({ key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,30}$/), nameUz: z.string().trim().min(1).max(40), nameRu: z.string().trim().min(1).max(40), type: z.enum(["select", "number", "text"]), options: z.array(z.string().trim().min(1).max(40)).max(40).optional() });

export const saveCategoryAction = action(
  {
    auth: "staff",
    permission: "categories.manage",
    schema: z.object({
      id: z.string().optional(),
      nameUz: z.string().trim().min(2).max(60),
      nameRu: z.string().trim().min(2).max(60),
      slug: z.string().trim().max(60).optional(),
      parentId: z.string().nullable(),
      icon: z.string().trim().max(40).nullable().optional(),
      imageUrl: z.string().trim().max(500).nullable().optional(),
      sort: zInt(0, 1000),
      commissionRate: z.number().min(0).max(0.5),
      nasiyaEligible: z.boolean(),
      isActive: z.boolean(),
      attributes: z.array(zAttr).max(30).default([]),
    }),
  },
  async (i, ctx) => {
    const c = await saveCategory(who(ctx.staff), i, i.id);
    revalidatePath("/[locale]/admin/categories", "page");
    return { ok: true, data: { id: c.id } };
  },
);

export const deleteCategoryAction = action({ auth: "staff", permission: "categories.manage", schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  await deleteCategory(who(ctx.staff), i.id);
  revalidatePath("/[locale]/admin/categories", "page");
});

export const saveCommissionsAction = action(
  { auth: "staff", permission: "commissions.manage", schema: z.object({ rows: z.array(z.object({ categoryId: z.string(), basic: z.number().min(0).max(0.5), pro: z.number().min(0).max(0.5), cascade: z.boolean().optional() })).min(1).max(200) }) },
  async (i, ctx) => {
    const n = await saveCommissions(who(ctx.staff), i.rows);
    revalidatePath("/[locale]/admin/commissions", "page");
    return { ok: true, data: { count: n } };
  },
);
