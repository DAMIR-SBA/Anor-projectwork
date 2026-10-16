import "server-only";
import { db } from "@/server/db";
import { onPaymentPaid } from "./service";
import { markGroupPlaced } from "@/server/services/orders";
import { walletCredit } from "@/server/services/wallet";
import { notify } from "@/server/notify";
import { randomCode } from "@/server/security/crypto";

onPaymentPaid("ORDER", async (p) => {
  if (p.groupId) await markGroupPlaced(p.groupId, true);
});

onPaymentPaid("WALLET_TOPUP", async (p) => {
  await db.$transaction((tx) => walletCredit(tx, p.userId, p.amount, "TOPUP", { refType: "payment", refId: p.id, description: "Top-up" }));
  await notify({ userId: p.userId, type: "wallet.topup", title: "Anor Hamyon", body: `+${p.amount.toLocaleString("ru-RU")} so‘m`, href: "/account/wallet" });
});

onPaymentPaid("GIFT_CARD", async (p) => {
  const card = await db.giftCard.create({
    data: {
      code: randomCode(4, 4),
      amount: p.amount,
      balance: p.amount,
      buyerId: p.userId,
      recipientName: (p.meta.recipientName as string) ?? null,
      message: (p.meta.message as string) ?? null,
      design: (p.meta.design as string) ?? "pomegranate",
      expiresAt: new Date(Date.now() + 365 * 86_400_000),
    },
  });
  await notify({ userId: p.userId, type: "giftcard.ready", title: "Sovg‘a kartasi tayyor", body: card.code, href: "/account/gift-cards" });
});

onPaymentPaid("INSTALLMENT", async (p) => {
  const { settleCardRepayment } = await import("@/server/services/nasiya");
  await settleCardRepayment(p);
});

onPaymentPaid("SUBSCRIPTION", async (p) => {
  const { settleSubscriptionPayment } = await import("@/server/services/plus");
  await settleSubscriptionPayment(p);
});
