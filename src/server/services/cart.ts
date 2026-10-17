import "server-only";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { randomToken, randomCode } from "@/server/security/crypto";
import { computeCart, type CartLine, type Coupon, type Promotion } from "@/lib/pricing";
import { bestMonthly } from "@/lib/installment";
import { quotePriceFor } from "@/lib/b2b";
import { loc, locText } from "@/lib/localized";
import { earlyCampaignIds, getPlans, liveCampaignWhere } from "./catalog";
import { liveTimedPrices } from "./live";
import { GUEST_CART_COOKIE } from "./header-data";
import type { CurrentUser } from "@/server/auth/session";
import type { CartItemView, CartView } from "@/lib/types";

const MAX_QTY = 99;

/** categoryId → [self, parent, grandparent...] for category-scoped coupons. */
export const categoryAncestors = unstable_cache(
  async (): Promise<Record<string, string[]>> => {
    const all = await db.category.findMany({ select: { id: true, parentId: true } });
    const parent = new Map(all.map((c) => [c.id, c.parentId]));
    const out: Record<string, string[]> = {};
    for (const c of all) {
      const chain = [c.id];
      let p = parent.get(c.id);
      while (p) {
        chain.push(p);
        p = parent.get(p);
      }
      out[c.id] = chain;
    }
    return out;
  },
  ["category-ancestors"],
  { revalidate: 300, tags: ["categories"] },
);

async function guestToken(create: boolean): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(GUEST_CART_COOKIE)?.value;
  if (existing || !create) return existing ?? null;
  const token = randomToken(18);
  jar.set(GUEST_CART_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env().NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 60 });
  return token;
}

/** The personal cart of the current user or guest (optionally created). */
export async function resolveCart(user: CurrentUser | null, create: boolean) {
  if (user) {
    const found = await db.cart.findUnique({ where: { userId: user.id } });
    if (found || !create) return found;
    return db.cart.create({ data: { userId: user.id } });
  }
  const token = await guestToken(create);
  if (!token) return null;
  const found = await db.cart.findUnique({ where: { guestToken: token } });
  if (found || !create) return found;
  return db.cart.create({ data: { guestToken: token } });
}

/** Group carts are shared by code; anyone signed in can add, the owner checks out. */
export async function resolveGroupCart(code: string) {
  return db.cart.findUnique({ where: { shareCode: code.toUpperCase() } });
}

export async function assertCartAccess(cartId: string, user: CurrentUser | null) {
  const cart = await db.cart.findUnique({ where: { id: cartId } });
  if (!cart) throw new AppError("notFound");
  if (cart.kind === "GROUP") {
    if (!user) throw new AppError("unauthorized");
    return cart;
  }
  if (cart.userId) {
    if (cart.userId !== user?.id) throw new AppError("forbidden");
    return cart;
  }
  const token = (await cookies()).get(GUEST_CART_COOKIE)?.value;
  if (!token || cart.guestToken !== token) throw new AppError("forbidden");
  return cart;
}

export async function addItem(cartId: string, variantId: string, quantity: number, addedById: string | null) {
  const variant = await db.variant.findUnique({ where: { id: variantId }, include: { product: { select: { status: true, isPreorder: true, deletedAt: true } } } });
  if (!variant || variant.product.status !== "ACTIVE" || variant.product.deletedAt) throw new AppError("notFound");
  const max = variant.product.isPreorder ? MAX_QTY : Math.min(MAX_QTY, variant.stock);
  if (max <= 0) throw new AppError("outOfStock");
  const existing = await db.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  // A line bought at a quoted price keeps the quoted quantity.
  if (existing?.quoteId) throw new AppError("quoteLocked");
  const qty = Math.min(max, (existing?.quantity ?? 0) + quantity);
  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId } },
    create: { cartId, variantId, quantity: qty, addedById },
    update: { quantity: qty, selected: true },
  });
  await db.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  return qty;
}

export async function setItemQuantity(cartId: string, itemId: string, quantity: number) {
  const item = await db.cartItem.findFirst({ where: { id: itemId, cartId }, include: { variant: { include: { product: { select: { isPreorder: true } } } } } });
  if (!item) throw new AppError("notFound");
  if (quantity <= 0) return db.cartItem.delete({ where: { id: item.id } });
  if (item.quoteId) throw new AppError("quoteLocked");
  const max = item.variant.product.isPreorder ? MAX_QTY : Math.min(MAX_QTY, item.variant.stock);
  return db.cartItem.update({ where: { id: item.id }, data: { quantity: Math.max(1, Math.min(max, quantity)) } });
}

