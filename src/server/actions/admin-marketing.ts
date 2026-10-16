"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, AppError, zInt } from "@/server/action";
import type { StaffContext } from "@/server/auth/session";
import { bulkCoupons, deleteBanner, moderateParticipants, saveBanner, saveCampaign, saveCoupon, setCampaignStatus } from "@/server/services/admin/marketing";
import { saveLoyaltySettings } from "@/server/services/loyalty";

const who = (s: StaffContext) => ({ userId: s.user.id, login: s.user.login });

const zBlock = z.object({ type: z.enum(["hero", "countdown", "products", "text", "coupons"]), textUz: z.string().max(2000).optional(), textRu: z.string().max(2000).optional(), codes: z.array(z.string().trim().max(40)).max(10).optional() });

export const saveCampaignAction = action(
  {
    auth: "staff",
    permission: "promos.manage",
    schema: z.object({
      id: z.string().optional(),
      slug: z.string().trim().max(60).optional(),
      type: z.enum(["FLASH_SALE", "DEAL_OF_DAY", "SEASONAL"]),
      nameUz: z.string().trim().min(3).max(80),
      nameRu: z.string().trim().min(3).max(80),
      descriptionUz: z.string().max(500).nullable().optional(),
      descriptionRu: z.string().max(500).nullable().optional(),
      season: z.string().trim().max(30).nullable().optional(),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      minDiscountPercent: zInt(5, 90),
      plusEarlyHours: zInt(0, 72),
      themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      bannerUrl: z.string().max(500).nullable().optional(),
      recurring: z.boolean(),
      spinEnabled: z.boolean(),
      blocks: z.array(zBlock).max(20),
    }),
  },
  async ({ id, ...i }, ctx) => {
    const c = await saveCampaign(who(ctx.staff), i, id);
    revalidatePath("/[locale]/admin/campaigns", "layout");
    return { ok: true, data: { id: c.id } };
  },
);

export const campaignStatusAction = action({ auth: "staff", permission: "promos.manage", schema: z.object({ id: z.string(), status: z.enum(["DRAFT", "SCHEDULED", "ENDED"]) }) }, async (i, ctx) => {
  await setCampaignStatus(who(ctx.staff), i.id, i.status);
  revalidatePath("/[locale]/admin/campaigns", "layout");
});

export const moderateParticipantsAction = action(
  { auth: "staff", permission: "promos.manage", schema: z.object({ campaignId: z.string(), ids: z.array(z.string()).min(1).max(200), decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().trim().max(500).optional() }) },
  async (i, ctx) => {
    const n = await moderateParticipants(who(ctx.staff), i.campaignId, i.ids, i.decision, i.reason);
    revalidatePath("/[locale]/admin/campaigns", "layout");
    return { ok: true, data: { count: n } };
  },
);

const zCoupon = z.object({
  type: z.enum(["PERCENT", "FIXED", "FREE_DELIVERY"]),
  value: zInt(0, 100_000_000),
  maxDiscount: zInt(0, 100_000_000).nullable().optional(),
  minCartTotal: zInt(0, 1_000_000_000),
  categoryId: z.string().nullable().optional(),
  shopId: z.string().nullable().optional(),
  firstOrderOnly: z.boolean(),
  usageLimit: zInt(1, 10_000_000).nullable().optional(),
  perUserLimit: zInt(1, 100),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean(),
  descriptionUz: z.string().max(200).nullable().optional(),
  descriptionRu: z.string().max(200).nullable().optional(),
});

export const saveCouponAction = action({ auth: "staff", permission: "promos.manage", schema: zCoupon.extend({ id: z.string().optional(), code: z.string().trim().regex(/^[A-Za-z0-9-]{4,24}$/) }) }, async ({ id, ...i }, ctx) => {
  await saveCoupon(who(ctx.staff), i, id);
  revalidatePath("/[locale]/admin/coupons", "page");
});

export const bulkCouponsAction = action({ auth: "staff", permission: "promos.manage", rateLimit: { key: "admin.bulk-coupons", limit: 10, window: 3600 }, schema: zCoupon.extend({ prefix: z.string().trim().regex(/^[A-Za-z0-9]{2,10}$/), count: zInt(1, 5000) }) }, async ({ prefix, count, ...i }, ctx) => {
  const r = await bulkCoupons(who(ctx.staff), prefix, count, i);
  revalidatePath("/[locale]/admin/coupons", "page");
  return { ok: true, data: r };
});

export const saveBannerAction = action(
  {
    auth: "staff",
    permission: "banners.manage",
    schema: z.object({
      id: z.string().optional(),
      titleUz: z.string().trim().min(2).max(80),
      titleRu: z.string().trim().min(2).max(80),
      subtitleUz: z.string().max(160).nullable().optional(),
      subtitleRu: z.string().max(160).nullable().optional(),
      imageUrl: z.string().max(500).nullable().optional(),
      href: z.string().trim().max(300),
      placement: z.enum(["HOME_HERO", "HOME_STRIP", "CATEGORY"]),
      bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      sort: zInt(0, 1000),
      startsAt: z.coerce.date().nullable().optional(),
      endsAt: z.coerce.date().nullable().optional(),
      isActive: z.boolean(),
    }),
  },
  async ({ id, ...i }, ctx) => {
    await saveBanner(who(ctx.staff), i, id);
    revalidatePath("/[locale]/admin/banners", "page");
    revalidatePath("/[locale]", "page");
  },
);

export const deleteBannerAction = action({ auth: "staff", permission: "banners.manage", schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  await deleteBanner(who(ctx.staff), i.id);
  revalidatePath("/[locale]/admin/banners", "page");
});

const pctField = z.number().min(0).max(0.2);

export const saveLoyaltyAction = action(
  {
    auth: "staff",
    permission: "loyalty.manage",
    schema: z.object({ silverFrom: zInt(100_000, 10_000_000_000), goldFrom: zInt(100_000, 10_000_000_000), referralReward: zInt(0, 1_000_000), refereeReward: zInt(0, 1_000_000), referralMonthlyCap: zInt(0, 1000), baseCashback: pctField, silverCashback: pctField, goldCashback: pctField, plusCashback: pctField, bonusTtlDays: zInt(7, 1095) }),
  },
  async (i, ctx) => {
    if (i.goldFrom <= i.silverFrom) throw new AppError("tierOrder", undefined, "goldFrom");
    await saveLoyaltySettings(ctx.staff.user.id, i);
    const { audit } = await import("@/server/audit");
    await audit({ actorId: ctx.staff.user.id, actorLogin: ctx.staff.user.login, actorKind: "staff", action: "loyalty.updated", entityType: "Setting", entityId: "loyalty", after: i });
    revalidatePath("/[locale]/admin/loyalty", "page");
  },
);
