import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { generateJson, aiEnabled } from "@/server/ai/gemini";
import { enqueue } from "@/server/jobs/enqueue";
import { bonusEarn } from "./wallet";
import { trackMission } from "./missions";
import { evaluateReview, maskContacts, summarizeReviews, hasProfanity, hasContacts, looksLikeSpam, REVIEW_EDIT_DAYS, PHOTO_REVIEW_BONUS, VIDEO_REVIEW_BONUS, REVIEW_BONUS_MONTHLY_CAP, type ReviewSummary } from "@/lib/review-moderation";
import type { ModerationActionType, ReviewStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import type { CurrentUser, StaffContext } from "@/server/auth/session";

export type ReviewInput = { rating: number; pros?: string; cons?: string; comment?: string; isAnonymous: boolean; media: Array<{ url: string; type: "IMAGE" | "VIDEO" }> };

/** A buyer may review a product once per delivered order containing it. */
export async function reviewEligibility(userId: string, orderId: string, productId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, userId, status: "DELIVERED" }, include: { items: { where: { productId } } } });
  if (!order || !order.items.length) return { ok: false as const, reason: "notEligible" };
  const existing = await db.review.findUnique({ where: { productId_orderId: { productId, orderId } } });
  if (existing && !existing.deletedAt) return { ok: false as const, reason: "alreadyReviewed", reviewId: existing.id };
  return { ok: true as const, order, variantId: order.items[0].variantId };
}

async function signalsFor(userId: string, productId: string, text: string, rating: number, excludeId?: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } });
  const norm = text.trim().toLowerCase();
  const [own, others, burst] = await Promise.all([
    norm.length > 15 ? db.review.count({ where: { userId, comment: { equals: text.trim(), mode: "insensitive" }, ...(excludeId ? { NOT: { id: excludeId } } : {}) } }) : 0,
    norm.length > 15 ? db.review.count({ where: { NOT: { userId }, comment: { equals: text.trim(), mode: "insensitive" } } }) : 0,
    db.review.count({ where: { productId, rating: 5, createdAt: { gte: new Date(Date.now() - 86_400_000) }, user: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } } }),
  ]);
  return { text, rating, accountAgeDays: (Date.now() - user.createdAt.getTime()) / 86_400_000, duplicateOfOwn: own > 0, duplicateAcrossUsers: others > 0, recentNewAccount5StarsOnProduct: burst };
}

async function aiCheck(text: string): Promise<{ flagged: boolean; sentiment: number } | null> {
  if (!aiEnabled() || text.length < 20) return null;
  return generateJson<{ flagged: boolean; sentiment: number }>([
    { text: `You moderate marketplace reviews (Uzbek/Russian). Return JSON {"flagged": boolean, "sentiment": number between -1 and 1}. flagged=true for insults, hate, personal data, ads or off-topic spam.\nReview: """${text.slice(0, 2000)}"""` },
  ]);
}

export async function createReview(user: CurrentUser, orderId: string, productId: string, input: ReviewInput) {
  if (user.reviewBannedAt) throw new AppError("reviewBanned");
  const e = await reviewEligibility(user.id, orderId, productId);
  if (!e.ok) throw new AppError(e.reason);
  const text = [input.pros, input.cons, input.comment].filter(Boolean).join("\n");
  const { flags, score } = evaluateReview(await signalsFor(user.id, productId, text, input.rating));
  const ai = await aiCheck(text);
  if (ai?.flagged) flags.push("AI_FLAGGED");
  const status: ReviewStatus = flags.length ? "PENDING" : "APPROVED";
  const review = await db.review.create({
    data: {
      productId,
      orderId,
      userId: user.id,
      variantId: e.variantId,
      rating: input.rating,
      pros: input.pros || null,
      cons: input.cons || null,
      comment: input.comment || null,
      isAnonymous: input.isAnonymous,
      displayName: input.isAnonymous ? null : (user.name?.split(" ")[0] ?? user.login),
      status,
      flags,
      flagScore: score + (ai?.flagged ? 30 : 0),
      sentiment: ai?.sentiment ?? null,
      hasMedia: input.media.length > 0,
      editableUntil: new Date(Date.now() + REVIEW_EDIT_DAYS * 86_400_000),
      lang: /[а-яё]/i.test(text) ? (/[ўқғҳ]/i.test(text) ? "uz-Cyrl" : "ru") : "uz",
      media: { create: input.media.map((m, i) => ({ url: m.url, type: m.type, sort: i })) },
    },
  });
  if (flags.length) await db.reviewModerationAction.create({ data: { reviewId: review.id, action: "AUTO_FLAG", reason: flags.join(",") } });
  if (flags.includes("BURST_5STAR")) await flagFakeReviews(productId);
  await afterReviewChange(review.id);
  await trackMission(user.id, "REVIEW").catch(() => {});
  return review;
}

