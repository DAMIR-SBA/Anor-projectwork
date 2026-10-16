// Cart pricing engine — pure, deterministic, unit-tested. All amounts in so'm.
import { deliveryFee, type Method } from "./delivery";

export type CartLine = {
  variantId: string;
  productId: string;
  shopId: string;
  categoryIds: string[]; // category + ancestors (for category coupons)
  unitPrice: number;
  oldPrice?: number | null;
  quantity: number;
  /** Optional B2B tiers: [{ minQty, price }]. */
  wholesaleTiers?: Array<{ minQty: number; price: number }> | null;
  /** Price agreed in an accepted B2B quote: final, so no tiers, promotions or coupons on top. */
  negotiated?: boolean;
};

export type Promotion = {
  id: string;
  type: "BUNDLE" | "BUY_TOGETHER" | "MULTI_BUY";
  discountPercent: number;
  minQty: number;
  productIds: string[];
};

export type Coupon = {
  code: string;
  type: "PERCENT" | "FIXED" | "FREE_DELIVERY";
  value: number;
  maxDiscount?: number | null;
  minCartTotal: number;
  categoryId?: string | null;
  shopId?: string | null;
  firstOrderOnly: boolean;
  usageLimit?: number | null;
  usedCount: number;
  perUserLimit: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive: boolean;
};

export type CouponContext = { now: Date; isFirstOrder: boolean; userUses: number };

export type CouponError = "inactive" | "expired" | "notStarted" | "limitReached" | "userLimit" | "firstOrderOnly" | "minTotal" | "notApplicable";

export type LineResult = CartLine & { effectivePrice: number; lineTotal: number; promoDiscount: number; couponDiscount: number };

export type CartTotals = {
  lines: LineResult[];
  itemsCount: number;
  /** Sum of old prices (or prices) × qty — the "before discounts" figure shown to buyers. */
  listTotal: number;
  /** Sum at current prices before promotions/coupon. */
  subtotal: number;
  productDiscount: number;
  promoDiscount: number;
  couponDiscount: number;
  couponError?: CouponError;
  freeDelivery: boolean;
  deliveryFee: number;
  bonusApplied: number;
  total: number;
  cashback: number;
};

/** Unit price after wholesale tiers (the best tier whose minQty is reached). */
export function effectiveUnitPrice(line: CartLine, isBusiness: boolean): number {
  if (line.negotiated || !isBusiness || !line.wholesaleTiers?.length) return line.unitPrice;
  const tier = [...line.wholesaleTiers].filter((t) => line.quantity >= t.minQty).sort((a, b) => a.price - b.price)[0];
  return tier ? Math.min(tier.price, line.unitPrice) : line.unitPrice;
}

/**
 * Promotions: MULTI_BUY → % off every unit when ≥ minQty units of listed products are in the cart;
 * BUNDLE / BUY_TOGETHER → % off listed products when all of them are present.
 * Returns discount per variant line (best single promotion per line, no stacking).
 */
export function promotionDiscounts(lines: Array<CartLine & { effectivePrice: number }>, promotions: Promotion[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const promo of promotions) {
    const eligible = lines.filter((l) => !l.negotiated && promo.productIds.includes(l.productId));
    if (!eligible.length) continue;
    let applies = false;
    if (promo.type === "MULTI_BUY") applies = eligible.reduce((s, l) => s + l.quantity, 0) >= promo.minQty;
    else applies = promo.productIds.every((pid) => lines.some((l) => l.productId === pid));
    if (!applies) continue;
    for (const l of eligible) {
      const d = Math.round((l.effectivePrice * l.quantity * promo.discountPercent) / 100);
      if (d > (best.get(l.variantId) ?? 0)) best.set(l.variantId, d);
    }
  }
  return best;
}

export function validateCoupon(coupon: Coupon, ctx: CouponContext): CouponError | null {
  if (!coupon.isActive) return "inactive";
  if (coupon.startsAt && coupon.startsAt > ctx.now) return "notStarted";
  if (coupon.endsAt && coupon.endsAt < ctx.now) return "expired";
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return "limitReached";
  if (ctx.userUses >= coupon.perUserLimit) return "userLimit";
  if (coupon.firstOrderOnly && !ctx.isFirstOrder) return "firstOrderOnly";
  return null;
}

/** Spread a total discount across lines proportionally (largest remainder keeps the sum exact). */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floors[i]++;
    rest--;
  }
  return floors;
}

export const BONUS_MAX_SHARE = 0.3; // bonus points can pay up to 30% of the order
export const BASE_CASHBACK = 0.01;
export const TIER_CASHBACK = { STANDARD: 0, SILVER: 0.01, GOLD: 0.02 } as const;
export const PLUS_CASHBACK = 0.02;

export type CashbackRates = { base: number; silver: number; gold: number; plus: number };
export const DEFAULT_CASHBACK: CashbackRates = { base: BASE_CASHBACK, silver: TIER_CASHBACK.SILVER, gold: TIER_CASHBACK.GOLD, plus: PLUS_CASHBACK };

