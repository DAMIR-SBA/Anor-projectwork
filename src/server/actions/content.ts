"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { activeShop } from "@/server/services/seller/context";
import { createVideo, deleteVideo, recordVideoView, setVideoActive, toggleVideoLike } from "@/server/services/videos";
import { endStream, hideLiveMessage, likeStream, scheduleStream, sendLiveChat, setLivePrice, showProduct, startStream } from "@/server/services/live";
import { answerOffer, completeTradeIn, reviewTradeIn, submitTradeIn } from "@/server/services/tradein";
import { CATEGORIES } from "@/lib/tradein";
import { LIVE_CHAT_MAX, LIVE_PRICE_MINUTES, MAX_PINNED } from "@/lib/live";

const rl = (key: string) => ({ key, ...LIMITS.mutation });
const host = (u: { id: string; login: string }) => ({ userId: u.id, login: u.login });

// ── Videos ───────────────────────────────────────────────────────────────

export const likeVideoAction = action({ rateLimit: { key: "video.like", limit: 60, window: 60 }, schema: z.object({ videoId: z.string() }) }, async (i, ctx) => ({ ok: true, data: await toggleVideoLike(ctx.user.id, i.videoId) }));

export const viewVideoAction = action({ auth: "public", rateLimit: { key: "video.view", limit: 120, window: 60 }, schema: z.object({ videoId: z.string() }) }, async (i) => {
  await recordVideoView(i.videoId);
});

const zCaption = z.string().trim().min(3).max(150);

export const createVideoAction = action(
  { rateLimit: rl("seller.videos"), schema: z.object({ url: z.string().max(500), posterUrl: z.string().max(500).nullish(), captionUz: zCaption, captionRu: zCaption, productId: z.string().nullish() }) },
  async (i, ctx) => {
    const shop = await activeShop(ctx.user.id);
    await createVideo(shop.id, { url: i.url, posterUrl: i.posterUrl ?? null, captionUz: i.captionUz, captionRu: i.captionRu, productId: i.productId || null });
    revalidatePath("/[locale]/seller/videos", "page");
    revalidatePath("/[locale]/videos", "page");
  },
);

export const toggleVideoAction = action({ rateLimit: rl("seller.videos"), schema: z.object({ id: z.string(), active: z.boolean() }) }, async (i, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await setVideoActive(shop.id, i.id, i.active);
  revalidatePath("/[locale]/seller/videos", "page");
});

export const deleteVideoAction = action({ rateLimit: rl("seller.videos"), schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await deleteVideo(shop.id, i.id);
  revalidatePath("/[locale]/seller/videos", "page");
});

// ── Live shopping ────────────────────────────────────────────────────────

export const liveChatAction = action({ rateLimit: { key: "live.chat", limit: 20, window: 60 }, schema: z.object({ streamId: z.string(), text: z.string().trim().min(1).max(LIVE_CHAT_MAX) }) }, async (i, ctx) => ({
  ok: true,
  data: await sendLiveChat(ctx.user, i.streamId, i.text),
}));

export const liveLikeAction = action({ auth: "public", rateLimit: { key: "live.like", limit: 30, window: 60 }, schema: z.object({ streamId: z.string() }) }, async (i) => {
  await likeStream(i.streamId);
});

export const scheduleLiveAction = action(
  {
    rateLimit: rl("seller.live"),
    schema: z.object({
      titleUz: z.string().trim().min(3).max(120),
      titleRu: z.string().trim().min(3).max(120),
      startsAt: z.coerce.date(),
      posterUrl: z.string().max(500).nullish(),
      streamUrl: z.string().max(500).nullish(),
      pinnedProductIds: z.array(z.string()).min(1).max(MAX_PINNED),
    }),
  },
  async (i, ctx) => {
    const shop = await activeShop(ctx.user.id);
    const s = await scheduleStream(shop.id, host(ctx.user), { ...i, posterUrl: i.posterUrl || null, streamUrl: i.streamUrl || null });
    revalidatePath("/[locale]/seller/live", "page");
    return { ok: true, data: { id: s.id } };
  },
);

