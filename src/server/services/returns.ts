import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { notify } from "@/server/notify";
import { audit } from "@/server/audit";
import { randomDigits } from "@/server/security/crypto";
import { canRequestReturn } from "@/lib/order-status";
import { refundPayment } from "@/server/payments/service";
import { walletCredit } from "./wallet";
import { transitionOrder } from "./orders";
import { emitWebhook } from "./webhooks";

export async function createReturn(userId: string, input: { orderItemId: string; quantity: number; reason: string; description?: string; photos: string[]; refundMethod: "CARD" | "WALLET" }) {
  const item = await db.orderItem.findUnique({ where: { id: input.orderItemId }, include: { order: true, returns: true } });
  if (!item || item.order.userId !== userId) throw new AppError("notFound");
  if (!canRequestReturn(item.order.status, item.order.deliveredAt)) throw new AppError("returnWindow");
  const alreadyQty = item.returns.filter((r) => r.status !== "REJECTED").reduce((s, r) => s + r.quantity, 0);
  if (alreadyQty + input.quantity > item.quantity) throw new AppError("alreadyReturned");
  const unit = item.unitPrice - Math.round(item.discount / item.quantity);
  const ret = await db.return.create({
    data: { number: `R-${randomDigits(8)}`, orderId: item.orderId, orderItemId: item.id, userId, quantity: input.quantity, reason: input.reason, description: input.description, photos: input.photos, refundMethod: input.refundMethod, amount: unit * input.quantity },
  });
  const shop = await db.shop.findUniqueOrThrow({ where: { id: item.order.shopId } });
  await notify({ userId: shop.ownerId, type: "seller.return", title: `Qaytarish arizasi ${ret.number}`, body: `${item.title} × ${input.quantity}`, href: `/seller/returns` });
  await emitWebhook(shop.id, "return.created", { id: ret.id, number: ret.number, orderNumber: item.order.number, quantity: input.quantity, reason: input.reason });
  return ret;
}

/**
 * Approve → refund automatically (to card or Anor Hamyon) and close the item.
 * If every item of the order has been returned, the order becomes RETURNED.
 */
export async function approveReturn(returnId: string, by: { userId: string; login: string; kind: "seller" | "staff" }) {
  const ret = await db.return.findUniqueOrThrow({ where: { id: returnId }, include: { order: { include: { group: { include: { payments: true } }, items: true } } } });
  if (!["REQUESTED", "DISPUTED", "RECEIVED"].includes(ret.status)) throw new AppError("conflict");
  await db.return.update({ where: { id: returnId }, data: { status: "APPROVED", decidedAt: new Date() } });
  const payment = ret.order.group.payments.find((p) => p.purpose === "ORDER" && ["PAID", "PARTIALLY_REFUNDED"].includes(p.status));
  if (payment && payment.method !== "COD") {
    await refundPayment({ paymentId: payment.id, amount: ret.amount, method: ret.refundMethod, returnId: ret.id, reason: `return ${ret.number}` });
  } else {
    // Cash/wallet-funded: refund to Anor Hamyon.
    await db.$transaction((tx) => walletCredit(tx, ret.userId, ret.amount, "REFUND", { refType: "return", refId: ret.id, description: ret.number }));
  }
  await db.return.update({ where: { id: returnId }, data: { status: "REFUNDED" } });
  // Return stock to the seller warehouse.
  const item = ret.order.items.find((i) => i.id === ret.orderItemId)!;
  const wh = await db.warehouse.findFirst({ where: { shopId: ret.order.shopId } });
  if (wh) {
    await db.warehouseStock.upsert({ where: { variantId_warehouseId: { variantId: item.variantId, warehouseId: wh.id } }, create: { variantId: item.variantId, warehouseId: wh.id, quantity: ret.quantity }, update: { quantity: { increment: ret.quantity } } });
    await db.variant.update({ where: { id: item.variantId }, data: { stock: { increment: ret.quantity } } });
    await db.stockMovement.create({ data: { variantId: item.variantId, warehouseId: wh.id, delta: ret.quantity, reason: "RETURN", refType: "return", refId: ret.id } });
  }
  const returnedQty = await db.return.aggregate({ _sum: { quantity: true }, where: { orderId: ret.orderId, status: "REFUNDED" } });
  const orderedQty = ret.order.items.reduce((s, i) => s + i.quantity, 0);
  if ((returnedQty._sum.quantity ?? 0) >= orderedQty) await transitionOrder(ret.orderId, "RETURNED", { actor: "system" }, `return ${ret.number}`).catch(() => {});
  await notify({ userId: ret.userId, type: "return.refunded", title: `Qaytarish ${ret.number}`, body: `${ret.amount.toLocaleString("ru-RU")} so‘m qaytarildi`, href: "/account/returns", channels: ["telegram", "push", "email"] });
  await audit({ actorId: by.userId, actorLogin: by.login, actorKind: by.kind, action: "return.approved", entityType: "Return", entityId: ret.id, after: { amount: ret.amount, method: ret.refundMethod } });
}

export async function rejectReturn(returnId: string, by: { userId: string; login: string; kind: "seller" | "staff" }, reason: string) {
  const ret = await db.return.update({ where: { id: returnId }, data: { status: "REJECTED", resolution: reason, decidedAt: new Date() } });
  await notify({ userId: ret.userId, type: "return.rejected", title: `Qaytarish ${ret.number}`, body: reason, href: "/account/returns" });
  await audit({ actorId: by.userId, actorLogin: by.login, actorKind: by.kind, action: "return.rejected", entityType: "Return", entityId: ret.id, meta: { reason } });
}