/** Cashback = base + loyalty tier bonus + Plus bonus (rates configurable in admin › loyalty). */
export function cashbackRate(tier: keyof typeof TIER_CASHBACK, isPlus: boolean, r: CashbackRates = DEFAULT_CASHBACK): number {
  return r.base + (tier === "GOLD" ? r.gold : tier === "SILVER" ? r.silver : 0) + (isPlus ? r.plus : 0);
}

export function computeCart(input: {
  lines: CartLine[];
  promotions?: Promotion[];
  coupon?: Coupon | null;
  couponCtx?: CouponContext;
  delivery?: { method: Method; region: string } | null;
  isPlus?: boolean;
  isBusiness?: boolean;
  tier?: keyof typeof TIER_CASHBACK;
  bonusRequested?: number;
  bonusBalance?: number;
}): CartTotals {
  const lines = input.lines.filter((l) => l.quantity > 0).map((l) => ({ ...l, effectivePrice: effectiveUnitPrice(l, !!input.isBusiness) }));
  const promo = promotionDiscounts(lines, input.promotions ?? []);
  const listTotal = lines.reduce((s, l) => s + Math.max(l.oldPrice ?? 0, l.unitPrice) * l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.effectivePrice * l.quantity, 0);
  const promoDiscount = [...promo.values()].reduce((a, b) => a + b, 0);

  let couponDiscount = 0;
  let couponError: CouponError | undefined;
  let freeDelivery = false;
  let couponPerLine = lines.map(() => 0);
  if (input.coupon) {
    const err = validateCoupon(input.coupon, input.couponCtx ?? { now: new Date(), isFirstOrder: false, userUses: 0 });
    const c = input.coupon;
    const scoped = lines.map((l) => !l.negotiated && (!c.categoryId || l.categoryIds.includes(c.categoryId)) && (!c.shopId || l.shopId === c.shopId));
    const base = lines.reduce((s, l, i) => s + (scoped[i] ? l.effectivePrice * l.quantity - (promo.get(l.variantId) ?? 0) : 0), 0);
    if (err) couponError = err;
    else if (base <= 0) couponError = "notApplicable";
    else if (base < c.minCartTotal) couponError = "minTotal";
    else if (c.type === "FREE_DELIVERY") freeDelivery = true;
    else {
      couponDiscount = c.type === "PERCENT" ? Math.round((base * c.value) / 100) : Math.min(c.value, base);
      if (c.maxDiscount) couponDiscount = Math.min(couponDiscount, c.maxDiscount);
      couponPerLine = allocate(
        couponDiscount,
        lines.map((l, i) => (scoped[i] ? l.effectivePrice * l.quantity - (promo.get(l.variantId) ?? 0) : 0)),
      );
    }
  }

  const afterDiscounts = subtotal - promoDiscount - couponDiscount;
  const fee = input.delivery ? deliveryFee({ method: input.delivery.method, region: input.delivery.region, subtotal: afterDiscounts, isPlus: input.isPlus, freeDeliveryCoupon: freeDelivery }) : 0;
  const bonusCap = Math.floor(afterDiscounts * BONUS_MAX_SHARE);
  const bonusApplied = Math.max(0, Math.min(input.bonusRequested ?? 0, input.bonusBalance ?? 0, bonusCap));
  const total = Math.max(0, afterDiscounts - bonusApplied + fee);
  const cashback = Math.floor((afterDiscounts - bonusApplied) * cashbackRate(input.tier ?? "STANDARD", !!input.isPlus));

  return {
    lines: lines.map((l, i) => {
      const pd = promo.get(l.variantId) ?? 0;
      return { ...l, promoDiscount: pd, couponDiscount: couponPerLine[i], lineTotal: l.effectivePrice * l.quantity - pd - couponPerLine[i] };
    }),
    itemsCount: lines.reduce((s, l) => s + l.quantity, 0),
    listTotal,
    subtotal,
    productDiscount: Math.max(0, listTotal - subtotal),
    promoDiscount,
    couponDiscount,
    couponError,
    freeDelivery,
    deliveryFee: fee,
    bonusApplied,
    total,
    cashback,
  };
}

/** Marketplace commission for a line (category rate, lower for PRO sellers). */
export function commissionFor(amount: number, rate: number): number {
  return Math.round(amount * rate);
}

export const PRO_COMMISSION_DISCOUNT = 0.02;

export function effectiveCommissionRate(categoryRate: number, tier: "BASIC" | "PRO", override?: number | null): number {
  if (override != null) return override;
  return Math.max(0.01, tier === "PRO" ? categoryRate - PRO_COMMISSION_DISCOUNT : categoryRate);
}

/** Logistics fee charged to the seller per order line, by fulfillment model and weight. */
export function logisticsFee(fulfillment: "FBO" | "FBS" | "DBS", weightGrams: number, quantity: number): number {
  if (fulfillment === "DBS") return 0;
  const perUnit = fulfillment === "FBO" ? 9_000 : 6_000;
  const heavy = Math.max(0, Math.ceil((weightGrams - 1000) / 1000)) * 2_000;
  return (perUnit + heavy) * quantity;
}
