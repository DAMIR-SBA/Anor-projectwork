import "server-only";
import { db } from "@/server/db";
import { aiEnabled } from "@/server/ai/gemini";
import { locText } from "@/lib/localized";
import type { ReviewSummary } from "@/lib/review-moderation";
import type { Prisma } from "@/generated/prisma/client";

export type ReviewSort = "new" | "helpful" | "high" | "low";
export type ReviewFilter = { rating?: number; media?: boolean; variantId?: string };

type TranslationSet = { pros?: string | null; cons?: string | null; comment?: string | null };

export type ReviewView = {
  id: string;
  rating: number;
  pros: string | null;
  cons: string | null;
  comment: string | null;
  author: string | null;
  createdAt: string;
  variant: string | null;
  media: Array<{ url: string; type: "IMAGE" | "VIDEO" }>;
  helpful: number;
  notHelpful: number;
  myVote: number;
  mine: boolean;
  pending: boolean;
  reply: { text: string; shop: string; createdAt: string } | null;
  /** Base language differs from the reader's (uz vs ru) — offer "Translate". */
  translatable: boolean;
  translation: TranslationSet | null;
};

const baseLang = (l: string | null | undefined) => (l === "ru" ? "ru" : "uz");

/** Latin-script user text is transliterated for the Cyrillic UI; Cyrillic text is shown as written. */
export const showText = (s: string, locale: string) => (/[а-яёўқғҳ]/i.test(s) ? s : locText(s, locale));

const reviewInclude = (viewerId: string | null) =>
  ({
    media: { orderBy: { sort: "asc" } },
    variant: { select: { titleUz: true, titleRu: true } },
    reply: { include: { shop: { select: { name: true } } } },
    ...(viewerId ? { votes: { where: { userId: viewerId }, select: { value: true } } } : {}),
  }) satisfies Prisma.ReviewInclude;

type ReviewRow = Prisma.ReviewGetPayload<{ include: ReturnType<typeof reviewInclude> & { votes: { select: { value: true } } } }>;

export function toReviewView(r: ReviewRow, locale: string, viewerId: string | null): ReviewView {
  const target = baseLang(locale);
  const tr = (r.translations as Record<string, TranslationSet> | null)?.[target] ?? null;
  const show = (s: string | null) => (s ? showText(s, locale) : s);
  return {
    id: r.id,
    rating: r.rating,
    pros: show(r.pros),
    cons: show(r.cons),
    comment: show(r.comment),
    author: r.isAnonymous || !r.displayName ? null : showText(r.displayName, locale),
    createdAt: r.createdAt.toISOString(),
    variant: r.variant ? (locale === "ru" ? r.variant.titleRu || r.variant.titleUz : locText(r.variant.titleUz, locale)) : null,
    media: r.media.map((m) => ({ url: m.url, type: m.type })),
    helpful: r.helpfulCount,
    notHelpful: r.notHelpfulCount,
    myVote: r.votes?.[0]?.value ?? 0,
    mine: viewerId === r.userId,
    pending: r.status !== "APPROVED",
    reply: r.reply ? { text: showText(r.reply.text, locale), shop: r.reply.shop.name, createdAt: r.reply.createdAt.toISOString() } : null,
    translatable: baseLang(r.lang) !== target && (aiEnabled() || !!tr),
    translation: null,
  };
}