export async function updateReview(user: CurrentUser, reviewId: string, input: ReviewInput) {
  const review = await db.review.findFirst({ where: { id: reviewId, userId: user.id, deletedAt: null } });
  if (!review) throw new AppError("notFound");
  if (review.editableUntil < new Date()) throw new AppError("reviewLocked");
  const text = [input.pros, input.cons, input.comment].filter(Boolean).join("\n");
  const { flags, score } = evaluateReview(await signalsFor(user.id, review.productId, text, input.rating, review.id));
  await db.$transaction([
    db.reviewMedia.deleteMany({ where: { reviewId } }),
    db.review.update({
      where: { id: reviewId },
      data: {
        rating: input.rating,
        pros: input.pros || null,
        cons: input.cons || null,
        comment: input.comment || null,
        isAnonymous: input.isAnonymous,
        displayName: input.isAnonymous ? null : (user.name?.split(" ")[0] ?? user.login),
        flags,
        flagScore: score,
        status: flags.length ? "PENDING" : review.status === "HIDDEN" || review.status === "REJECTED" ? review.status : "APPROVED",
        hasMedia: input.media.length > 0,
        translations: Prisma.DbNull,
        media: { create: input.media.map((m, i) => ({ url: m.url, type: m.type, sort: i })) },
      },
    }),
  ]);
  await afterReviewChange(reviewId);
}

/** Bonus for photo/video reviews after approval; capped per month to limit abuse. */
async function maybeAwardReviewBonus(reviewId: string) {
  const r = await db.review.findUniqueOrThrow({ where: { id: reviewId }, include: { media: true } });
  if (r.status !== "APPROVED" || !r.hasMedia || r.bonusAwardedAt) return;
  const monthStart = new Date(Date.now() - 30 * 86_400_000);
  const recent = await db.review.count({ where: { userId: r.userId, bonusAwardedAt: { gte: monthStart } } });
  if (recent >= REVIEW_BONUS_MONTHLY_CAP) return;
  const amount = r.media.some((m) => m.type === "VIDEO") ? VIDEO_REVIEW_BONUS : PHOTO_REVIEW_BONUS;
  await db.$transaction(async (tx) => {
    const claimed = await tx.review.updateMany({ where: { id: r.id, bonusAwardedAt: null }, data: { bonusAwardedAt: new Date() } });
    if (claimed.count === 1) await bonusEarn(tx, r.userId, amount, "REVIEW", { refId: r.id });
  });
  await notify({ userId: r.userId, type: "review.bonus", title: "Sharh uchun bonus", body: `+${amount} bonus`, href: "/account/reviews" });
}

/** Recompute product + shop aggregates and schedule the "What buyers say" summary. */
export async function afterReviewChange(reviewId: string) {
  const r = await db.review.findUniqueOrThrow({ where: { id: reviewId }, select: { productId: true, product: { select: { shopId: true } } } });
  await recomputeProductRating(r.productId);
  await recomputeShopRating(r.product.shopId);
  await maybeAwardReviewBonus(reviewId);
  await enqueue("reviews.summary", { productId: r.productId });
}

export async function recomputeProductRating(productId: string) {
  const rows = await db.review.groupBy({ by: ["rating"], where: { productId, status: "APPROVED", deletedAt: null }, _count: { _all: true } });
  const breakdown: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let count = 0;
  let sum = 0;
  for (const r of rows) {
    breakdown[String(r.rating)] = r._count._all;
    count += r._count._all;
    sum += r.rating * r._count._all;
  }
  await db.product.update({ where: { id: productId }, data: { rating: count ? Math.round((sum / count) * 10) / 10 : 0, reviewCount: count, ratingBreakdown: breakdown } });
}

