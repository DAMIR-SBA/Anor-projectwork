import { z } from "zod";
import { jsonBody, sellerApi } from "@/server/api/seller-api";
import { apiBulkStock } from "@/server/services/seller/api-v1";

export const dynamic = "force-dynamic";

const zBody = z.object({ items: z.array(z.object({ sku: z.string().min(1).max(64), quantity: z.number().int().min(0).max(1_000_000) })).min(1).max(500) });

/** POST /api/seller/v1/stock  { "items": [{ "sku": "TH-001", "quantity": 5 }] } — up to 500 SKUs per call. */
export const POST = sellerApi("products:write", async (req, ctx) => {
  const body = zBody.parse(await jsonBody(req));
  return apiBulkStock(ctx.shop.id, ctx.actor, body.items);
});
