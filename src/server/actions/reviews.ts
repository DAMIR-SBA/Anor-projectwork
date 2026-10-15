"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { db } from "@/server/db";
import { action, AppError, zBool, zInt } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { isOwnStorageUrl } from "@/server/storage";
import {
  answerQuestion,
  askQuestion,
  createReview,
  createShopReview,
  moderateQuestion,
  moderateReviews,
  moderateShopReview,
  replyToReview,
  reportReview,
  requestRemoval,
  translateReview,
  updateReview,
  voteReview,
  type ModAction,
} from "@/server/services/reviews";
import { listProductReviews, listQuestions } from "@/server/services/review-queries";
import { REMOVAL_REASONS, REPORT_REASONS } from "@/lib/review-moderation";

const MOD_ACTIONS = ["APPROVE", "REJECT", "HIDE", "STRIP_CONTACTS", "BAN_REVIEWER", "RESTORE", "REMOVAL_APPROVED", "REMOVAL_REJECTED", "DISMISS_REPORTS"] as const satisfies readonly ModAction[];

const text = (max: number) => z.string().trim().max(max).optional().transform((s) => s || undefined);

const zReview = z
  .object({
    rating: zInt(1, 5),
    pros: text(1000),
    cons: text(1000),
    comment: text(3000),
    isAnonymous: zBool.default(false),
    media: z.array(z.string().max(500)).max(7).default([]),
  })
  .refine((v) => v.rating >= 4 || (v.comment?.length ?? 0) + (v.cons?.length ?? 0) >= 10, { path: ["comment"], message: "reviewExplainLow" });

function cleanMedia(urls: string[]) {
  // Only files uploaded into the reviews folder (not e.g. someone's chat attachment).
  const own = urls.filter((u) => isOwnStorageUrl(u) && u.includes("/reviews/"));
  const videos = own.filter((u) => /\.(mp4|webm|mov)$/i.test(u)).slice(0, 1);
  const images = own.filter((u) => !videos.includes(u)).slice(0, 6);
  return [...images.map((url) => ({ url, type: "IMAGE" as const })), ...videos.map((url) => ({ url, type: "VIDEO" as const }))];
}

async function revalidateProduct(productId: string) {
  const p = await db.product.findUnique({ where: { id: productId }, select: { slug: true } });
  if (p) revalidatePath(`/[locale]/p/${p.slug}`, "page");
  revalidatePath("/[locale]/account/reviews", "page");
}

// ── Public reads ─────────────────────────────────────────────────────────

export const loadReviewsAction = action(
  {
    auth: "public",
    rateLimit: { key: "reviews.list", ...LIMITS.mutation },
    schema: z.object({ productId: z.string().min(10), sort: z.enum(["new", "helpful", "high", "low"]).default("helpful"), rating: zInt(1, 5).optional(), media: zBool.optional(), variantId: z.string().optional(), page: zInt(1, 500).default(1) }),
  },
  async (input, ctx) => {
    const data = await listProductReviews({ productId: input.productId, sort: input.sort, filter: { rating: input.rating, media: input.media, variantId: input.variantId }, page: input.page, viewerId: ctx.user?.id ?? null, locale: await getLocale() });
    return { ok: true, data };
  },
);

export const loadQuestionsAction = action(
  { auth: "public", rateLimit: { key: "qa.list", ...LIMITS.mutation }, schema: z.object({ productId: z.string().min(10), page: zInt(1, 500).default(1) }) },
  async (input, ctx) => ({ ok: true, data: await listQuestions(input.productId, ctx.user?.id ?? null, await getLocale(), input.page) }),
);

export const translateReviewAction = action(
  { auth: "public", rateLimit: { key: "reviews.translate", limit: 20, window: 300 }, schema: z.object({ reviewId: z.string() }) },
  async (input) => {
    const locale = await getLocale();
    return { ok: true, data: await translateReview(input.reviewId, locale === "ru" ? "ru" : "uz") };
  },
);

// ── Buyer ────────────────────────────────────────────────────────────────

export const createReviewAction = action(
  { rateLimit: { key: "review", ...LIMITS.review }, schema: z.object({ orderId: z.string(), productId: z.string() }).and(zReview) },
  async (input, ctx) => {
    const review = await createReview(ctx.user, input.orderId, input.productId, { ...input, media: cleanMedia(input.media) });
    await revalidateProduct(input.productId);
    return { ok: true, data: { id: review.id, status: review.status } };
  },
);

export const updateReviewAction = action(
  { rateLimit: { key: "review", ...LIMITS.review }, schema: z.object({ reviewId: z.string() }).and(zReview) },
  async (input, ctx) => {
    await updateReview(ctx.user, input.reviewId, { ...input, media: cleanMedia(input.media) });
    const r = await db.review.findUniqueOrThrow({ where: { id: input.reviewId }, select: { productId: true, status: true } });
    await revalidateProduct(r.productId);
    return { ok: true, data: { id: input.reviewId, status: r.status } };
  },
);