export async function recomputeShopRating(shopId: string) {
  const [products, shopReviews] = await Promise.all([
    db.review.aggregate({ _avg: { rating: true }, _count: { _all: true }, where: { status: "APPROVED", deletedAt: null, product: { shopId } } }),
    db.shopReview.findMany({ where: { shopId, status: "APPROVED" }, select: { deliverySpeed: true, packaging: true, communication: true } }),
  ]);
  const shopAvg = shopReviews.length ? shopReviews.reduce((s, r) => s + (r.deliverySpeed + r.packaging + r.communication) / 3, 0) / shopReviews.length : null;
  const prodAvg = products._avg.rating;
  const rating = prodAvg != null && shopAvg != null ? prodAvg * 0.7 + shopAvg * 0.3 : (prodAvg ?? shopAvg ?? 0);
  await db.shop.update({ where: { id: shopId }, data: { rating: Math.round(rating * 10) / 10, reviewCount: products._count._all + shopReviews.length } });
  const { recomputeShopMetrics } = await import("./shop-metrics");
  await recomputeShopMetrics(shopId).catch(() => {});
}

/** "What buyers say": Gemini summary (uz + ru) when available, otherwise recurring phrases per language. */
export async function buildReviewSummary(productId: string) {
  const reviews = await db.review.findMany({ where: { productId, status: "APPROVED", deletedAt: null }, orderBy: { helpfulCount: "desc" }, take: 200, select: { pros: true, cons: true, comment: true, rating: true, lang: true } });
  if (reviews.length < 3) {
    await db.product.update({ where: { id: productId }, data: { reviewSummary: Prisma.DbNull } });
    return null;
  }
  let summary: ReviewSummary = summarizeReviews(reviews);
  if (aiEnabled()) {
    const text = reviews.slice(0, 60).map((r) => `[${r.rating}★] + ${r.pros ?? ""} | − ${r.cons ?? ""} | ${r.comment ?? ""}`).join("\n");
    type Part = { pros: string[]; cons: string[]; mentions: string[] };
    const ai = await generateJson<{ uz: Part; ru: Part }>([
      { text: `Summarize these marketplace reviews. JSON {"uz": {...}, "ru": {...}} where each is {"pros": up to 4 short phrases, "cons": up to 3 short phrases, "mentions": up to 6 frequent topics}; "uz" in Uzbek Latin, "ru" in Russian. Only facts present in the reviews.\n${text}` },
    ]);
    const conv = (p: Part) => ({ pros: (p.pros ?? []).slice(0, 4).map((x) => maskContacts(x)), cons: (p.cons ?? []).slice(0, 3).map((x) => maskContacts(x)), mentions: (p.mentions ?? []).slice(0, 6).map((m) => ({ term: maskContacts(m), count: 0 })) });
    if (ai?.uz?.pros) summary = { ...conv(ai.uz), ...(ai.ru?.pros ? { ru: conv(ai.ru) } : {}), source: "ai", basedOn: reviews.length };
  }
  await db.product.update({ where: { id: productId }, data: { reviewSummary: summary } });
  return summary;
}

export async function voteReview(userId: string, reviewId: string, value: 1 | -1) {
  const r = await db.review.findUnique({ where: { id: reviewId } });
  if (!r || r.status !== "APPROVED") throw new AppError("notFound");
  if (r.userId === userId) throw new AppError("forbidden");
  const existing = await db.reviewVote.findUnique({ where: { reviewId_userId: { reviewId, userId } } });
  if (existing?.value === value) await db.reviewVote.delete({ where: { reviewId_userId: { reviewId, userId } } });
  else await db.reviewVote.upsert({ where: { reviewId_userId: { reviewId, userId } }, create: { reviewId, userId, value }, update: { value } });
  const [up, down] = await Promise.all([db.reviewVote.count({ where: { reviewId, value: 1 } }), db.reviewVote.count({ where: { reviewId, value: -1 } })]);
  await db.review.update({ where: { id: reviewId }, data: { helpfulCount: up, notHelpfulCount: down } });
  return { helpful: up, notHelpful: down, mine: existing?.value === value ? 0 : value };
}

