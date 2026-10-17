import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { walletDebit } from "./wallet";
import { startPayment } from "@/server/payments/service";
import { addMonths, PLUS_PLANS, RENEWAL_NOTICE_DAYS, type PlusPlan } from "@/lib/plus";
import type { PaymentMethod } from "@/generated/prisma/enums";

const DAY = 86_400_000;

/** The subscription that currently gives Plus benefits (active and not past its period). */
export async function currentPlus(userId: string) {
  return db.subscription.findFirst({ where: { userId, status: "ACTIVE", currentPeriodEnd: { gt: new Date() } }, orderBy: { currentPeriodEnd: "desc" } });
}

export async function plusOverview(userId: string) {
  const [sub, history, wallet, cards, orders] = await Promise.all([
    currentPlus(userId),
    db.payment.findMany({ where: { userId, purpose: "SUBSCRIPTION", status: "PAID" }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.wallet.findUnique({ where: { userId }, select: { balance: true } }),
    db.savedCard.findMany({ where: { userId }, select: { id: true, brand: true, last4: true, provider: true } }),
    db.order.count({ where: { userId, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] }, createdAt: { gte: new Date(Date.now() - 365 * DAY) } } }),
  ]);
  return { sub, history, walletBalance: wallet?.balance ?? 0, cards, ordersLastYear: orders };
}

/** Start or extend the period after a successful charge. */
async function activate(userId: string, plan: PlusPlan, paymentId: string | null) {
  const existing = await currentPlus(userId);
  const months = PLUS_PLANS[plan].months;
  const sub = existing
    ? await db.subscription.update({ where: { id: existing.id }, data: { plan, price: PLUS_PLANS[plan].price, currentPeriodEnd: addMonths(existing.currentPeriodEnd, months), autoRenew: true, cancelledAt: null } })
    : await db.subscription.create({ data: { userId, plan, price: PLUS_PLANS[plan].price, status: "ACTIVE", autoRenew: true, currentPeriodEnd: addMonths(new Date(), months) } });
  await audit({ actorId: userId, actorKind: "user", action: existing ? "plus.extended" : "plus.subscribed", entityType: "Subscription", entityId: sub.id, after: { plan, until: sub.currentPeriodEnd, paymentId } });
  await notify({ userId, type: "plus.active", title: "ANOR Plus", body: `Faol: ${sub.currentPeriodEnd.toISOString().slice(0, 10)} gacha`, href: "/account/plus" });
  return sub;
}

/** Subscribe with Anor Hamyon (instant) or a card (via the payment page or a saved token). */
export async function subscribePlus(userId: string, plan: PlusPlan, method: PaymentMethod | "WALLET", savedCardId?: string | null) {
  if (await currentPlus(userId)) throw new AppError("plusActive");
  const price = PLUS_PLANS[plan].price;
  if (method === "WALLET") {
    const payment = await db.$transaction(async (tx) => {
      await walletDebit(tx, userId, price, "PAYMENT", { refType: "subscription", description: "ANOR Plus" });
      return tx.payment.create({ data: { userId, method: "WALLET", purpose: "SUBSCRIPTION", amount: price, status: "PAID", paidAt: new Date(), meta: { plan } } });
    });
    await activate(userId, plan, payment.id);
    return { redirectUrl: null };
  }
  const p = await startPayment({ userId, method, amount: price, purpose: "SUBSCRIPTION", meta: { plan }, savedCardId });
  return { redirectUrl: p.status === "PAID" ? null : p.redirectUrl };
}

/** Payment handler for card subscriptions and renewals. */
export async function settleSubscriptionPayment(p: { id: string; userId: string; meta: Record<string, unknown> }) {
  await activate(p.userId, (p.meta.plan as PlusPlan) ?? "PLUS_MONTHLY", p.id);
}

/** Cancel = stop auto-renewal; benefits stay until the paid period ends. Resume undoes it. */
export async function setAutoRenew(userId: string, on: boolean) {
  const sub = await currentPlus(userId);
  if (!sub) throw new AppError("notFound");
  await db.subscription.update({ where: { id: sub.id }, data: { autoRenew: on, cancelledAt: on ? null : new Date() } });
  await audit({ actorId: userId, actorKind: "user", action: on ? "plus.resumed" : "plus.cancelled", entityType: "Subscription", entityId: sub.id });
}

/**
 * Daily: remind before renewal, charge due renewals (wallet first, then the newest saved card)
 * and expire subscriptions that were cancelled or could not be charged.
 */
export async function plusDaily(now = new Date()) {
  const upcoming = await db.subscription.findMany({ where: { status: "ACTIVE", autoRenew: true, currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + RENEWAL_NOTICE_DAYS * DAY) } } });
  for (const s of upcoming) await notify({ userId: s.userId, type: "plus.renewal_soon", title: "ANOR Plus", body: `${s.currentPeriodEnd.toISOString().slice(0, 10)}: ${s.price.toLocaleString("ru-RU")} so‘m avtomatik yangilanadi`, href: "/account/plus" });

  const due = await db.subscription.findMany({ where: { status: "ACTIVE", currentPeriodEnd: { lte: now } } });
  let renewed = 0;
  let expired = 0;
  for (const s of due) {
    const plan = s.plan as PlusPlan;
    let ok = false;
    if (s.autoRenew) {
      const price = PLUS_PLANS[plan].price;
      try {
        await db.$transaction(async (tx) => {
          await walletDebit(tx, s.userId, price, "PAYMENT", { refType: "subscription", refId: s.id, description: "ANOR Plus" });
          await tx.payment.create({ data: { userId: s.userId, method: "WALLET", purpose: "SUBSCRIPTION", amount: price, status: "PAID", paidAt: now, meta: { plan, renewal: true } } });
        });
        ok = true;
      } catch {
        const card = await db.savedCard.findFirst({ where: { userId: s.userId }, orderBy: { createdAt: "desc" } });
        if (card) ok = (await startPayment({ userId: s.userId, method: card.provider, amount: price, purpose: "PLUS_RENEWAL", meta: { plan, subscriptionId: s.id }, savedCardId: card.id })).status === "PAID";
      }
      if (ok) {
        await db.subscription.update({ where: { id: s.id }, data: { currentPeriodEnd: addMonths(s.currentPeriodEnd, PLUS_PLANS[plan].months) } });
        renewed++;
        continue;
      }
    }
    await db.subscription.update({ where: { id: s.id }, data: { status: "EXPIRED" } });
    expired++;
    await notify({ userId: s.userId, type: "plus.expired", title: "ANOR Plus", body: s.autoRenew ? "To‘lov o‘tmadi — obuna to‘xtatildi" : "Obuna muddati tugadi", href: "/plus", channels: ["push", "telegram"] });
  }
  return { reminded: upcoming.length, renewed, expired };
}