export const voteReviewAction = action(
  { rateLimit: { key: "review.vote", ...LIMITS.mutation }, schema: z.object({ reviewId: z.string(), value: z.union([z.literal(1), z.literal(-1)]) }) },
  async (input, ctx) => ({ ok: true, data: await voteReview(ctx.user.id, input.reviewId, input.value) }),
);

export const reportReviewAction = action(
  { rateLimit: { key: "review.report", limit: 20, window: 3600 }, schema: z.object({ reviewId: z.string(), reason: z.enum(REPORT_REASONS), details: text(500) }) },
  async (input, ctx) => {
    await reportReview(ctx.user.id, input.reviewId, input.reason, input.details);
  },
);

export const shopReviewAction = action(
  { rateLimit: { key: "review", ...LIMITS.review }, schema: z.object({ orderId: z.string(), deliverySpeed: zInt(1, 5), packaging: zInt(1, 5), communication: zInt(1, 5), comment: text(1000) }) },
  async (input, ctx) => {
    await createShopReview(ctx.user.id, input.orderId, input);
    revalidatePath(`/[locale]/account/orders/${input.orderId}`, "page");
  },
);

export const askQuestionAction = action(
  { rateLimit: { key: "question", limit: 10, window: 3600 }, schema: z.object({ productId: z.string(), text: z.string().trim().min(5).max(1000) }) },
  async (input, ctx) => {
    if (ctx.user.reviewBannedAt) throw new AppError("reviewBanned");
    const q = await askQuestion(ctx.user, input.productId, input.text);
    return { ok: true, data: { id: q.id, pending: q.status !== "PUBLISHED" } };
  },
);

export const answerQuestionAction = action(
  { rateLimit: { key: "answer", limit: 30, window: 3600 }, schema: z.object({ questionId: z.string(), text: z.string().trim().min(2).max(2000) }) },
  async (input, ctx) => {
    if (ctx.user.reviewBannedAt) throw new AppError("reviewBanned");
    const a = await answerQuestion(ctx.user, input.questionId, input.text);
    revalidatePath("/[locale]/seller/questions", "page");
    return { ok: true, data: { id: a.id, pending: a.status !== "PUBLISHED" } };
  },
);

// ── Seller ───────────────────────────────────────────────────────────────

export const replyReviewAction = action(
  { rateLimit: { key: "review.reply", limit: 60, window: 3600 }, schema: z.object({ reviewId: z.string(), text: z.string().trim().min(2).max(2000) }) },
  async (input, ctx) => {
    await replyToReview(ctx.user.id, input.reviewId, input.text);
    revalidatePath("/[locale]/seller/reviews", "page");
  },
);

export const requestRemovalAction = action(
  { rateLimit: { key: "review.removal", limit: 20, window: 3600 }, schema: z.object({ reviewId: z.string(), reason: z.enum(REMOVAL_REASONS), details: z.string().trim().min(10).max(1000) }) },
  async (input, ctx) => {
    await requestRemoval(ctx.user.id, input.reviewId, input.reason, input.details);
    revalidatePath("/[locale]/seller/reviews", "page");
  },
);

// ── Moderation ───────────────────────────────────────────────────────────

export const moderateReviewsAction = action(
  { auth: "staff", permission: "reviews.moderate", rateLimit: { key: "mod", ...LIMITS.mutation }, schema: z.object({ ids: z.array(z.string()).min(1).max(100), act: z.enum(MOD_ACTIONS), reason: text(500) }) },
  async (input, ctx) => {
    if ((input.act === "REJECT" || input.act === "BAN_REVIEWER") && !input.reason) throw new AppError("reasonRequired", undefined, "reason");
    await moderateReviews(ctx.staff, input.ids, input.act, input.reason);
    revalidatePath("/[locale]/admin/moderation/reviews", "page");
    return { ok: true, data: { count: input.ids.length } };
  },
);

export const moderateQAAction = action(
  { auth: "staff", permission: "reviews.moderate", schema: z.object({ kind: z.enum(["question", "answer"]), id: z.string(), publish: z.boolean() }) },
  async (input, ctx) => {
    await moderateQuestion(ctx.staff, input.kind, input.id, input.publish);
    revalidatePath("/[locale]/admin/moderation/reviews", "page");
  },
);

export const moderateShopReviewAction = action(
  { auth: "staff", permission: "reviews.moderate", schema: z.object({ id: z.string(), approve: z.boolean() }) },
  async (input, ctx) => {
    await moderateShopReview(ctx.staff, input.id, input.approve);
    revalidatePath("/[locale]/admin/moderation/reviews", "page");
  },
);
