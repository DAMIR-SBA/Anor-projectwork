import "server-only";
import { db, type Tx } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { sendSellerTelegram, escapeHtml } from "@/server/notify/telegram";
import { randomDigits, randomCode } from "@/server/security/crypto";
import { canTransition, type Actor, type OrderStatus } from "@/lib/order-status";
import { allocate } from "@/lib/pricing";
import { addDays, addHours } from "@/lib/dates";
import { bonusEarn, walletCredit } from "./wallet";
import { issueFiscalReceipt } from "./tax";
import { refundPayment } from "@/server/payments/service";
import { trackMission } from "./missions";
import { log } from "@/server/log";

export const FBS_HANDOVER_HOURS = 24;
export const PICKUP_STORAGE_DAYS = 5;

const STATUS_TEXT: Record<OrderStatus, { uz: string; ru: string }> = {
  PENDING_PAYMENT: { uz: "To‘lov kutilmoqda", ru: "Ожидает оплаты" },
  PLACED: { uz: "Buyurtma qabul qilindi", ru: "Заказ оформлен" },
  CONFIRMED: { uz: "Sotuvchi tasdiqladi", ru: "Продавец подтвердил заказ" },
  PACKED: { uz: "Buyurtma qadoqlandi", ru: "Заказ упакован" },
  SHIPPED: { uz: "Buyurtma yo‘lda", ru: "Заказ в пути" },
  DELIVERED: { uz: "Buyurtma yetkazildi", ru: "Заказ доставлен" },
  CANCELLED: { uz: "Buyurtma bekor qilindi", ru: "Заказ отменён" },
  RETURNED: { uz: "Buyurtma qaytarildi", ru: "Заказ возвращён" },
};

export function statusText(status: OrderStatus, locale: string) {
  return locale === "ru" ? STATUS_TEXT[status].ru : STATUS_TEXT[status].uz;
}

export function newGroupNumber() {
  const d = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(2, 10).replace(/-/g, "");
  return `${d}-${randomDigits(5)}`;
}

/** Release reserved stock back to the warehouse it came from (cancellation / unpaid timeout). */
async function releaseStock(tx: Tx, orderId: string) {
  const moves = await tx.stockMovement.findMany({ where: { refType: "order", refId: orderId, reason: "SALE" } });
  for (const m of moves) {
    const qty = -m.delta;
    await tx.warehouseStock.update({ where: { variantId_warehouseId: { variantId: m.variantId, warehouseId: m.warehouseId } }, data: { quantity: { increment: qty } } });
    await tx.variant.update({ where: { id: m.variantId }, data: { stock: { increment: qty } } });
    await tx.stockMovement.create({ data: { variantId: m.variantId, warehouseId: m.warehouseId, delta: qty, reason: "RELEASE", refType: "order", refId: orderId } });
  }
}

/**
 * Refund a cancelled order back to where the money came from, proportionally:
 * bonus → bonus points, wallet → Anor Hamyon, the rest → the external payment (card) or nothing for unpaid COD.
 */
async function refundOrderMoney(orderId: string, reason: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { group: { include: { orders: true, payments: { where: { status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } } } } } });
  const g = order.group;
  const totals = g.orders.map((o) => o.total);
  const idx = g.orders.findIndex((o) => o.id === order.id);
  const bonusShare = allocate(g.bonusUsed, totals)[idx] ?? 0;
  const walletShare = allocate(g.walletUsed, totals)[idx] ?? 0;
  const externalShare = Math.max(0, order.total - bonusShare - walletShare);
  await db.$transaction(async (tx) => {
    if (bonusShare > 0) await bonusEarn(tx, order.userId, bonusShare, "ADJUSTMENT", { refId: order.id, note: "refund" });
    if (walletShare > 0) await walletCredit(tx, order.userId, walletShare, "REFUND", { refType: "order", refId: order.id, description: reason });
  });
  const payment = g.payments.find((p) => p.purpose === "ORDER");
  if (payment && externalShare > 0 && payment.method !== "COD") {
    await refundPayment({ paymentId: payment.id, amount: externalShare, method: payment.method === "INSTALLMENT" ? "WALLET" : "CARD", reason });
  }
  return { bonusShare, walletShare, externalShare };
}

