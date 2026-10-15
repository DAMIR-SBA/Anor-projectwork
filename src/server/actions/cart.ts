"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { db } from "@/server/db";
import { action, AppError, zInt } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { addItem, assertCartAccess, createGroupCart, loadCartView, resolveCart, resolveGroupCart, setItemQuantity } from "@/server/services/cart";
import { getCurrentUser } from "@/server/auth/session";

const rl = { key: "cart", ...LIMITS.mutation };

export const addToCartAction = action(
  { auth: "public", rateLimit: rl, schema: z.object({ variantId: z.string().min(10), quantity: zInt(1, 99).default(1), groupCode: z.string().optional() }) },
  async (input, ctx) => {
    let cartId: string;
    if (input.groupCode) {
      if (!ctx.user) throw new AppError("unauthorized");
      const g = await resolveGroupCart(input.groupCode);
      if (!g) throw new AppError("notFound");
      cartId = g.id;
    } else {
      cartId = (await resolveCart(ctx.user, true))!.id;
    }
    const qty = await addItem(cartId, input.variantId, input.quantity, ctx.user?.id ?? null);
    const count = await db.cartItem.aggregate({ _sum: { quantity: true }, where: { cartId } });
    revalidatePath("/[locale]", "layout");
    return { ok: true, data: { quantity: qty, cartCount: count._sum.quantity ?? 0 } };
  },
);

export const updateCartItemAction = action(
  { auth: "public", rateLimit: rl, schema: z.object({ cartId: z.string(), itemId: z.string(), quantity: zInt(0, 99) }) },
  async (input, ctx) => {
    await assertCartAccess(input.cartId, ctx.user);
    await setItemQuantity(input.cartId, input.itemId, input.quantity);
    return { ok: true, data: await loadCartView(input.cartId, ctx.user, await getLocale()) };
  },
);

export const toggleCartItemsAction = action(
  { auth: "public", rateLimit: rl, schema: z.object({ cartId: z.string(), itemIds: z.array(z.string()).max(200), selected: z.boolean() }) },
  async (input, ctx) => {
    await assertCartAccess(input.cartId, ctx.user);
    await db.cartItem.updateMany({ where: { cartId: input.cartId, id: { in: input.itemIds } }, data: { selected: input.selected } });
    return { ok: true, data: await loadCartView(input.cartId, ctx.user, await getLocale()) };
  },
);

export const removeCartItemsAction = action(
  { auth: "public", rateLimit: rl, schema: z.object({ cartId: z.string(), itemIds: z.array(z.string()).max(200) }) },
  async (input, ctx) => {
    await assertCartAccess(input.cartId, ctx.user);
    await db.cartItem.deleteMany({ where: { cartId: input.cartId, id: { in: input.itemIds } } });
    revalidatePath("/[locale]", "layout");
    return { ok: true, data: await loadCartView(input.cartId, ctx.user, await getLocale()) };
  },
);

export const applyCouponAction = action(
  { auth: "public", rateLimit: { key: "coupon", limit: 20, window: 600 }, schema: z.object({ cartId: z.string(), code: z.string().trim().max(32) }) },
  async (input, ctx) => {
    await assertCartAccess(input.cartId, ctx.user);
    const code = input.code.toUpperCase();
    if (code) {
      const coupon = await db.coupon.findUnique({ where: { code } });
      if (!coupon) throw new AppError("couponNotFound", undefined, "code");
    }
    await db.cart.update({ where: { id: input.cartId }, data: { couponCode: code || null } });
    return { ok: true, data: await loadCartView(input.cartId, ctx.user, await getLocale()) };
  },
);

export const moveToWishlistAction = action({ rateLimit: rl, schema: z.object({ cartId: z.string(), itemId: z.string() }) }, async (input, ctx) => {
  await assertCartAccess(input.cartId, ctx.user);
  const item = await db.cartItem.findFirst({ where: { id: input.itemId, cartId: input.cartId }, include: { variant: true } });
  if (!item) throw new AppError("notFound");
  const wl = await db.wishlist.findUniqueOrThrow({ where: { userId: ctx.user.id } });
  await db.wishlistItem.upsert({ where: { wishlistId_productId: { wishlistId: wl.id, productId: item.variant.productId } }, create: { wishlistId: wl.id, productId: item.variant.productId }, update: {} });
  await db.cartItem.delete({ where: { id: item.id } });
  revalidatePath("/[locale]", "layout");
  return { ok: true, data: await loadCartView(input.cartId, ctx.user, await getLocale()) };
});

export const createGroupCartAction = action({ rateLimit: rl }, async (_i, ctx) => {
  const cart = await createGroupCart(ctx.user);
  return { ok: true, data: { code: cart.shareCode } };
});

// ── Wishlist ─────────────────────────────────────────────────────────────

export const toggleWishlistAction = action({ rateLimit: rl, schema: z.object({ productId: z.string() }) }, async (input, ctx) => {
  const wl = await db.wishlist.findUniqueOrThrow({ where: { userId: ctx.user.id } });
  const key = { wishlistId_productId: { wishlistId: wl.id, productId: input.productId } };
  const existing = await db.wishlistItem.findUnique({ where: key });
  if (existing) await db.wishlistItem.delete({ where: key });
  else {
    await db.wishlistItem.create({ data: { wishlistId: wl.id, productId: input.productId } });
    const { trackMission } = await import("@/server/services/missions");
    await trackMission(ctx.user.id, "ADD_WISHLIST");
  }
  revalidatePath("/[locale]", "layout");
  return { ok: true, data: { liked: !existing } };
});

export const setWishlistPublicAction = action({ schema: z.object({ isPublic: z.boolean() }) }, async (input, ctx) => {
  const wl = await db.wishlist.update({ where: { userId: ctx.user.id }, data: { isPublic: input.isPublic } });
  return { ok: true, data: { token: wl.shareToken } };
});

// ── Price-drop / back-in-stock / pre-order alerts ─────────────────────────

export const subscribeAlertAction = action(
  { rateLimit: rl, schema: z.object({ productId: z.string(), variantId: z.string().optional(), type: z.enum(["PRICE_DROP", "BACK_IN_STOCK", "PREORDER"]), targetPrice: zInt(0).optional() }) },
  async (input, ctx) => {
    const key = { userId_productId_type: { userId: ctx.user.id, productId: input.productId, type: input.type } };
    const existing = await db.productAlert.findUnique({ where: key });
    if (existing && !existing.notifiedAt) {
      await db.productAlert.delete({ where: key });
      return { ok: true, data: { subscribed: false } };
    }
    await db.productAlert.upsert({
      where: key,
      create: { userId: ctx.user.id, productId: input.productId, variantId: input.variantId, type: input.type, targetPrice: input.targetPrice },
      update: { notifiedAt: null, targetPrice: input.targetPrice, variantId: input.variantId },
    });
    return { ok: true, data: { subscribed: true } };
  },
);

export async function cartCountAction() {
  const user = await getCurrentUser();
  const cart = await resolveCart(user, false);
  if (!cart) return 0;
  const agg = await db.cartItem.aggregate({ _sum: { quantity: true }, where: { cartId: cart.id } });
  return agg._sum.quantity ?? 0;
}