/** Move a guest cart into the user's cart on sign-in (quantities summed, clamped to stock). */
export async function mergeGuestCart(userId: string) {
  const jar = await cookies();
  const token = jar.get(GUEST_CART_COOKIE)?.value;
  if (!token) return;
  const guest = await db.cart.findUnique({ where: { guestToken: token }, include: { items: { include: { variant: { include: { product: { select: { isPreorder: true } } } } } } } });
  if (guest?.items.length) {
    const cart = (await db.cart.findUnique({ where: { userId } })) ?? (await db.cart.create({ data: { userId } }));
    for (const it of guest.items) {
      const existing = await db.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId: it.variantId } } });
      if (existing?.quoteId) continue;
      const max = it.variant.product.isPreorder ? MAX_QTY : Math.max(1, it.variant.stock);
      const qty = Math.min(max, (existing?.quantity ?? 0) + it.quantity);
      await db.cartItem.upsert({ where: { cartId_variantId: { cartId: cart.id, variantId: it.variantId } }, create: { cartId: cart.id, variantId: it.variantId, quantity: qty }, update: { quantity: qty } });
    }
    if (guest.couponCode && !cart.couponCode) await db.cart.update({ where: { id: cart.id }, data: { couponCode: guest.couponCode } });
  }
  if (guest) await db.cart.delete({ where: { id: guest.id } });
  jar.delete(GUEST_CART_COOKIE);
}

export async function createGroupCart(user: CurrentUser) {
  return db.cart.create({ data: { kind: "GROUP", ownerId: user.id, shareCode: randomCode(2, 4).replace("-", "") } });
}