export const AUTO_HIDE_REPORTS = 3;

export async function reportReview(userId: string, reviewId: string, reason: string, details?: string) {
  const r = await db.review.findUnique({ where: { id: reviewId } });
  if (!r || r.status !== "APPROVED") throw new AppError("notFound");
  if (r.userId === userId) throw new AppError("forbidden");
  await db.reviewReport.upsert({ where: { reviewId_userId_source: { reviewId, userId, source: "USER" } }, create: { reviewId, userId, reason, details, source: "USER" }, update: { reason, details, status: "OPEN" } });
  const open = await db.reviewReport.count({ where: { reviewId, status: "OPEN", source: "USER" } });
  // Enough independent reports pull the review back into moderation.
  if (open >= AUTO_HIDE_REPORTS && r.status === "APPROVED") {
    await db.review.update({ where: { id: reviewId }, data: { status: "PENDING", flags: { push: "REPORTED" } } });
    await db.reviewModerationAction.create({ data: { reviewId, action: "AUTO_FLAG", reason: `${open} user reports` } });
    await afterReviewChange(reviewId);
  }
}

// ── Seller side ──────────────────────────────────────────────────────────

async function sellerReview(userId: string, reviewId: string) {
  const r = await db.review.findUnique({ where: { id: reviewId }, include: { product: { include: { shop: true } } } });
  if (!r || r.product.shop.ownerId !== userId) throw new AppError("forbidden");
  return r;
}

export async function replyToReview(userId: string, reviewId: string, text: string) {
  const r = await sellerReview(userId, reviewId);
  const clean = maskContacts(text.trim());
  if (hasProfanity(clean)) throw new AppError("contentRejected");
  await db.reviewReply.upsert({ where: { reviewId }, create: { reviewId, shopId: r.product.shopId, authorId: userId, text: clean }, update: { text: clean } });
  if (r.status === "APPROVED") await notify({ userId: r.userId, type: "review.reply", title: r.product.shop.name, body: clean.slice(0, 140), href: `/p/${r.product.slug}#reviews` });
  // Response-time metric for the shop (minutes from review to first reply).
  const replies = await db.reviewReply.findMany({ where: { shopId: r.product.shopId }, include: { review: { select: { createdAt: true } } }, take: 200, orderBy: { createdAt: "desc" } });
  const mins = replies.map((x) => (x.createdAt.getTime() - x.review.createdAt.getTime()) / 60_000).filter((m) => m >= 0);
  if (mins.length) await db.shop.update({ where: { id: r.product.shopId }, data: { responseTimeMins: Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) } });
}

export async function requestRemoval(userId: string, reviewId: string, reason: string, details?: string) {
  await sellerReview(userId, reviewId);
  await db.reviewReport.upsert({ where: { reviewId_userId_source: { reviewId, userId, source: "SELLER" } }, create: { reviewId, userId, reason, details, source: "SELLER" }, update: { reason, details, status: "OPEN" } });
}

// ── Moderation ───────────────────────────────────────────────────────────

export type ModAction = "APPROVE" | "REJECT" | "HIDE" | "STRIP_CONTACTS" | "BAN_REVIEWER" | "RESTORE" | "REMOVAL_APPROVED" | "REMOVAL_REJECTED" | "DISMISS_REPORTS";

