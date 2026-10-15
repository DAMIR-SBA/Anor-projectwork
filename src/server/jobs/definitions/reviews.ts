import "server-only";
import { db } from "@/server/db";
import { defineJob } from "../registry";
import { buildReviewSummary } from "@/server/services/reviews";

defineJob("reviews.summary", {
  description: "Rebuild the “What buyers say” summary for one product (or all with reviews)",
  handler: async (data) => {
    const productId = typeof data?.productId === "string" ? data.productId : null;
    if (productId) return { built: (await buildReviewSummary(productId)) ? 1 : 0 };
    const products = await db.product.findMany({ where: { reviewCount: { gte: 3 } }, select: { id: true } });
    let built = 0;
    for (const p of products) if (await buildReviewSummary(p.id)) built++;
    return { built };
  },
});

defineJob("reviews.summary-refresh", {
  cron: "20 2 * * *",
  description: "Nightly refresh of review summaries",
  handler: async () => {
    const products = await db.product.findMany({ where: { reviewCount: { gte: 3 } }, select: { id: true } });
    for (const p of products) await buildReviewSummary(p.id);
    return { products: products.length };
  },
});