async function activePromotions(productIds: string[]): Promise<Promotion[]> {
  if (!productIds.length) return [];
  const now = new Date();
  const rows = await db.promotion.findMany({
    where: { isActive: true, productIds: { hasSome: productIds }, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
  });
  return rows.map((r) => ({ id: r.id, type: r.type, discountPercent: r.discountPercent, minQty: r.minQty, productIds: r.productIds }));
}

/** Full cart view with prices recomputed from the database (never trusting the client). */
export async function loadCartView(cartId: string, user: CurrentUser | null, locale: string): Promise<CartView> {
  const early = await earlyCampaignIds();
  const cart = await db.cart.findUniqueOrThrow({
    where: { id: cartId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          addedBy: { select: { name: true, login: true } },
          quote: { select: { status: true, userId: true, validUntil: true, quotedPrice: true, createdAt: true, quantity: true } },
          variant: {
            include: {
              product: {
                include: {
                  shop: { select: { id: true, name: true, slug: true, status: true } },
                  media: { where: { type: "IMAGE" }, orderBy: { sort: "asc" }, take: 1 },
                  campaignItems: { where: { status: "APPROVED", campaign: liveCampaignWhere(early) }, select: { salePrice: true }, take: 1 },
                  category: { select: { nasiyaEligible: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const ancestors = await categoryAncestors();
  const plans = await getPlans();
  const live = await liveTimedPrices([...new Set(cart.items.map((it) => it.variant.product.id))]);
  const isBusiness = !!user && !!(await db.businessProfile.findUnique({ where: { userId: user.id }, select: { id: true } }));

  const views: Array<CartItemView & { shopId: string; shopName: string; shopSlug: string; fulfillment: "FBO" | "FBS" | "DBS"; line: CartLine; available: boolean }> = cart.items.map((it) => {
    const p = it.variant.product;
    // Campaign and live-stream prices compete; the buyer gets the lower one.
    const sale = [p.campaignItems[0]?.salePrice, live.get(p.id)].filter((x): x is number => x != null).sort((a, b) => a - b)[0];
    const quoted = quotePriceFor(it.quote, user?.id);
    const price = quoted ?? (sale ? Math.min(sale, it.variant.price) : it.variant.price);
    const oldPrice = quoted ? it.variant.price : sale ? Math.max(it.variant.oldPrice ?? it.variant.price, it.variant.price) : it.variant.oldPrice;
    const quantity = quoted && it.quote ? it.quote.quantity : it.quantity;
    const available = p.status === "ACTIVE" && !p.deletedAt && p.shop.status === "APPROVED" && (p.isPreorder || it.variant.stock > 0);
    const variantTitle = locale === "ru" ? it.variant.titleRu : locText(it.variant.titleUz, locale);
    const wholesaleTiers = (p.wholesaleTiers as Array<{ minQty: number; price: number }> | null) ?? null;
    return {
      id: it.id,
      variantId: it.variantId,
      productId: p.id,
      slug: p.slug,
      title: loc(p, "title", locale),
      variantTitle,
      image: it.variant.imageUrl ?? p.media[0]?.url ?? null,
      price,
      oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
      quantity,
      stock: p.isPreorder ? 99 : it.variant.stock,
      selected: it.selected,
      lineTotal: 0,
      promoDiscount: 0,
      isPreorder: p.isPreorder,
      addedBy: it.addedBy ? (it.addedBy.name ?? it.addedBy.login) : null,
      wholesale: false,
      quoted: quoted != null,
      shopId: p.shop.id,
      shopName: locText(p.shop.name, locale),
      shopSlug: p.shop.slug,
      fulfillment: p.fulfillment,
      available,
      line: { variantId: it.variantId, productId: p.id, shopId: p.shop.id, categoryIds: ancestors[p.categoryId] ?? [p.categoryId], unitPrice: price, oldPrice, quantity: Math.min(quantity, p.isPreorder ? 99_999 : it.variant.stock), wholesaleTiers, negotiated: quoted != null },
    };
  });

  // Totals cover selected, purchasable lines only.
  const active = views.filter((v) => v.available && v.selected);
  let coupon: Coupon | null = null;
  let couponCtx = { now: new Date(), isFirstOrder: true, userUses: 0 };
  if (cart.couponCode) {
    const c = await db.coupon.findUnique({ where: { code: cart.couponCode } });
    if (c) {
      coupon = c;
      if (user) {
        const [orders, uses] = await Promise.all([db.orderGroup.count({ where: { userId: user.id, paymentStatus: { in: ["PAID", "AUTHORIZED"] } } }), db.couponRedemption.count({ where: { couponId: c.id, userId: user.id } })]);
        couponCtx = { now: new Date(), isFirstOrder: orders === 0, userUses: uses };
      }
    }
  }
  const totals = computeCart({
    lines: active.map((v) => v.line),
    promotions: await activePromotions(active.map((v) => v.productId)),
    coupon,
    couponCtx,
    isPlus: user?.isPlus,
    isBusiness,
    tier: user?.loyaltyTier,
  });
  const byVariant = new Map(totals.lines.map((l) => [l.variantId, l]));
  for (const v of views) {
    const l = byVariant.get(v.variantId);
    v.lineTotal = l ? l.lineTotal : v.price * v.quantity;
    v.promoDiscount = l?.promoDiscount ?? 0;
    v.wholesale = !v.quoted && !!l && l.effectivePrice < v.price;
  }

  const groups = new Map<string, CartView["groups"][number]>();
  for (const v of views.filter((x) => x.available)) {
    if (!groups.has(v.shopId)) groups.set(v.shopId, { shopId: v.shopId, shopName: v.shopName, shopSlug: v.shopSlug, fulfillment: v.fulfillment, items: [] });
    groups.get(v.shopId)!.items.push(strip(v));
  }
  const monthly = bestMonthly(totals.total, plans);
  return {
    id: cart.id,
    kind: cart.kind,
    shareCode: cart.shareCode,
    couponCode: cart.couponCode,
    groups: [...groups.values()],
    unavailable: views.filter((v) => !v.available).map(strip),
    totals: {
      itemsCount: totals.itemsCount,
      listTotal: totals.listTotal,
      subtotal: totals.subtotal,
      productDiscount: totals.productDiscount,
      promoDiscount: totals.promoDiscount,
      couponDiscount: totals.couponDiscount,
      couponError: totals.couponError ?? null,
      freeDelivery: totals.freeDelivery,
      total: totals.total,
      cashback: totals.cashback,
      monthly: monthly ? { amount: monthly.monthly, months: monthly.months } : null,
    },
  };
}

function strip(v: CartItemView & Record<string, unknown>): CartItemView {
  const { id, variantId, productId, slug, title, variantTitle, image, price, oldPrice, quantity, stock, selected, lineTotal, promoDiscount, isPreorder, addedBy, wholesale, quoted } = v;
  return { id, variantId, productId, slug, title, variantTitle, image, price, oldPrice, quantity, stock, selected, lineTotal, promoDiscount, isPreorder, addedBy, wholesale, quoted };
}