async function notifyStatus(orderId: string, status: OrderStatus) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { user: { select: { locale: true } } } });
  const locale = order.user.locale;
  const extra =
    status === "SHIPPED" && order.deliveryMethod === "PICKUP"
      ? ""
      : status === "DELIVERED"
        ? locale === "ru"
          ? " Оцените товары — получите бонусы за отзыв с фото."
          : " Mahsulotlarni baholang — rasmli sharh uchun bonus olasiz."
        : "";
  await notify({
    userId: order.userId,
    type: `order.${status.toLowerCase()}`,
    title: `${statusText(status, locale)} · №${order.number}`,
    body: `${statusText(status, locale)}.${extra}`,
    href: `/account/orders/${order.id}`,
    data: { orderId: order.id, status },
    channels: ["telegram", "push", ...(status === "DELIVERED" || status === "CANCELLED" ? (["email"] as const) : [])],
  });
}

/** Seller gets the new order in-app and, if linked, in the seller Telegram bot with Confirm/Reject buttons. */
async function notifySellerNewOrder(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { shop: true, items: { include: { variant: { select: { sku: true } } } } } });
  await notify({ userId: order.shop.ownerId, type: "seller.new_order", title: `Yangi buyurtma №${order.number}`, body: `${order.items.length} ta pozitsiya · ${order.total.toLocaleString("ru-RU")} so‘m`, href: `/seller/orders/${order.id}` });
  if (order.shop.telegramChatId) {
    const lines = order.items.map((i) => `• ${escapeHtml(i.title)} × ${i.quantity}`).join("\n");
    await sendSellerTelegram(order.shop.telegramChatId, `🛒 <b>Yangi buyurtma №${order.number}</b>\n${lines}\nJami: ${order.total.toLocaleString("ru-RU")} so‘m`, [
      [
        { text: "✅ Tasdiqlash", callback_data: `confirm:${order.id}` },
        { text: "❌ Rad etish", callback_data: `reject:${order.id}` },
      ],
    ]);
  }
  // Seller API webhooks (registered in the seller cabinet).
  const { emitWebhook } = await import("./webhooks");
  await emitWebhook(order.shopId, "order.created", { id: order.id, number: order.number, total: order.total, fulfillment: order.fulfillment, items: order.items.map((i) => ({ sku: i.variant.sku, title: i.title, quantity: i.quantity, unitPrice: i.unitPrice })) });
}

/** Payment completed (or not needed): orders move to PLACED, receipts for prepaid orders, notifications. */
export async function markGroupPlaced(groupId: string, paid: boolean) {
  const group = await db.orderGroup.findUniqueOrThrow({ where: { id: groupId }, include: { orders: true } });
  for (const o of group.orders) {
    if (o.status !== "PENDING_PAYMENT") continue;
    await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: o.id }, data: { status: "PLACED" } });
      await tx.orderStatusEvent.create({ data: { orderId: o.id, status: "PLACED" } });
    });
    if (paid) await issueFiscalReceipt(o.id).catch((err) => log.error("receipt failed", { err }));
    await notifyStatus(o.id, "PLACED");
    await notifySellerNewOrder(o.id).catch((err) => log.error("seller notify failed", { err }));
  }
  await db.orderGroup.update({ where: { id: groupId }, data: { paymentStatus: paid ? "PAID" : group.paymentStatus } });
}

export async function cancelUnpaidGroup(groupId: string, reason = "payment_timeout") {
  const group = await db.orderGroup.findUniqueOrThrow({ where: { id: groupId }, include: { orders: true } });
  for (const o of group.orders) if (o.status === "PENDING_PAYMENT") await transitionOrder(o.id, "CANCELLED", { actor: "system" }, reason);
  await db.orderGroup.update({ where: { id: groupId }, data: { paymentStatus: "CANCELLED" } });
}

type ActorRef = { actor: Actor; userId?: string; login?: string };