export async function moderateReviews(staff: StaffContext, reviewIds: string[], act: ModAction, reason?: string) {
  for (const id of reviewIds) {
    const before = await db.review.findUnique({ where: { id } });
    if (!before) continue;
    let data: Record<string, unknown> = {};
    let logAction: ModerationActionType = act === "DISMISS_REPORTS" ? "RESTORE" : (act as ModerationActionType);
    switch (act) {
      case "APPROVE":
      case "RESTORE":
        data = { status: "APPROVED", rejectReason: null, deletedAt: null };
        break;
      case "REJECT":
        data = { status: "REJECTED", rejectReason: reason ?? "rules" };
        break;
      case "HIDE":
      case "REMOVAL_APPROVED":
        data = { status: "HIDDEN", rejectReason: reason ?? null };
        break;
      case "STRIP_CONTACTS":
        data = { pros: before.pros && maskContacts(before.pros), cons: before.cons && maskContacts(before.cons), comment: before.comment && maskContacts(before.comment), flags: before.flags.filter((f) => !["LINK", "PHONE", "CONTACT"].includes(f)) };
        break;
      case "BAN_REVIEWER":
        await db.user.update({ where: { id: before.userId }, data: { reviewBannedAt: new Date() } });
        await db.review.updateMany({ where: { userId: before.userId, status: { in: ["APPROVED", "PENDING"] } }, data: { status: "HIDDEN" } });
        data = { status: "HIDDEN" };
        break;
      case "REMOVAL_REJECTED":
      case "DISMISS_REPORTS":
        logAction = act === "REMOVAL_REJECTED" ? "REMOVAL_REJECTED" : "RESTORE";
        break;
    }
    if (Object.keys(data).length) await db.review.update({ where: { id }, data });
    if (act === "REMOVAL_APPROVED" || act === "REMOVAL_REJECTED") {
      await db.reviewReport.updateMany({ where: { reviewId: id, source: "SELLER", status: "OPEN" }, data: { status: act === "REMOVAL_APPROVED" ? "RESOLVED" : "DISMISSED", decidedById: staff.user.id, decidedAt: new Date(), decisionNote: reason } });
    } else if (["APPROVE", "REJECT", "HIDE", "BAN_REVIEWER", "DISMISS_REPORTS", "RESTORE"].includes(act)) {
      await db.reviewReport.updateMany({ where: { reviewId: id, source: "USER", status: "OPEN" }, data: { status: act === "APPROVE" || act === "DISMISS_REPORTS" || act === "RESTORE" ? "DISMISSED" : "RESOLVED", decidedById: staff.user.id, decidedAt: new Date() } });
    }
    const after = await db.review.findUniqueOrThrow({ where: { id } });
    await db.reviewModerationAction.create({ data: { reviewId: id, actorId: staff.user.id, action: logAction, reason, before: { status: before.status, comment: before.comment }, after: { status: after.status, comment: after.comment } } });
    await audit({ actorId: staff.user.id, actorLogin: staff.user.login, action: `review.${act.toLowerCase()}`, entityType: "Review", entityId: id, before: { status: before.status }, after: { status: after.status }, meta: reason ? { reason } : undefined });
    if (act === "REJECT") await notify({ userId: before.userId, type: "review.rejected", title: "Sharh rad etildi", body: reason ?? "", href: "/account/reviews" });
    await afterReviewChange(id);
  }
}

/** Many 5★ from fresh accounts in a day → fraud flag on the product for review. */
async function flagFakeReviews(productId: string) {
  const recent = await db.review.findMany({ where: { productId, rating: 5, createdAt: { gte: new Date(Date.now() - 86_400_000) }, user: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }, select: { id: true, userId: true } });
  const product = await db.product.findUniqueOrThrow({ where: { id: productId }, select: { shopId: true } });
  await db.fraudFlag.upsert({
    where: { type_entityType_entityId: { type: "FAKE_REVIEW", entityType: "Product", entityId: productId } },
    create: { type: "FAKE_REVIEW", entityType: "Product", entityId: productId, shopId: product.shopId, score: Math.min(100, 40 + recent.length * 10), details: { reviews: recent.map((r) => r.id) } },
    update: { score: Math.min(100, 40 + recent.length * 10), details: { reviews: recent.map((r) => r.id) }, status: "OPEN" },
  });
}

// ── Shop reviews & Q&A ───────────────────────────────────────────────────

export async function createShopReview(userId: string, orderId: string, input: { deliverySpeed: number; packaging: number; communication: number; comment?: string }) {
  const order = await db.order.findFirst({ where: { id: orderId, userId, status: "DELIVERED" } });
  if (!order) throw new AppError("notEligible");
  const comment = input.comment ? maskContacts(input.comment) : null;
  const flagged = !!comment && (hasProfanity(comment) || looksLikeSpam(comment));
  await db.shopReview.upsert({ where: { orderId }, create: { shopId: order.shopId, orderId, userId, ...input, comment, status: flagged ? "PENDING" : "APPROVED" }, update: { ...input, comment, status: flagged ? "PENDING" : "APPROVED" } });
  await recomputeShopRating(order.shopId);
}