function orderFor(sort: ReviewSort): Prisma.ReviewOrderByWithRelationInput[] {
  switch (sort) {
    case "helpful":
      return [{ helpfulCount: "desc" }, { createdAt: "desc" }];
    case "high":
      return [{ rating: "desc" }, { createdAt: "desc" }];
    case "low":
      return [{ rating: "asc" }, { createdAt: "desc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

export async function listProductReviews(opts: { productId: string; sort: ReviewSort; filter: ReviewFilter; page: number; pageSize?: number; viewerId: string | null; locale: string }) {
  const pageSize = opts.pageSize ?? 8;
  const filter: Prisma.ReviewWhereInput = {
    productId: opts.productId,
    deletedAt: null,
    ...(opts.filter.rating ? { rating: opts.filter.rating } : {}),
    ...(opts.filter.media ? { hasMedia: true } : {}),
    ...(opts.filter.variantId ? { variantId: opts.filter.variantId } : {}),
  };
  // The viewer's own reviews (including ones still in moderation) are pinned on page 1.
  const where: Prisma.ReviewWhereInput = { ...filter, status: "APPROVED", ...(opts.viewerId ? { userId: { not: opts.viewerId } } : {}) };
  const [mine, rows, total] = await Promise.all([
    opts.viewerId && opts.page === 1 ? db.review.findMany({ where: { ...filter, userId: opts.viewerId, status: { in: ["APPROVED", "PENDING"] } }, include: reviewInclude(opts.viewerId), orderBy: { createdAt: "desc" } }) : [],
    db.review.findMany({ where, include: reviewInclude(opts.viewerId), orderBy: orderFor(opts.sort), skip: (opts.page - 1) * pageSize, take: pageSize }),
    db.review.count({ where }),
  ]);
  const items = [...mine, ...rows].map((r) => toReviewView(r as ReviewRow, opts.locale, opts.viewerId));
  return { items, total, hasMore: opts.page * pageSize < total };
}

export async function productReviewStats(productId: string, locale: string) {
  const [product, withMedia, variantRows, mediaRows] = await Promise.all([
    db.product.findUniqueOrThrow({ where: { id: productId }, select: { rating: true, reviewCount: true, ratingBreakdown: true, reviewSummary: true } }),
    db.review.count({ where: { productId, status: "APPROVED", deletedAt: null, hasMedia: true } }),
    db.review.groupBy({ by: ["variantId"], where: { productId, status: "APPROVED", deletedAt: null, variantId: { not: null } }, _count: { _all: true } }),
    db.reviewMedia.findMany({ where: { review: { productId, status: "APPROVED", deletedAt: null } }, orderBy: { review: { createdAt: "desc" } }, take: 24, select: { url: true, type: true, reviewId: true } }),
  ]);
  const variants = variantRows.length > 1 ? await db.variant.findMany({ where: { id: { in: variantRows.map((v) => v.variantId!) } }, select: { id: true, titleUz: true, titleRu: true } }) : [];
  const stored = product.reviewSummary as ReviewSummary | null;
  const summary = stored && locale === "ru" && stored.ru ? { ...stored, ...stored.ru } : stored;
  const tx = (s: string) => showText(s, locale);
  return {
    rating: product.rating,
    count: product.reviewCount,
    breakdown: (product.ratingBreakdown as Record<string, number> | null) ?? { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
    summary: summary ? { ...summary, pros: summary.pros.map(tx), cons: summary.cons.map(tx), mentions: summary.mentions.map((m) => ({ ...m, term: tx(m.term) })) } : null,
    withMedia,
    variants: variants.map((v) => ({ id: v.id, title: locale === "ru" ? v.titleRu || v.titleUz : locText(v.titleUz, locale), count: variantRows.find((x) => x.variantId === v.id)?._count._all ?? 0 })),
    media: mediaRows.map((m) => ({ url: m.url, type: m.type, reviewId: m.reviewId })),
  };
}

/** The delivered order the viewer can still review this product from (if any). */
export async function pendingReviewFor(userId: string, productId: string) {
  const items = await db.orderItem.findMany({ where: { productId, order: { userId, status: "DELIVERED" } }, select: { orderId: true }, orderBy: { order: { deliveredAt: "desc" } } });
  if (!items.length) return null;
  const done = await db.review.findMany({ where: { productId, orderId: { in: items.map((i) => i.orderId) }, deletedAt: null }, select: { orderId: true, id: true } });
  const free = items.find((i) => !done.some((d) => d.orderId === i.orderId));
  return free ? { orderId: free.orderId } : { reviewId: done[0]?.id ?? null };
}

// ── Q&A ──────────────────────────────────────────────────────────────────

export async function listQuestions(productId: string, viewerId: string | null, locale: string, page = 1, pageSize = 5) {
  const where: Prisma.QuestionWhereInput = { productId, OR: [{ status: "PUBLISHED" }, ...(viewerId ? [{ userId: viewerId }] : [])] };
  const [rows, total, product] = await Promise.all([
    db.question.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { name: true } }, answers: { where: { OR: [{ status: "PUBLISHED" }, ...(viewerId ? [{ userId: viewerId }] : [])] }, orderBy: [{ isSeller: "desc" }, { createdAt: "asc" }], include: { user: { select: { name: true } } } } },
    }),
    db.question.count({ where }),
    db.product.findUniqueOrThrow({ where: { id: productId }, select: { shop: { select: { ownerId: true, name: true } } } }),
  ]);
  let canAnswer = false;
  if (viewerId) canAnswer = product.shop.ownerId === viewerId || (await db.orderItem.count({ where: { productId, order: { userId: viewerId, status: "DELIVERED" } } })) > 0;
  const first = (n: string | null) => locText(n?.split(" ")[0] ?? "", locale) || null;
  return {
    canAnswer,
    total,
    hasMore: page * pageSize < total,
    items: rows.map((q) => ({
      id: q.id,
      text: q.text,
      author: first(q.user.name),
      createdAt: q.createdAt.toISOString(),
      pending: q.status !== "PUBLISHED",
      answers: q.answers.map((a) => ({ id: a.id, text: a.text, isSeller: a.isSeller, author: a.isSeller ? product.shop.name : first(a.user.name), createdAt: a.createdAt.toISOString(), pending: a.status !== "PUBLISHED" })),
    })),
  };
}

// ── Buyer: my reviews ────────────────────────────────────────────────────

export async function myReviews(userId: string, locale: string) {
  const [reviews, delivered] = await Promise.all([
    db.review.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "desc" }, include: { product: { select: { slug: true, titleUz: true, titleRu: true, titleCyrl: true, media: { take: 1, orderBy: { sort: "asc" }, select: { url: true } } } }, media: true, reply: true } }),
    db.orderItem.findMany({ where: { order: { userId, status: "DELIVERED", deliveredAt: { gte: new Date(Date.now() - 180 * 86_400_000) } } }, orderBy: { order: { deliveredAt: "desc" } }, include: { order: { select: { id: true, number: true, deliveredAt: true, shopReview: { select: { id: true } }, shop: { select: { name: true } } } } } }),
  ]);
  const reviewed = new Set(reviews.map((r) => `${r.orderId}:${r.productId}`));
  const seen = new Set<string>();
  const awaiting = delivered.filter((i) => {
    const key = `${i.orderId}:${i.productId}`;
    if (reviewed.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const title = (p: { titleUz: string; titleRu: string | null; titleCyrl: string | null }) => (locale === "ru" ? p.titleRu || p.titleUz : locale === "uz-Cyrl" ? p.titleCyrl || locText(p.titleUz, locale) : p.titleUz);
  const shopsToRate = new Map<string, { orderId: string; number: string; shop: string }>();
  for (const i of delivered) if (!i.order.shopReview && !shopsToRate.has(i.orderId)) shopsToRate.set(i.orderId, { orderId: i.orderId, number: i.order.number, shop: i.order.shop.name });
  return {
    awaiting: awaiting.map((i) => ({ orderId: i.orderId, orderNumber: i.order.number, productId: i.productId, title: i.title, variant: i.variantTitle, imageUrl: i.imageUrl, deliveredAt: i.order.deliveredAt?.toISOString() ?? null })),
    reviews: reviews.map((r) => ({
      id: r.id,
      productSlug: r.product.slug,
      title: title(r.product),
      imageUrl: r.product.media[0]?.url ?? null,
      rating: r.rating,
      text: [r.pros, r.cons, r.comment].filter(Boolean).join(" · "),
      status: r.status,
      rejectReason: r.rejectReason,
      editable: r.editableUntil > new Date(),
      editableUntil: r.editableUntil.toISOString(),
      createdAt: r.createdAt.toISOString(),
      mediaCount: r.media.length,
      bonus: !!r.bonusAwardedAt,
      helpful: r.helpfulCount,
      reply: r.reply?.text ?? null,
    })),
    shopsToRate: [...shopsToRate.values()],
  };
}

export async function reviewForEdit(userId: string, reviewId: string) {
  return db.review.findFirst({ where: { id: reviewId, userId, deletedAt: null }, include: { media: { orderBy: { sort: "asc" } }, product: { select: { id: true, slug: true, titleUz: true, titleRu: true, titleCyrl: true, media: { take: 1, orderBy: { sort: "asc" } } } } } });
}

// ── Seller ───────────────────────────────────────────────────────────────

export type SellerReviewTab = "unanswered" | "negative" | "all" | "removal";

export async function sellerReviews(ownerId: string, tab: SellerReviewTab, page: number, locale: string, pageSize = 15) {
  const base: Prisma.ReviewWhereInput = { product: { shop: { ownerId } }, deletedAt: null, status: { in: ["APPROVED", "PENDING"] } };
  const where: Prisma.ReviewWhereInput =
    tab === "unanswered" ? { ...base, status: "APPROVED", reply: { is: null } } : tab === "negative" ? { ...base, rating: { lte: 3 } } : tab === "removal" ? { ...base, reports: { some: { source: "SELLER" } } } : base;
  const [rows, total, counts, agg, shop] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { ...reviewInclude(null), product: { select: { slug: true, titleUz: true, titleRu: true } }, reports: { where: { source: "SELLER" }, select: { status: true, reason: true, decisionNote: true } } },
    }),
    db.review.count({ where }),
    Promise.all([
      db.review.count({ where: { ...base, status: "APPROVED", reply: { is: null } } }),
      db.review.count({ where: { ...base, rating: { lte: 3 } } }),
      db.review.count({ where: { ...base, reports: { some: { source: "SELLER" } } } }),
    ]),
    db.review.aggregate({ where: { ...base, status: "APPROVED" }, _avg: { rating: true }, _count: { _all: true } }),
    db.shop.findFirst({ where: { ownerId }, select: { responseTimeMins: true, rating: true } }),
  ]);
  const replied = await db.review.count({ where: { ...base, status: "APPROVED", reply: { isNot: null } } });
  return {
    items: rows.map((r) => ({
      ...toReviewView(r as unknown as ReviewRow, locale, null),
      status: r.status,
      product: { slug: r.product.slug, title: locale === "ru" ? r.product.titleRu || r.product.titleUz : locText(r.product.titleUz, locale) },
      removal: r.reports[0] ?? null,
    })),
    total,
    counts: { unanswered: counts[0], negative: counts[1], removal: counts[2] },
    stats: { avg: agg._avg.rating ?? 0, count: agg._count._all, replyRate: agg._count._all ? replied / agg._count._all : 0, responseTimeMins: shop?.responseTimeMins ?? null, shopRating: shop?.rating ?? 0 },
  };
}

