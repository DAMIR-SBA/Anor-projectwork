import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { isOwnStorageUrl } from "@/server/storage";
import { cardsByIds } from "./catalog";
import { locText } from "@/lib/localized";
import type { ProductCardData } from "@/lib/types";

export type FeedVideo = {
  id: string;
  url: string;
  posterUrl: string | null;
  caption: string;
  likes: number;
  views: number;
  liked: boolean;
  shop: { name: string; slug: string; logoUrl: string | null };
  product: ProductCardData | null;
};

/** Demo clips ship in /public; real uploads come from our own storage. */
const allowedVideoUrl = (u: string) => u.startsWith("/demo/videos/") || isOwnStorageUrl(u);

/** Newest first, nudged by engagement; only live shops and active videos. */
export async function videoFeed(locale: string, userId: string | null, opts: { take?: number; startId?: string } = {}): Promise<FeedVideo[]> {
  const rows = await db.shortVideo.findMany({
    where: { isActive: true, shop: { status: "APPROVED" } },
    orderBy: [{ createdAt: "desc" }],
    take: opts.take ?? 30,
    include: { shop: { select: { name: true, slug: true, logoUrl: true } }, likedBy: userId ? { where: { userId }, select: { userId: true } } : false },
  });
  // A shared link opens on that video first.
  if (opts.startId) rows.sort((a, b) => Number(b.id === opts.startId) - Number(a.id === opts.startId));
  const cards = await cardsByIds(rows.map((r) => r.productId).filter((x): x is string => !!x), locale);
  const byId = new Map(cards.map((c) => [c.id, c]));
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    posterUrl: r.posterUrl,
    caption: locale === "ru" ? r.captionRu || r.captionUz : locText(r.captionUz, locale),
    likes: r.likes,
    views: r.views,
    liked: Array.isArray(r.likedBy) && r.likedBy.length > 0,
    shop: { name: locText(r.shop.name, locale), slug: r.shop.slug, logoUrl: r.shop.logoUrl },
    product: (r.productId && byId.get(r.productId)) || null,
  }));
}

export async function toggleVideoLike(userId: string, videoId: string): Promise<{ liked: boolean; likes: number }> {
  const v = await db.shortVideo.findFirst({ where: { id: videoId, isActive: true }, select: { id: true } });
  if (!v) throw new AppError("notFound");
  return db.$transaction(async (tx) => {
    const gone = await tx.videoLike.deleteMany({ where: { videoId, userId } });
    if (gone.count) {
      const r = await tx.shortVideo.update({ where: { id: videoId }, data: { likes: { decrement: 1 } }, select: { likes: true } });
      return { liked: false, likes: Math.max(0, r.likes) };
    }
    await tx.videoLike.create({ data: { videoId, userId } });
    const r = await tx.shortVideo.update({ where: { id: videoId }, data: { likes: { increment: 1 } }, select: { likes: true } });
    return { liked: true, likes: r.likes };
  });
}

export async function recordVideoView(videoId: string) {
  await db.shortVideo.updateMany({ where: { id: videoId, isActive: true }, data: { views: { increment: 1 } } });
}

// ── Seller cabinet ───────────────────────────────────────────────────────

export function sellerVideos(shopId: string) {
  return db.shortVideo.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, include: { product: { select: { titleUz: true, slug: true } } } });
}

export async function createVideo(shopId: string, input: { url: string; posterUrl: string | null; captionUz: string; captionRu: string; productId: string | null }) {
  if (!allowedVideoUrl(input.url) || (input.posterUrl && !isOwnStorageUrl(input.posterUrl) && !input.posterUrl.startsWith("/demo/videos/"))) throw new AppError("invalidInput", undefined, "url");
  if (input.productId && !(await db.product.findFirst({ where: { id: input.productId, shopId, deletedAt: null }, select: { id: true } }))) throw new AppError("notFound", undefined, "productId");
  if ((await db.shortVideo.count({ where: { shopId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } })) >= 10) throw new AppError("videoDailyLimit", { max: 10 });
  return db.shortVideo.create({ data: { shopId, ...input } });
}

export async function setVideoActive(shopId: string, id: string, isActive: boolean) {
  const r = await db.shortVideo.updateMany({ where: { id, shopId }, data: { isActive } });
  if (!r.count) throw new AppError("notFound");
}

export async function deleteVideo(shopId: string, id: string) {
  const r = await db.shortVideo.deleteMany({ where: { id, shopId } });
  if (!r.count) throw new AppError("notFound");
}
