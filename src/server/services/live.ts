import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { publish } from "@/server/realtime/bus";
import { isOwnStorageUrl } from "@/server/storage";
import { cardsByIds } from "./catalog";
import { activeTimedPrice, LIVE_CHAT_MAX, MAX_PINNED, parseTimedPrices, timedPriceAllowed, withTimedPrice } from "@/lib/live";
import { hasProfanity, maskContacts } from "@/lib/review-moderation";
import { publicName } from "@/lib/gamification";
import { loc, locText } from "@/lib/localized";

export const liveChannel = (id: string) => `live:${id}`;

/**
 * Live prices that apply right now, by product. Used by the cart and checkout next to campaign
 * prices: the lower of the two wins, and only while the stream is on air.
 */
export async function liveTimedPrices(productIds: string[], now = new Date()): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!productIds.length) return out;
  const streams = await db.liveStream.findMany({ where: { status: "LIVE", pinnedProductIds: { hasSome: productIds } }, select: { timedPrices: true } });
  for (const s of streams) {
    const list = parseTimedPrices(s.timedPrices);
    for (const pid of productIds) {
      const p = activeTimedPrice(list, pid, now);
      if (p && (!out.has(pid) || p.price < out.get(pid)!)) out.set(pid, p.price);
    }
  }
  return out;
}

const shopSelect = { name: true, slug: true, logoUrl: true } as const;

export async function liveList(locale: string) {
  const now = Date.now();
  const rows = await db.liveStream.findMany({
    where: { shop: { status: "APPROVED" }, OR: [{ status: "LIVE" }, { status: "SCHEDULED", startsAt: { gte: new Date(now - 3_600_000) } }, { status: "ENDED", endedAt: { gte: new Date(now - 7 * 86_400_000) } }] },
    orderBy: { startsAt: "asc" },
    include: { shop: { select: shopSelect } },
    take: 30,
  });
  const order = { LIVE: 0, SCHEDULED: 1, ENDED: 2 } as const;
  return rows
    .sort((a, b) => order[a.status] - order[b.status] || (a.status === "ENDED" ? b.startsAt.getTime() - a.startsAt.getTime() : a.startsAt.getTime() - b.startsAt.getTime()))
    .map((s) => ({ id: s.id, title: loc(s, "title", locale), status: s.status, startsAt: s.startsAt.toISOString(), posterUrl: s.posterUrl, viewers: s.viewers, peakViewers: s.peakViewers, shop: { ...s.shop, name: locText(s.shop.name, locale) }, products: s.pinnedProductIds.length }));
}

export async function liveStreamView(id: string, locale: string, viewerId: string | null = null) {
  const s = await db.liveStream.findFirst({ where: { id, shop: { status: "APPROVED" } }, include: { shop: { select: { ...shopSelect, id: true, ownerId: true } } } });
  if (!s) return null;
  const [cards, messages] = await Promise.all([
    cardsByIds(s.pinnedProductIds, locale),
    db.liveChatMessage.findMany({ where: { streamId: id, hidden: false }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true, login: true } } } }),
  ]);
  const order = new Map(s.pinnedProductIds.map((pid, i) => [pid, i]));
  cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return {
    id: s.id,
    title: loc(s, "title", locale),
    status: s.status,
    startsAt: s.startsAt.toISOString(),
    streamUrl: s.streamUrl,
    posterUrl: s.posterUrl,
    viewers: s.viewers,
    likes: s.likes,
    currentProductId: s.currentProductId,
    shop: { id: s.shop.id, ownerId: s.shop.ownerId, name: locText(s.shop.name, locale), slug: s.shop.slug, logoUrl: s.shop.logoUrl },
    products: cards,
    timedPrices: s.status === "LIVE" ? parseTimedPrices(s.timedPrices).filter((p) => Date.parse(p.to) > Date.now()) : [],
    messages: messages.reverse().map((m) => ({ id: m.id, name: publicName(m.user.name, m.user.login), text: m.text, at: m.createdAt.toISOString(), mine: m.userId === viewerId })),
  };
}

export async function sendLiveChat(user: { id: string; name: string | null; login: string }, streamId: string, raw: string) {
  const s = await db.liveStream.findUnique({ where: { id: streamId }, select: { status: true } });
  if (!s) throw new AppError("notFound");
  if (s.status !== "LIVE") throw new AppError("liveNotOnAir");
  const text = maskContacts(raw.trim().slice(0, LIVE_CHAT_MAX));
  if (!text) throw new AppError("invalidInput", undefined, "text");
  if (hasProfanity(text)) throw new AppError("liveChatBlocked");
  const m = await db.liveChatMessage.create({ data: { streamId, userId: user.id, text } });
  // No user ids on the public channel: viewers only see the short public name.
  const payload = { id: m.id, name: publicName(user.name, user.login), text, at: m.createdAt.toISOString() };
  await publish(liveChannel(streamId), "live.chat", payload);
  return { ...payload, mine: true };
}

export async function likeStream(streamId: string) {
  const r = await db.liveStream.updateMany({ where: { id: streamId, status: "LIVE" }, data: { likes: { increment: 1 } } });
  if (!r.count) return;
  const s = await db.liveStream.findUnique({ where: { id: streamId }, select: { likes: true } });
  await publish(liveChannel(streamId), "live.likes", { likes: s?.likes ?? 0 });
}