export async function sellerQuestions(ownerId: string, tab: "unanswered" | "all", page: number, pageSize = 15) {
  const base: Prisma.QuestionWhereInput = { product: { shop: { ownerId } }, status: "PUBLISHED" };
  const where = tab === "unanswered" ? { ...base, answers: { none: { isSeller: true } } } : base;
  const [rows, total, unanswered] = await Promise.all([
    db.question.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { product: { select: { slug: true, titleUz: true } }, user: { select: { name: true } }, answers: { orderBy: { createdAt: "asc" }, select: { id: true, text: true, isSeller: true, createdAt: true } } } }),
    db.question.count({ where }),
    db.question.count({ where: { ...base, answers: { none: { isSeller: true } } } }),
  ]);
  return { items: rows, total, unanswered };
}

// ── Moderation (admin) ───────────────────────────────────────────────────

export type ModTab = "flagged" | "reported" | "removal" | "qa" | "shop" | "history";

export type ModRow = {
  id: string;
  status: string;
  rating: number;
  pros: string | null;
  cons: string | null;
  comment: string | null;
  createdAt: string;
  flags: string[];
  flagScore: number;
  product: { slug: string; title: string; shop: string };
  author: { login: string; name: string | null; ageDays: number; reviews: number; banned: boolean };
  media: Array<{ url: string; type: string }>;
  reports: Array<{ id: string; source: "USER" | "SELLER"; reason: string; details: string | null; login: string; createdAt: string }>;
  history: Array<{ action: string; reason: string | null; createdAt: string }>;
};

