import "server-only";
import { db } from "@/server/db";
import { log } from "@/server/log";
import { AppError } from "@/server/errors";
import { randomToken } from "@/server/security/crypto";
import { PROVIDERS, cardBrand } from "./providers";
import { walletCredit } from "@/server/services/wallet";
import type { PaymentMethod } from "@/generated/prisma/enums";

type PaidHandler = (payment: { id: string; userId: string; amount: number; groupId: string | null; meta: Record<string, unknown> }) => Promise<void>;
const handlers = new Map<string, PaidHandler>();
const failHandlers = new Map<string, PaidHandler>();

/** Purpose-specific side effects after a payment succeeds (ORDER, WALLET_TOPUP, GIFT_CARD, SUBSCRIPTION...). */
export function onPaymentPaid(purpose: string, handler: PaidHandler) {
  handlers.set(purpose, handler);
}
export function onPaymentFailed(purpose: string, handler: PaidHandler) {
  failHandlers.set(purpose, handler);
}

async function loadHandlers() {
  await import("./handlers");
}

export async function startPayment(input: { userId: string; method: PaymentMethod; amount: number; purpose: string; groupId?: string | null; meta?: Record<string, unknown>; savedCardId?: string | null }) {
  const provider = PROVIDERS[input.method];
  if (!provider.online) throw new AppError("generic");
  const card = input.savedCardId ? await db.savedCard.findFirst({ where: { id: input.savedCardId, userId: input.userId } }) : null;
  const payment = await db.payment.create({
    data: { userId: input.userId, method: input.method, amount: input.amount, purpose: input.purpose, groupId: input.groupId ?? null, meta: (input.meta ?? {}) as object, savedCardId: card?.id ?? null },
  });
  const r = await provider.createPayment({ id: payment.id, amount: payment.amount, savedCardToken: card?.token });
  await db.payment.update({ where: { id: payment.id }, data: { externalId: r.externalId } });
  if (r.status === "PAID") await completePayment(payment.id, true);
  return { paymentId: payment.id, redirectUrl: r.redirectUrl ?? null, status: r.status };
}

/** Idempotent: settle a payment and run its purpose handler exactly once. */
export async function completePayment(paymentId: string, success: boolean, opts: { saveCard?: { pan: string; exp: string } | null } = {}) {
  await loadHandlers();
  const claimed = await db.payment.updateMany({
    where: { id: paymentId, status: { in: ["PENDING", "AUTHORIZED"] } },
    data: success ? { status: "PAID", paidAt: new Date() } : { status: "FAILED" },
  });
  if (claimed.count !== 1) return db.payment.findUnique({ where: { id: paymentId } });
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (success && opts.saveCard) {
    const digits = opts.saveCard.pan.replace(/\D/g, "");
    const [mm, yy] = opts.saveCard.exp.split("/").map((x) => parseInt(x, 10));
    await db.savedCard.create({
      data: { userId: payment.userId, provider: payment.method, token: `tok_${randomToken(16)}`, brand: cardBrand(digits), last4: digits.slice(-4), expMonth: mm || 12, expYear: 2000 + (yy || 30) },
    });
  }
  const handler = (success ? handlers : failHandlers).get(payment.purpose);
  if (handler) {
    try {
      await handler({ id: payment.id, userId: payment.userId, amount: payment.amount, groupId: payment.groupId, meta: (payment.meta as Record<string, unknown>) ?? {} });
    } catch (err) {
      log.error("payment handler failed", { err, paymentId, purpose: payment.purpose });
    }
  }
  return payment;
}

/** Refund to the original card or to Anor Hamyon. Partial refunds supported. */
export async function refundPayment(input: { paymentId: string; amount: number; method: "CARD" | "WALLET"; returnId?: string; reason?: string }) {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
  const refundable = payment.amount - payment.refundedAmount;
  const amount = Math.min(input.amount, refundable);
  if (amount <= 0 || payment.status === "FAILED" || payment.status === "PENDING") throw new AppError("conflict");
  // Wallet/cash/installment-funded orders can only be refunded to the wallet.
  const toWallet = input.method === "WALLET" || !PROVIDERS[payment.method].online;
  return db.$transaction(async (tx) => {
    let externalId: string | null = null;
    if (!toWallet) externalId = (await PROVIDERS[payment.method].refund({ id: payment.id, externalId: payment.externalId, amount })).externalId;
    else await walletCredit(tx, payment.userId, amount, "REFUND", { refType: "payment", refId: payment.id, description: input.reason });
    const newRefunded = payment.refundedAmount + amount;
    await tx.payment.update({ where: { id: payment.id }, data: { refundedAmount: newRefunded, status: newRefunded >= payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    return tx.refund.create({ data: { paymentId: payment.id, returnId: input.returnId, amount, method: toWallet ? "WALLET" : "CARD", status: "COMPLETED", externalId, reason: input.reason, completedAt: new Date() } });
  });
}
