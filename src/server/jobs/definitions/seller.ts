import "server-only";
import { db } from "@/server/db";
import { defineJob } from "../registry";
import { generatePayouts, settlePayouts } from "@/server/services/seller/finance";
import { approveReturn } from "@/server/services/returns";
import { notify } from "@/server/notify";
import { emitWebhook } from "@/server/services/webhooks";

defineJob("payouts.generate", { cron: "15 1 * * 1", description: "Weekly seller settlements for the previous week (Monday)", handler: () => generatePayouts() });
defineJob("payouts.settle", { cron: "0 5 * * 3", description: "Send pending seller payouts (Wednesday, mocked bank transfer)", handler: () => settlePayouts() });

defineJob("returns.auto-approve", {
  cron: "40 * * * *",
  description: "Approve returns a seller has not answered within 72 hours",
  handler: async () => {
    const stale = await db.return.findMany({ where: { status: "REQUESTED", createdAt: { lt: new Date(Date.now() - 72 * 3_600_000) } }, select: { id: true } });
    for (const r of stale) await approveReturn(r.id, { userId: "system", login: "system", kind: "staff" }).catch(() => {});
    return { approved: stale.length };
  },
});

defineJob("stock.low-alerts", {
  cron: "0 4 * * *",
  description: "Daily low-stock digest for sellers + stock.low webhooks",
  handler: async () => {
    const low = await db.warehouseStock.findMany({ where: { warehouse: { type: "SELLER" }, variant: { product: { status: "ACTIVE", deletedAt: null } } }, include: { variant: { select: { sku: true, product: { select: { shopId: true, titleUz: true, shop: { select: { ownerId: true } } } } } } } });
    const byShop = new Map<string, { ownerId: string; items: Array<{ sku: string; title: string; quantity: number }> }>();
    for (const s of low) {
      if (s.quantity > s.lowStockAt) continue;
      const shopId = s.variant.product.shopId;
      const e = byShop.get(shopId) ?? { ownerId: s.variant.product.shop.ownerId, items: [] };
      e.items.push({ sku: s.variant.sku, title: s.variant.product.titleUz, quantity: s.quantity });
      byShop.set(shopId, e);
    }
    for (const [shopId, e] of byShop) {
      await notify({ userId: e.ownerId, type: "seller.low_stock", title: `Kam qoldiq: ${e.items.length} ta SKU`, body: e.items.slice(0, 3).map((i) => `${i.sku}: ${i.quantity}`).join(", "), href: "/seller/stock?low=1", channels: ["telegram"] });
      await emitWebhook(shopId, "stock.low", { items: e.items });
    }
    return { shops: byShop.size };
  },
});