export async function moderationCounts() {
  const [flagged, reported, removal, questions, answers, shop] = await Promise.all([
    db.review.count({ where: { status: "PENDING", deletedAt: null } }),
    db.review.count({ where: { deletedAt: null, reports: { some: { status: "OPEN", source: "USER" } } } }),
    db.review.count({ where: { deletedAt: null, reports: { some: { status: "OPEN", source: "SELLER" } } } }),
    db.question.count({ where: { status: "PENDING" } }),
    db.answer.count({ where: { status: "PENDING" } }),
    db.shopReview.count({ where: { status: "PENDING" } }),
  ]);
  return { flagged, reported, removal, qa: questions + answers, shop };
}

const modInclude = {
  product: { select: { slug: true, titleUz: true, shop: { select: { name: true } } } },
  user: { select: { login: true, name: true, createdAt: true, reviewBannedAt: true, _count: { select: { reviews: true } } } },
  media: true,
  reports: { where: { status: "OPEN" as const }, orderBy: { createdAt: "desc" as const }, include: { user: { select: { login: true } } } },
  moderationActions: { orderBy: { createdAt: "desc" as const }, take: 5 },
} satisfies Prisma.ReviewInclude;

export async function moderationQueue(tab: Exclude<ModTab, "qa" | "shop" | "history">, page: number, opts: { q?: string; minScore?: number } = {}, pageSize = 20) {
  const where: Prisma.ReviewWhereInput = {
    deletedAt: null,
    ...(tab === "flagged" ? { status: "PENDING" } : tab === "reported" ? { reports: { some: { status: "OPEN", source: "USER" } } } : { reports: { some: { status: "OPEN", source: "SELLER" } } }),
    ...(opts.minScore ? { flagScore: { gte: opts.minScore } } : {}),
    ...(opts.q ? { OR: [{ comment: { contains: opts.q, mode: "insensitive" } }, { pros: { contains: opts.q, mode: "insensitive" } }, { user: { login: { contains: opts.q, mode: "insensitive" } } }, { product: { titleUz: { contains: opts.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.review.findMany({ where, include: modInclude, orderBy: tab === "flagged" ? [{ flagScore: "desc" }, { createdAt: "asc" }] : [{ createdAt: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    db.review.count({ where }),
  ]);
  const now = Date.now();
  const data: ModRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    rating: r.rating,
    pros: r.pros,
    cons: r.cons,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    flags: r.flags,
    flagScore: r.flagScore,
    product: { slug: r.product.slug, title: r.product.titleUz, shop: r.product.shop.name },
    author: { login: r.user.login, name: r.user.name, ageDays: Math.floor((now - r.user.createdAt.getTime()) / 86_400_000), reviews: r.user._count.reviews, banned: !!r.user.reviewBannedAt },
    media: r.media.map((m) => ({ url: m.url, type: m.type })),
    reports: r.reports.map((x) => ({ id: x.id, source: x.source, reason: x.reason, details: x.details, login: x.user.login, createdAt: x.createdAt.toISOString() })),
    history: [...r.moderationActions].reverse().map((h) => ({ action: h.action, reason: h.reason, createdAt: h.createdAt.toISOString() })),
  }));
  return { rows: data, total };
}

export async function pendingQA() {
  const [questions, answers] = await Promise.all([
    db.question.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 50, include: { product: { select: { slug: true, titleUz: true } }, user: { select: { login: true } } } }),
    db.answer.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 50, include: { question: { select: { text: true, product: { select: { slug: true, titleUz: true } } } }, user: { select: { login: true } } } }),
  ]);
  return { questions, answers };
}

export async function pendingShopReviews() {
  return db.shopReview.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 50, include: { shop: { select: { name: true } }, user: { select: { login: true } }, order: { select: { number: true } } } });
}

