import { z } from "zod";
import { jsonBody, sellerApi } from "@/server/api/seller-api";
import { apiSetStock } from "@/server/services/seller/api-v1";

export const dynamic = "force-dynamic";

const zBody = z.object({ quantity: z.number().int().min(0).max(1_000_000) });

/** PUT /api/seller/v1/products/{sku}/stock  { "quantity": 12 } — seller-warehouse quantity (FBS/DBS). */
export const PUT = sellerApi<{ sku: string }>("products:write", async (req, ctx, { sku }) => {
  const body = zBody.parse(await jsonBody(req));
  return apiSetStock(ctx.shop.id, ctx.actor, decodeURIComponent(sku), body.quantity);
});