export const liveControlAction = action(
  {
    rateLimit: rl("seller.live"),
    schema: z.discriminatedUnion("op", [
      z.object({ op: z.literal("start"), streamId: z.string() }),
      z.object({ op: z.literal("end"), streamId: z.string() }),
      z.object({ op: z.literal("show"), streamId: z.string(), productId: z.string() }),
      z.object({ op: z.literal("price"), streamId: z.string(), productId: z.string(), price: z.coerce.number().int().positive(), minutes: z.coerce.number().refine((m) => (LIVE_PRICE_MINUTES as readonly number[]).includes(m)) }),
      z.object({ op: z.literal("hide"), streamId: z.string(), messageId: z.string() }),
    ]),
  },
  async (i, ctx) => {
    const shop = await activeShop(ctx.user.id);
    if (i.op === "start") await startStream(shop.id, host(ctx.user), i.streamId);
    else if (i.op === "end") await endStream(shop.id, host(ctx.user), i.streamId);
    else if (i.op === "show") await showProduct(shop.id, i.streamId, i.productId);
    else if (i.op === "price") await setLivePrice(shop.id, host(ctx.user), i.streamId, i.productId, i.price, i.minutes);
    else await hideLiveMessage(shop.id, i.streamId, i.messageId);
    if (i.op === "start" || i.op === "end") {
      revalidatePath("/[locale]/seller/live", "page");
      revalidatePath("/[locale]/live", "layout");
    }
  },
);

// ── Trade-in ─────────────────────────────────────────────────────────────

export const submitTradeInAction = action(
  {
    rateLimit: { key: "tradein.submit", limit: 5, window: 3600 },
    schema: z.object({
      category: z.enum(CATEGORIES as [string, ...string[]]),
      modelKey: z.string().max(60),
      answers: z.object({ powersOn: z.boolean(), screen: z.enum(["perfect", "scratches", "cracked"]), body: z.enum(["perfect", "light", "heavy"]), battery: z.enum(["good", "fair", "poor"]), accessories: z.boolean(), locked: z.boolean() }),
      photos: z.array(z.string().max(500)).max(6),
      imeiLast4: z
        .string()
        .trim()
        .refine((v) => !v || /^\d{4}$/.test(v), { message: "imeiLast4" })
        .transform((v) => v || null),
    }),
  },
  async (i, ctx) => {
    const r = await submitTradeIn(ctx.user.id, i);
    revalidatePath("/[locale]/account/trade-in", "page");
    return { ok: true, data: { number: r.number } };
  },
);

export const answerTradeInAction = action({ rateLimit: rl("tradein.answer"), schema: z.object({ id: z.string(), accept: z.boolean() }) }, async (i, ctx) => {
  await answerOffer(ctx.user.id, i.id, i.accept);
  revalidatePath("/[locale]/account/trade-in", "page");
});

const staff = (s: { user: { id: string; login: string } }) => ({ id: s.user.id, login: s.user.login });

export const offerTradeInAction = action({ auth: "staff", permission: "returns.manage", rateLimit: rl("admin.tradein"), schema: z.object({ id: z.string(), offeredValue: z.coerce.number().int().positive(), note: z.string().trim().max(500).nullish() }) }, async (i, ctx) => {
  await reviewTradeIn(staff(ctx.staff), i.id, { decision: "offer", offeredValue: i.offeredValue, note: i.note || null });
  revalidatePath("/[locale]/admin/trade-in", "page");
});

/** `reason` comes from the ActionButton reason dialog and is shown to the buyer. */
export const rejectTradeInAction = action({ auth: "staff", permission: "returns.manage", rateLimit: rl("admin.tradein"), schema: z.object({ id: z.string(), reason: z.string().trim().min(3).max(500) }) }, async (i, ctx) => {
  await reviewTradeIn(staff(ctx.staff), i.id, { decision: "reject", note: i.reason });
  revalidatePath("/[locale]/admin/trade-in", "page");
});

export const completeTradeInAction = action({ auth: "staff", permission: "returns.manage", rateLimit: rl("admin.tradein"), schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  await completeTradeIn(staff(ctx.staff), i.id);
  revalidatePath("/[locale]/admin/trade-in", "page");
});