export async function moderationHistory(page: number, pageSize = 30) {
  const [rows, total] = await Promise.all([
    db.reviewModerationAction.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { review: { select: { id: true, rating: true, comment: true, product: { select: { slug: true, titleUz: true } } } } } }),
    db.reviewModerationAction.count(),
  ]);
  const actors = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])] } }, select: { id: true, login: true } });
  return { rows: rows.map((r) => ({ ...r, actor: actors.find((a) => a.id === r.actorId)?.login ?? null })), total };
}

/** Platform review analytics for the moderation dashboard. */
export async function reviewAnalytics(weeks = 12) {
  const since = new Date(Date.now() - weeks * 7 * 86_400_000);
  const [trend, reported, shops, statusRows, autoFlags] = await Promise.all([
    db.$queryRaw<Array<{ week: Date; avg: number; n: bigint }>>`
      SELECT date_trunc('week', "createdAt" AT TIME ZONE 'Asia/Tashkent') AS week, AVG(rating)::float AS avg, COUNT(*) AS n
      FROM "Review" WHERE "createdAt" >= ${since} AND status = 'APPROVED' AND "deletedAt" IS NULL
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<Array<{ productId: string; reports: bigint }>>`
      SELECT r."productId", COUNT(rr.id) AS reports FROM "ReviewReport" rr JOIN "Review" r ON r.id = rr."reviewId"
      WHERE rr."createdAt" >= ${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    db.shop.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true, rating: true, responseTimeMins: true, _count: { select: { reviewReplies: true } } }, orderBy: { rating: "desc" } }),
    db.review.groupBy({ by: ["status"], _count: { _all: true }, where: { createdAt: { gte: since } } }),
    db.reviewModerationAction.count({ where: { action: "AUTO_FLAG", createdAt: { gte: since } } }),
  ]);
  const shopReviewCounts = await db.review.groupBy({ by: ["productId"], where: { status: "APPROVED", deletedAt: null }, _count: { _all: true } });
  const productShop = await db.product.findMany({ where: { id: { in: shopReviewCounts.map((r) => r.productId) } }, select: { id: true, shopId: true } });
  const perShop = new Map<string, number>();
  for (const r of shopReviewCounts) {
    const sid = productShop.find((p) => p.id === r.productId)?.shopId;
    if (sid) perShop.set(sid, (perShop.get(sid) ?? 0) + r._count._all);
  }
  const products = await db.product.findMany({ where: { id: { in: reported.map((r) => r.productId) } }, select: { id: true, slug: true, titleUz: true, rating: true, shop: { select: { name: true } } } });
  return {
    trend: trend.map((t) => ({ week: t.week.toISOString(), avg: Number(t.avg), count: Number(t.n) })),
    mostReported: reported.map((r) => ({ ...products.find((p) => p.id === r.productId)!, reports: Number(r.reports) })).filter((r) => r.slug),
    shops: shops.map((s) => ({ name: s.name, rating: s.rating, responseTimeMins: s.responseTimeMins, replies: s._count.reviewReplies, reviews: perShop.get(s.id) ?? 0 })),
    status: Object.fromEntries(statusRows.map((s) => [s.status, s._count._all])) as Record<string, number>,
    autoFlags,
  };
}