/** SSE connections move the viewer counter; the peak is kept for the seller's stats. */
export async function viewerDelta(streamId: string, delta: 1 | -1) {
  const rows = await db.$queryRaw<Array<{ viewers: number }>>`
    UPDATE "LiveStream" SET viewers = GREATEST(0, viewers + ${delta}), "peakViewers" = GREATEST("peakViewers", viewers + ${delta})
    WHERE id = ${streamId} RETURNING viewers`;
  if (rows[0]) await publish(liveChannel(streamId), "live.viewers", { viewers: rows[0].viewers });
}

// ── Seller (host) ────────────────────────────────────────────────────────

type Host = { userId: string; login: string };

async function ownStream(shopId: string, id: string) {
  const s = await db.liveStream.findFirst({ where: { id, shopId } });
  if (!s) throw new AppError("notFound");
  return s;
}

export function sellerStreams(shopId: string) {
  return db.liveStream.findMany({ where: { shopId }, orderBy: { startsAt: "desc" }, take: 30, include: { _count: { select: { messages: true } } } });
}

export async function scheduleStream(shopId: string, host: Host, input: { titleUz: string; titleRu: string; startsAt: Date; posterUrl: string | null; streamUrl: string | null; pinnedProductIds: string[] }) {
  if (input.pinnedProductIds.length > MAX_PINNED) throw new AppError("invalidInput", undefined, "pinnedProductIds");
  const own = await db.product.count({ where: { id: { in: input.pinnedProductIds }, shopId, status: "ACTIVE", deletedAt: null } });
  if (own !== input.pinnedProductIds.length) throw new AppError("notFound", undefined, "pinnedProductIds");
  for (const u of [input.posterUrl, input.streamUrl]) if (u && !u.startsWith("/demo/videos/") && !isOwnStorageUrl(u) && !/^https:\/\//.test(u)) throw new AppError("invalidInput", undefined, "streamUrl");
  if (input.startsAt.getTime() < Date.now() - 5 * 60_000) throw new AppError("liveStartsInPast", undefined, "startsAt");
  const s = await db.liveStream.create({ data: { shopId, ...input, currentProductId: input.pinnedProductIds[0] ?? null } });
  await audit({ actorId: host.userId, actorLogin: host.login, actorKind: "seller", action: "live.scheduled", entityType: "LiveStream", entityId: s.id });
  return s;
}

export async function startStream(shopId: string, host: Host, id: string) {
  const s = await ownStream(shopId, id);
  if (s.status !== "SCHEDULED") throw new AppError("conflict");
  if (await db.liveStream.count({ where: { shopId, status: "LIVE" } })) throw new AppError("liveAlreadyOn");
  await db.liveStream.update({ where: { id }, data: { status: "LIVE", startedAt: new Date(), viewers: 0 } });
  await publish(liveChannel(id), "live.status", { status: "LIVE" });
  await audit({ actorId: host.userId, actorLogin: host.login, actorKind: "seller", action: "live.started", entityType: "LiveStream", entityId: id });
}

/** Ending closes every open live price at once. */
export async function endStream(shopId: string, host: Host, id: string) {
  const s = await ownStream(shopId, id);
  if (s.status !== "LIVE") throw new AppError("conflict");
  const now = new Date();
  const closed = parseTimedPrices(s.timedPrices).map((p) => (Date.parse(p.to) > now.getTime() ? { ...p, to: now.toISOString() } : p));
  await db.liveStream.update({ where: { id }, data: { status: "ENDED", endedAt: now, viewers: 0, timedPrices: closed } });
  await publish(liveChannel(id), "live.status", { status: "ENDED" });
  await audit({ actorId: host.userId, actorLogin: host.login, actorKind: "seller", action: "live.ended", entityType: "LiveStream", entityId: id, meta: { peakViewers: s.peakViewers, likes: s.likes } });
}

export async function showProduct(shopId: string, id: string, productId: string) {
  const s = await ownStream(shopId, id);
  if (!s.pinnedProductIds.includes(productId)) throw new AppError("notFound");
  await db.liveStream.update({ where: { id }, data: { currentProductId: productId } });
  await publish(liveChannel(id), "live.product", { productId });
}

export async function setLivePrice(shopId: string, host: Host, id: string, productId: string, price: number, minutes: number) {
  const s = await ownStream(shopId, id);
  if (s.status !== "LIVE") throw new AppError("liveNotOnAir");
  if (!s.pinnedProductIds.includes(productId)) throw new AppError("notFound");
  const variant = await db.variant.findFirst({ where: { productId }, orderBy: { price: "asc" }, select: { price: true } });
  if (!variant || !timedPriceAllowed(variant.price, price)) throw new AppError("livePriceRange", undefined, "price");
  const list = withTimedPrice(parseTimedPrices(s.timedPrices), productId, price, minutes);
  await db.liveStream.update({ where: { id }, data: { timedPrices: list, currentProductId: productId } });
  const added = list[list.length - 1];
  await publish(liveChannel(id), "live.price", added);
  await audit({ actorId: host.userId, actorLogin: host.login, actorKind: "seller", action: "live.price_set", entityType: "LiveStream", entityId: id, meta: { productId, price, minutes, listPrice: variant.price } });
  return added;
}

export async function hideLiveMessage(shopId: string, streamId: string, messageId: string) {
  await ownStream(shopId, streamId);
  const r = await db.liveChatMessage.updateMany({ where: { id: messageId, streamId }, data: { hidden: true } });
  if (r.count) await publish(liveChannel(streamId), "live.hide", { id: messageId });
}
