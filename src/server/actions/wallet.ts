"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { action, AppError, zInt, normalizePhone } from "@/server/action";
import { startPayment } from "@/server/payments/service";
import { walletCredit, walletDebit } from "@/server/services/wallet";
import { notify } from "@/server/notify";
import { audit } from "@/server/audit";
import { randomDigits, normalizeCode } from "@/server/security/crypto";
import { SERVICE_PROVIDERS } from "@/lib/services";

const zOnline = z.enum(["CLICK", "PAYME", "UZCARD", "HUMO", "CARD"]);

export const topupAction = action({ rateLimit: { key: "topup", limit: 20, window: 3600 }, schema: z.object({ amount: zInt(10_000, 50_000_000), method: zOnline, savedCardId: z.string().optional() }) }, async (input, ctx) => {
  const r = await startPayment({ userId: ctx.user.id, method: input.method, amount: input.amount, purpose: "WALLET_TOPUP", savedCardId: input.savedCardId });
  revalidatePath("/[locale]/account/wallet", "page");
  return { ok: true, data: r };
});


export const servicePaymentAction = action(
  { rateLimit: { key: "service", limit: 30, window: 3600 }, schema: z.object({ category: z.enum(["MOBILE", "INTERNET", "UTILITIES", "QR"]), provider: z.string().min(1).max(60), account: z.string().trim().min(3).max(60), amount: zInt(1_000, 20_000_000) }) },
  async (input, ctx) => {
    if (!(SERVICE_PROVIDERS[input.category] ?? []).includes(input.provider) && input.category !== "QR") throw new AppError("invalidInput");
    if (input.category === "MOBILE" && !normalizePhone(input.account)) throw new AppError("phoneFormat", undefined, "account");
    const receiptNo = `S${randomDigits(10)}`;
    await db.$transaction(async (tx) => {
      await walletDebit(tx, ctx.user.id, input.amount, "SERVICE_PAYMENT", { refType: "service", refId: receiptNo, description: `${input.provider} · ${input.account}` });
      await tx.servicePayment.create({ data: { userId: ctx.user.id, category: input.category, provider: input.provider, account: input.account, amount: input.amount, receiptNo } });
    });
    revalidatePath("/[locale]/account/wallet", "page");
    return { ok: true, data: { receiptNo } };
  },
);

export const transferAction = action({ rateLimit: { key: "transfer", limit: 10, window: 3600 }, schema: z.object({ to: z.string().trim().min(3).max(40), amount: zInt(1_000, 10_000_000) }) }, async (input, ctx) => {
  const phone = normalizePhone(input.to);
  const recipient = await db.user.findFirst({ where: phone ? { phone } : { login: input.to.toLowerCase() }, select: { id: true, login: true, status: true } });
  if (!recipient || recipient.status !== "ACTIVE") throw new AppError("recipientNotFound", undefined, "to");
  if (recipient.id === ctx.user.id) throw new AppError("selfTransfer", undefined, "to");
  const receiptNo = `T${randomDigits(10)}`;
  await db.$transaction(async (tx) => {
    await walletDebit(tx, ctx.user.id, input.amount, "TRANSFER_OUT", { refType: "transfer", refId: receiptNo, description: `→ @${recipient.login}` });
    await walletCredit(tx, recipient.id, input.amount, "TRANSFER_IN", { refType: "transfer", refId: receiptNo, description: `← @${ctx.user.login}` });
    await tx.servicePayment.create({ data: { userId: ctx.user.id, category: "TRANSFER", provider: "ANOR", account: recipient.login, amount: input.amount, receiptNo } });
  });
  await notify({ userId: recipient.id, type: "wallet.transfer_in", title: "Anor Hamyon", body: `+${input.amount.toLocaleString("ru-RU")} so‘m · @${ctx.user.login}`, href: "/account/wallet", channels: ["push", "telegram"] });
  await audit({ actorId: ctx.user.id, actorLogin: ctx.user.login, actorKind: "user", action: "wallet.transfer", entityType: "User", entityId: recipient.id, meta: { amount: input.amount, receiptNo } });
  revalidatePath("/[locale]/account/wallet", "page");
  return { ok: true, data: { receiptNo } };
});

export const buyGiftCardAction = action(
  { schema: z.object({ amount: z.union([z.literal(100_000), z.literal(250_000), z.literal(500_000), z.literal(1_000_000)]), method: zOnline, recipientName: z.string().max(60).optional(), message: z.string().max(200).optional(), design: z.enum(["pomegranate", "navruz", "birthday"]).default("pomegranate") }) },
  async (input, ctx) => {
    const r = await startPayment({ userId: ctx.user.id, method: input.method, amount: input.amount, purpose: "GIFT_CARD", meta: { recipientName: input.recipientName, message: input.message, design: input.design } });
    return { ok: true, data: r };
  },
);

export const redeemGiftCardAction = action({ rateLimit: { key: "giftcard", limit: 10, window: 3600 }, schema: z.object({ code: z.string().min(8).max(24) }) }, async (input, ctx) => {
  const raw = normalizeCode(input.code);
  const code = raw.match(/.{1,4}/g)?.join("-") ?? raw;
  const card = await db.giftCard.findUnique({ where: { code } });
  if (!card || card.balance <= 0 || card.expiresAt < new Date()) throw new AppError("invalidCode", undefined, "code");
  await db.$transaction(async (tx) => {
    const claimed = await tx.giftCard.updateMany({ where: { id: card.id, balance: { gt: 0 } }, data: { balance: 0, redeemedAt: new Date(), redeemedById: ctx.user.id } });
    if (claimed.count !== 1) throw new AppError("invalidCode", undefined, "code");
    await walletCredit(tx, ctx.user.id, card.balance, "GIFT_CARD", { refType: "giftcard", refId: card.id, description: code });
  });
  revalidatePath("/[locale]/account/wallet", "page");
  return { ok: true, data: { amount: card.balance } };
});

export const removeCardAction = action({ schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  await db.savedCard.deleteMany({ where: { id: input.id, userId: ctx.user.id } });
  revalidatePath("/[locale]/account/wallet", "page");
});

export const markNotificationsReadAction = action({ schema: z.object({ ids: z.array(z.string()).optional() }) }, async (input, ctx) => {
  await db.notification.updateMany({ where: { userId: ctx.user.id, readAt: null, ...(input.ids ? { id: { in: input.ids } } : {}) }, data: { readAt: new Date() } });
  revalidatePath("/[locale]", "layout");
});

export const saveNotifyPrefsAction = action({ schema: z.object({ email: z.boolean(), sms: z.boolean(), telegram: z.boolean(), push: z.boolean() }) }, async (input, ctx) => {
  await db.user.update({ where: { id: ctx.user.id }, data: { notifyPrefs: input } });
});

export const savePushSubscriptionAction = action({ schema: z.object({ endpoint: z.string().url().max(800), p256dh: z.string().max(200), auth: z.string().max(100) }) }, async (input, ctx) => {
  await db.pushSubscription.upsert({ where: { endpoint: input.endpoint }, create: { ...input, userId: ctx.user.id }, update: { userId: ctx.user.id, p256dh: input.p256dh, auth: input.auth } });
});
