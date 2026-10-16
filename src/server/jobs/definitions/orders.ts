import "server-only";
import { db } from "@/server/db";
import { defineJob } from "../registry";
import { cancelUnpaidGroup, transitionOrder, PICKUP_STORAGE_DAYS } from "@/server/services/orders";
import { notify } from "@/server/notify";
import { expireBonuses } from "@/server/services/wallet";
import { deliverWebhook } from "@/server/services/webhooks";
import { recomputeShopMetrics } from "@/server/services/shop-metrics";
import { addDays } from "@/lib/dates";

defineJob("orders.expire-unpaid", {
  cron: "*/5 * * * *",
  description: "Cancel checkouts left unpaid for 30 minutes and release their stock",
  handler: async () => {
    const stale = await db.orderGroup.findMany({ where: { paymentStatus: "PENDING", paymentMethod: { not: "BANK_TRANSFER" }, createdAt: { lt: new Date(Date.now() - 30 * 60_000) }, orders: { some: { status: "PENDING_PAYMENT" } } }, select: { id: true } });
    for (const g of stale) await cancelUnpaidGroup(g.id);
    return { cancelled: stale.length };
  },
});

defineJob("orders.pickup-reminders", {
  cron: "0 5 * * *",
  description: "Remind buyers about parcels waiting at pickup points; return expired ones",
  handler: async () => {
    const waiting = await db.order.findMany({ where: { status: "SHIPPED", deliveryMethod: "PICKUP", pickupExpiresAt: { not: null } }, include: { pickupPoint: true } });
    let reminded = 0;
    let returned = 0;
    for (const o of waiting) {
      const left = Math.ceil((o.pickupExpiresAt!.getTime() - Date.now()) / 86_400_000);
      if (left <= 0) {
        await transitionOrder(o.id, "RETURNED", { actor: "system" }, "storage_expired");
        returned++;
      } else if (left <= 2) {
        await notify({ userId: o.userId, type: "order.pickup_reminder", title: `№${o.number}`, body: `${o.pickupPoint?.name}: ${left} kun qoldi. Kod: ${o.pickupCode}`, href: `/account/orders/${o.id}`, channels: ["sms", "telegram", "push"] });
        reminded++;
      }
    }
    return { reminded, returned, storageDays: PICKUP_STORAGE_DAYS };
  },
});

defineJob("orders.fbs-sla", {
  cron: "*/15 * * * *",
  description: "Penalize FBS sellers who miss the handover SLA",
  handler: async () => {
    const late = await db.shipment.findMany({ where: { status: "AWAITING_HANDOVER", handoverDeadline: { lt: new Date() } }, include: { order: { include: { penalties: true } } } });
    let penalized = 0;
    for (const s of late) {
      if (s.order.penalties.some((p) => p.type === "LATE_HANDOVER")) continue;
      await db.penalty.create({ data: { shopId: s.order.shopId, orderId: s.orderId, type: "LATE_HANDOVER", amount: Math.max(10_000, Math.round(s.order.total * 0.02)), reason: `SLA ${s.handoverDeadline?.toISOString()}` } });
      await recomputeShopMetrics(s.order.shopId);
      penalized++;
    }
    return { penalized };
  },
});

defineJob("bonus.expire", { cron: "30 0 * * *", description: "Expire bonus points past their date", handler: () => expireBonuses() });

defineJob("webhooks.deliver", {
  description: "Deliver one seller webhook (retried with backoff)",
  handler: async (data) => deliverWebhook(String(data?.deliveryId)),
});

defineJob("alerts.price-stock", {
  cron: "0 * * * *",
  description: "Send price-drop and back-in-stock alerts",
  handler: async () => {
    const alerts = await db.productAlert.findMany({ where: { notifiedAt: null }, include: { product: { include: { variants: true } }, variant: true } });
    let sent = 0;
    for (const a of alerts) {
      const variants = a.variant ? [a.variant] : a.product.variants;
      const minPrice = Math.min(...variants.map((v) => v.price));
      const inStock = variants.some((v) => v.stock > 0);
      const fire = (a.type === "PRICE_DROP" && a.targetPrice != null && minPrice < a.targetPrice) || (a.type === "BACK_IN_STOCK" && inStock);
      if (!fire) continue;
      await notify({
        userId: a.userId,
        type: a.type === "PRICE_DROP" ? "alert.price_drop" : "alert.back_in_stock",
        title: a.type === "PRICE_DROP" ? "Narx tushdi!" : "Yana sotuvda!",
        body: `${a.product.titleUz}: ${minPrice.toLocaleString("ru-RU")} so‘m`,
        href: `/p/${a.product.slug}`,
        channels: ["telegram", "push", "email"],
      });
      await db.productAlert.update({ where: { id: a.id }, data: { notifiedAt: new Date() } });
      sent++;
    }
    return { sent };
  },
});

defineJob("prices.scheduled", {
  cron: "*/10 * * * *",
  description: "Apply and revert scheduled price changes",
  handler: async () => {
    const now = new Date();
    const due = await db.scheduledPriceChange.findMany({ where: { appliedAt: null, startsAt: { lte: now } }, include: { variant: true } });
    for (const c of due) {
      await db.$transaction([
        db.scheduledPriceChange.update({ where: { id: c.id }, data: { appliedAt: now, revertTo: c.variant.price } }),
        db.variant.update({ where: { id: c.variantId }, data: { price: c.newPrice, oldPrice: c.newOldPrice ?? c.variant.oldPrice } }),
        db.priceHistory.create({ data: { variantId: c.variantId, price: c.newPrice } }),
      ]);
      const { syncProductPrice } = await import("@/server/services/products");
      await syncProductPrice(c.variant.productId);
    }
    const ending = await db.scheduledPriceChange.findMany({ where: { appliedAt: { not: null }, revertedAt: null, endsAt: { lte: now } }, include: { variant: true } });
    for (const c of ending) {
      await db.$transaction([
        db.scheduledPriceChange.update({ where: { id: c.id }, data: { revertedAt: now } }),
        db.variant.update({ where: { id: c.variantId }, data: { price: c.revertTo ?? c.variant.price } }),
        db.priceHistory.create({ data: { variantId: c.variantId, price: c.revertTo ?? c.variant.price } }),
      ]);
      const { syncProductPrice } = await import("@/server/services/products");
      await syncProductPrice(c.variant.productId);
    }
    return { applied: due.length, reverted: ending.length, at: addDays(now, 0).toISOString() };
  },
});
