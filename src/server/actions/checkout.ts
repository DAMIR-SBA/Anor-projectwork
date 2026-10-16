"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { action, formAction, AppError, zBool, zInt, zPhone } from "@/server/action";

import { placeOrder, quoteCheckout } from "@/server/services/checkout";
import { transitionOrder, arriveAtPickupPoint } from "@/server/services/orders";
import { completePayment, startPayment } from "@/server/payments/service";
import { createReturn } from "@/server/services/returns";
import { isOwnStorageUrl } from "@/server/storage";
import { cookies } from "next/headers";
import { unsign } from "@/server/security/crypto";
import { AD_COOKIE, attributeOrders } from "@/server/services/ads";
import { REGIONS } from "@/lib/delivery";

const zCheckout = z.object({
  cartId: z.string().nullish(),
  deliveryMethod: z.enum(["PICKUP", "COURIER", "EXPRESS"]),
  addressId: z.string().nullish(),
  pickupPointId: z.string().nullish(),
  slotStart: z.string().nullish(),
  isGift: z.boolean().default(false),
  giftMessage: z.string().max(300).nullish(),
  hidePrice: z.boolean().default(false),
  recipientName: z.string().max(80).nullish(),
  recipientPhone: z.string().max(20).nullish(),
  paymentMethod: z.enum(["CLICK", "PAYME", "UZCARD", "HUMO", "CARD", "COD", "WALLET", "INSTALLMENT"]),
  savedCardId: z.string().nullish(),
  installmentMonths: z.number().int().nullish(),
  bonus: zInt(0).default(0),
  useWallet: z.boolean().default(false),
});

export const quoteCheckoutAction = action({ schema: zCheckout.pick({ cartId: true, deliveryMethod: true, addressId: true, pickupPointId: true, bonus: true }) }, async (input, ctx) => {
  const q = await quoteCheckout(ctx.user, input, await getLocale());
  return { ok: true, data: { totals: q.totals, expressAllowed: q.expressAllowed, groups: q.groups.map((g) => ({ shopId: g.shopId, shopName: g.shopName, eta: g.eta, fulfillment: g.fulfillment, count: g.lines.length })), plans: q.plans } };
});

export const placeOrderAction = action({ schema: zCheckout, rateLimit: { key: "checkout", limit: 10, window: 300 } }, async (input, ctx) => {
  const r = await placeOrder(ctx.user, input, await getLocale());
  // Last-click ad attribution (signed cookie set by /api/ads/click).
  const adCookie = unsign((await cookies()).get(AD_COOKIE)?.value);
  if (adCookie) await attributeOrders(r.groupId, JSON.parse(adCookie)).catch(() => {});
  revalidatePath("/[locale]", "layout");
  return { ok: true, data: r };
});

export const retryPaymentAction = action({ schema: z.object({ groupId: z.string(), method: z.enum(["CLICK", "PAYME", "UZCARD", "HUMO", "CARD"]) }) }, async (input, ctx) => {
  const group = await db.orderGroup.findFirst({ where: { id: input.groupId, userId: ctx.user.id, paymentStatus: { in: ["PENDING", "FAILED"] } }, include: { orders: true } });
  if (!group || !group.orders.some((o) => o.status === "PENDING_PAYMENT")) throw new AppError("conflict");
  const amount = group.total - group.walletUsed;
  const pay = await startPayment({ userId: ctx.user.id, method: input.method, amount, purpose: "ORDER", groupId: group.id });
  return { ok: true, data: pay };
});

/** Hosted mock gateway submit (stands in for the provider's own page + callback). */
export const mockGatewayAction = action(
  { schema: z.object({ paymentId: z.string(), outcome: z.enum(["success", "fail"]), cardNumber: z.string().optional(), expiry: z.string().optional(), code: z.string().optional(), saveCard: z.boolean().optional() }) },
  async (input, ctx) => {
    const payment = await db.payment.findFirst({ where: { id: input.paymentId, userId: ctx.user.id } });
    if (!payment) throw new AppError("notFound");
    if (payment.status !== "PENDING") throw new AppError("conflict");
    if (input.outcome === "success" && input.code?.trim() !== "000000") throw new AppError("invalidCode", undefined, "code");
    const digits = (input.cardNumber ?? "").replace(/\D/g, "");
    if (input.outcome === "success" && !payment.savedCardId && digits.length < 16) throw new AppError("invalidFormat", undefined, "cardNumber");
    await completePayment(payment.id, input.outcome === "success", { saveCard: input.saveCard && digits.length >= 16 ? { pan: digits, exp: input.expiry ?? "12/30" } : null });
    revalidatePath("/[locale]", "layout");
    return { ok: true, data: { purpose: payment.purpose, groupId: payment.groupId } };
  },
);

