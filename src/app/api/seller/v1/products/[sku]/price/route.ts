import { z } from "zod";
import { jsonBody, sellerApi } from "@/server/api/seller-api";
import { apiSetPrice } from "@/server/services/seller/api-v1";

export const dynamic = "force-dynamic";

const zBody = z.object({ price: z.number().int().min(1000).max(1_000_000_000), old_price: z.number().int().min(1000).max(1_000_000_000).nullable().optional() });

/** PUT /api/seller/v1/products/{sku}/price  { "price": 1290000, "old_price": 1490000 } (so'm, integers). */
export const PUT = sellerApi<{ sku: string }>("products:write", async (req, ctx, { sku }) => {
  const body = zBody.parse(await jsonBody(req));
  return apiSetPrice(ctx.shop.id, decodeURIComponent(sku), body.price, body.old_price);
});