export async function transitionOrder(orderId: string, to: OrderStatus, by: ActorRef, note?: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { shop: true, items: true, group: true } });
  if (!canTransition(order.status, to, by.actor)) throw new AppError("invalidTransition");
  if (by.actor === "buyer" && order.userId !== by.userId) throw new AppError("forbidden");
  if (by.actor === "seller" && order.shop.ownerId !== by.userId) throw new AppError("forbidden");
  const now = new Date();

  await db.$transaction(async (tx) => {
    // Optimistic concurrency: only move if nobody else moved it meanwhile.
    const moved = await tx.order.updateMany({ where: { id: orderId, status: order.status }, data: { status: to } });
    if (moved.count !== 1) throw new AppError("conflict");
    await tx.orderStatusEvent.create({ data: { orderId, status: to, note: note ?? null, actorId: by.userId ?? null } });

    if (to === "CONFIRMED") {
      await tx.order.update({ where: { id: orderId }, data: { confirmedAt: now, ...(order.fulfillment === "FBS" ? { slaDeadline: addHours(now, FBS_HANDOVER_HOURS) } : {}) } });
      const platformWh = order.fulfillment === "FBO" ? await tx.warehouse.findFirst({ where: { type: "PLATFORM", region: order.region } }) ?? await tx.warehouse.findFirst({ where: { type: "PLATFORM" } }) : null;
      const sellerWh = await tx.warehouse.findFirst({ where: { shopId: order.shopId } });
      await tx.shipment.create({
        data: {
          orderId,
          type: order.deliveryMethod,
          status: order.fulfillment === "FBS" ? "AWAITING_HANDOVER" : "PENDING",
          warehouseId: platformWh?.id ?? sellerWh?.id,
          trackingNumber: `ANR${randomCode(3, 4).replace(/-/g, "")}`,
          handoverDeadline: order.fulfillment === "FBS" ? addHours(now, FBS_HANDOVER_HOURS) : null,
        },
      });
    }
    if (to === "SHIPPED") {
      await tx.shipment.updateMany({ where: { orderId }, data: { status: "IN_TRANSIT", handedOverAt: now, pickedUpAt: now } });
    }
    if (to === "DELIVERED") {
      await tx.order.update({ where: { id: orderId }, data: { deliveredAt: now } });
      await tx.shipment.updateMany({ where: { orderId }, data: { status: "DELIVERED", deliveredAt: now } });
      for (const it of order.items) await tx.product.update({ where: { id: it.productId }, data: { soldCount: { increment: it.quantity } } });
      if (order.cashbackAmount > 0 && !order.cashbackPaidAt) {
        await bonusEarn(tx, order.userId, order.cashbackAmount, "CASHBACK", { refId: orderId, note: `№${order.number}` });
        await tx.order.update({ where: { id: orderId }, data: { cashbackPaidAt: now } });
      }
    }
    if (to === "CANCELLED") {
      await tx.order.update({ where: { id: orderId }, data: { cancelledAt: now, cancelReason: note ?? null } });
      await tx.shipment.updateMany({ where: { orderId }, data: { status: "FAILED", failedReason: note ?? "cancelled" } });
      await releaseStock(tx, orderId);
      // Undo coupon usage for a fully cancelled group.
    }
  });

  if (to === "DELIVERED") await afterDelivered(orderId);
  if (to === "CANCELLED" && order.status !== "PENDING_PAYMENT") await refundOrderMoney(orderId, note ?? "cancelled");
  if (to === "CANCELLED" && order.status === "PENDING_PAYMENT") {
    // Unpaid: only bonus/wallet portions were taken.
    const g = order.group;
    const others = await db.order.findMany({ where: { groupId: g.id } });
    const idx = others.findIndex((o) => o.id === orderId);
    const bonusShare = allocate(g.bonusUsed, others.map((o) => o.total))[idx] ?? 0;
    const walletShare = allocate(g.walletUsed, others.map((o) => o.total))[idx] ?? 0;
    await db.$transaction(async (tx) => {
      if (bonusShare > 0) await bonusEarn(tx, order.userId, bonusShare, "ADJUSTMENT", { refId: orderId, note: "refund" });
      if (walletShare > 0) await walletCredit(tx, order.userId, walletShare, "REFUND", { refType: "order", refId: orderId });
    });
    // One invoice covers the whole checkout: cancelling part of it voids the invoice and the rest.
    if (g.paymentMethod === "BANK_TRANSFER") {
      const voided = await db.invoice.updateMany({ where: { groupId: g.id, status: "ISSUED" }, data: { status: "CANCELLED" } });
      if (voided.count) {
        await db.payment.updateMany({ where: { groupId: g.id, method: "BANK_TRANSFER", status: "PENDING" }, data: { status: "FAILED" } });
        for (const o of others) if (o.id !== orderId && o.status === "PENDING_PAYMENT") await transitionOrder(o.id, "CANCELLED", { actor: "system" }, "invoice_void");
        await db.orderGroup.update({ where: { id: g.id }, data: { paymentStatus: "CANCELLED" } });
      }
    }
  }
  if (by.actor !== "buyer") await audit({ actorId: by.userId ?? null, actorLogin: by.login ?? null, actorKind: by.actor === "staff" ? "staff" : by.actor === "seller" ? "seller" : "system", action: `order.${to.toLowerCase()}`, entityType: "Order", entityId: orderId, before: { status: order.status }, after: { status: to }, meta: note ? { note } : undefined });
  await notifyStatus(orderId, to);
  if ((to === "CANCELLED" && order.status !== "PENDING_PAYMENT") || to === "DELIVERED") {
    const { emitWebhook } = await import("./webhooks");
    await emitWebhook(order.shopId, to === "CANCELLED" ? "order.cancelled" : "order.delivered", { id: order.id, number: order.number, status: to, ...(to === "CANCELLED" ? { reason: note ?? null } : {}) }).catch(() => {});
  }
  if (to === "CANCELLED") {
    const { recomputeShopMetrics } = await import("./shop-metrics");
    await recomputeShopMetrics(order.shopId).catch(() => {});
  }
}