export const cancelOrderAction = action({ schema: z.object({ orderId: z.string(), reason: z.string().max(200).optional() }) }, async (input, ctx) => {
  await transitionOrder(input.orderId, "CANCELLED", { actor: "buyer", userId: ctx.user.id, login: ctx.user.login }, `buyer: ${input.reason ?? ""}`.trim());
  revalidatePath("/[locale]/account/orders", "layout");
});

/** Demo mode only: walk an order through the lifecycle as if seller/courier acted. */
export const demoAdvanceOrderAction = action({ schema: z.object({ orderId: z.string() }) }, async (input, ctx) => {
  if (!env().DEMO_MODE) throw new AppError("forbidden");
  const order = await db.order.findFirst({ where: { id: input.orderId, userId: ctx.user.id }, include: { shipments: true } });
  if (!order) throw new AppError("notFound");
  const sys = { actor: "system" as const };
  if (order.status === "PLACED") await transitionOrder(order.id, "CONFIRMED", sys);
  else if (order.status === "CONFIRMED") await transitionOrder(order.id, "PACKED", sys);
  else if (order.status === "PACKED") await transitionOrder(order.id, "SHIPPED", sys);
  else if (order.status === "SHIPPED" && order.deliveryMethod === "PICKUP" && !order.pickupExpiresAt) await arriveAtPickupPoint(order.id);
  else if (order.status === "SHIPPED") await transitionOrder(order.id, "DELIVERED", sys, "demo");
  else throw new AppError("invalidTransition");
  revalidatePath("/[locale]/account/orders", "layout");
});

export const requestReturnAction = action(
  { rateLimit: { key: "return", limit: 10, window: 3600 }, schema: z.object({ orderItemId: z.string(), quantity: zInt(1, 99), reason: z.enum(["defect", "wrong", "size", "notAsDescribed", "changedMind"]), description: z.string().max(1000).optional(), photos: z.array(z.string().max(500)).max(6).default([]), refundMethod: z.enum(["CARD", "WALLET"]) }) },
  async (input, ctx) => {
    const photos = input.photos.filter(isOwnStorageUrl);
    await createReturn(ctx.user.id, { ...input, photos });
    revalidatePath("/[locale]/account/returns", "page");
  },
);

// ── Addresses ────────────────────────────────────────────────────────────

const zAddress = z.object({
  id: z.string().optional(),
  label: z.string().max(40).optional(),
  recipient: z.string().trim().min(2).max(80),
  phone: zPhone,
  region: z.enum(REGIONS.map((r) => r.key) as [string, ...string[]]),
  city: z.string().trim().min(2).max(80),
  district: z.string().max(80).optional(),
  street: z.string().trim().min(2).max(120),
  house: z.string().max(20).optional(),
  apartment: z.string().max(20).optional(),
  entrance: z.string().max(10).optional(),
  floor: z.string().max(10).optional(),
  comment: z.string().max(300).optional(),
  lat: z.coerce.number().min(37).max(46).optional(),
  lng: z.coerce.number().min(55).max(74).optional(),
  isDefault: zBool.optional(),
});

export const saveAddressAction = formAction({ schema: zAddress }, async (input, ctx) => {
  const { id, isDefault, ...data } = input;
  if (isDefault) await db.address.updateMany({ where: { userId: ctx.user.id }, data: { isDefault: false } });
  const count = await db.address.count({ where: { userId: ctx.user.id } });
  const saved = id
    ? await db.address.update({ where: { id, userId: ctx.user.id }, data: { ...data, isDefault: !!isDefault } })
    : await db.address.create({ data: { ...data, userId: ctx.user.id, isDefault: !!isDefault || count === 0 } });
  revalidatePath("/[locale]/account/addresses", "page");
  return { ok: true, data: { id: saved.id } };
});

export const deleteAddressAction = action({ schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  await db.address.deleteMany({ where: { id: input.id, userId: ctx.user.id } });
  revalidatePath("/[locale]/account/addresses", "page");
});