export async function askQuestion(user: CurrentUser, productId: string, text: string) {
  const c = hasContacts(text);
  const flagged = hasProfanity(text) || looksLikeSpam(text) || c.link;
  const q = await db.question.create({ data: { productId, userId: user.id, text: maskContacts(text.trim()), status: flagged ? "PENDING" : "PUBLISHED" } });
  const product = await db.product.findUniqueOrThrow({ where: { id: productId }, include: { shop: true } });
  await notify({ userId: product.shop.ownerId, type: "seller.question", title: "Yangi savol", body: q.text.slice(0, 140), href: "/seller/questions" });
  return q;
}

export async function answerQuestion(user: CurrentUser, questionId: string, text: string) {
  const q = await db.question.findUnique({ where: { id: questionId }, include: { product: { include: { shop: true } } } });
  if (!q || q.status !== "PUBLISHED") throw new AppError("notFound");
  const isSeller = q.product.shop.ownerId === user.id;
  // Community answers only from people who bought the product.
  if (!isSeller) {
    const bought = await db.orderItem.count({ where: { productId: q.productId, order: { userId: user.id, status: "DELIVERED" } } });
    if (!bought) throw new AppError("answerBuyersOnly");
  }
  const flagged = hasProfanity(text) || looksLikeSpam(text);
  const a = await db.answer.create({ data: { questionId, userId: user.id, isSeller, text: maskContacts(text.trim()), status: flagged ? "PENDING" : "PUBLISHED" } });
  if (a.status === "PUBLISHED" && q.userId !== user.id) await notify({ userId: q.userId, type: "question.answered", title: "Savolingizga javob berildi", body: a.text.slice(0, 140), href: `/p/${q.product.slug}#qa` });
  return a;
}

// ── Translation ──────────────────────────────────────────────────────────

type TranslationSet = { pros?: string | null; cons?: string | null; comment?: string | null };

/** Translate a review into uz/ru with Gemini; cached on the review row. */
export async function translateReview(reviewId: string, target: "uz" | "ru"): Promise<TranslationSet> {
  const r = await db.review.findUnique({ where: { id: reviewId }, select: { status: true, pros: true, cons: true, comment: true, translations: true } });
  if (!r || r.status !== "APPROVED") throw new AppError("notFound");
  const cache = (r.translations as Record<string, TranslationSet> | null) ?? {};
  if (cache[target]) return cache[target];
  if (!aiEnabled()) throw new AppError("translationUnavailable");
  const lang = target === "ru" ? "Russian" : "Uzbek (Latin script)";
  const out = await generateJson<TranslationSet>([
    { text: `Translate this marketplace review into ${lang}. Keep meaning and tone, do not add anything. Return JSON {"pros": string|null, "cons": string|null, "comment": string|null}.\n${JSON.stringify({ pros: r.pros, cons: r.cons, comment: r.comment })}` },
  ]);
  if (!out) throw new AppError("translationUnavailable");
  const clean: TranslationSet = { pros: r.pros ? maskContacts(out.pros ?? "") : null, cons: r.cons ? maskContacts(out.cons ?? "") : null, comment: r.comment ? maskContacts(out.comment ?? "") : null };
  await db.review.update({ where: { id: reviewId }, data: { translations: { ...cache, [target]: clean } } });
  return clean;
}

export async function moderateQuestion(staff: StaffContext, kind: "question" | "answer", id: string, publish: boolean) {
  const status = publish ? "PUBLISHED" : "HIDDEN";
  if (kind === "question") await db.question.update({ where: { id }, data: { status } });
  else await db.answer.update({ where: { id }, data: { status } });
  await audit({ actorId: staff.user.id, actorLogin: staff.user.login, action: `${kind}.${publish ? "publish" : "reject"}`, entityType: kind === "question" ? "Question" : "Answer", entityId: id });
}

export async function moderateShopReview(staff: StaffContext, id: string, approve: boolean) {
  const r = await db.shopReview.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED" } });
  await recomputeShopRating(r.shopId);
  await audit({ actorId: staff.user.id, actorLogin: staff.user.login, action: `shop_review.${approve ? "approve" : "reject"}`, entityType: "ShopReview", entityId: id });
}