/** Parcel reached the pickup point: storage period starts, buyer gets the pickup code. */
export async function arriveAtPickupPoint(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { pickupPoint: true, user: { select: { locale: true } } } });
  if (order.deliveryMethod !== "PICKUP" || order.status !== "SHIPPED") throw new AppError("invalidTransition");
  const expires = addDays(new Date(), order.pickupPoint?.storageDays ?? PICKUP_STORAGE_DAYS);
  await db.$transaction([
    db.order.update({ where: { id: orderId }, data: { pickupExpiresAt: expires } }),
    db.shipment.updateMany({ where: { orderId }, data: { status: "AT_PICKUP_POINT", arrivedAt: new Date() } }),
  ]);
  const ru = order.user.locale === "ru";
  await notify({
    userId: order.userId,
    type: "order.at_pickup",
    title: ru ? `Заказ №${order.number} ждёт вас` : `№${order.number} buyurtmangiz kutmoqda`,
    body: ru ? `${order.pickupPoint?.name}. Код получения: ${order.pickupCode}. Хранится ${PICKUP_STORAGE_DAYS} дней.` : `${order.pickupPoint?.name}. Olish kodi: ${order.pickupCode}. ${PICKUP_STORAGE_DAYS} kun saqlanadi.`,
    href: `/account/orders/${orderId}`,
    channels: ["sms", "telegram", "push"],
  });
}

/** Pickup point / courier hands the parcel over after checking the 4-digit code (or QR). */
export async function handOverWithCode(orderId: string, code: string, by: ActorRef) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!order.pickupCode || order.pickupCode !== code.trim()) throw new AppError("invalidCode", undefined, "code");
  await transitionOrder(orderId, "DELIVERED", { ...by, actor: by.actor === "courier" ? "courier" : "staff" });
}

async function afterDelivered(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { group: { include: { orders: true, payments: true } } } });
  // Cash on delivery: the receipt is issued and the payment settled when the buyer pays the courier/PVZ.
  if (order.paymentMethod === "COD") {
    await issueFiscalReceipt(orderId);
    const allDone = order.group.orders.every((o) => o.id === orderId || ["DELIVERED", "CANCELLED", "RETURNED"].includes(o.status));
    if (allDone) await db.orderGroup.update({ where: { id: order.groupId }, data: { paymentStatus: "PAID" } });
  }
  await trackMission(order.userId, "ORDER").catch(() => {});
  const { evaluateAchievements } = await import("./gamification");
  await evaluateAchievements(order.userId).catch(() => {});
  const { recomputeLoyaltyTier } = await import("./loyalty");
  await recomputeLoyaltyTier(order.userId).catch(() => {});
  const { maybeRewardReferral } = await import("./loyalty");
  await maybeRewardReferral(order.userId).catch(() => {});
  const { checkAchievements } = await import("./loyalty");
  await checkAchievements(order.userId).catch(() => {});
}
