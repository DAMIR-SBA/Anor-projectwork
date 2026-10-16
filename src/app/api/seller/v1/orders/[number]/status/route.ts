import { z } from "zod";
import { jsonBody, sellerApi } from "@/server/api/seller-api";
import { apiSetOrderStatus } from "@/server/services/seller/api-v1";

export const dynamic = "force-dynamic";

const zBody = z.object({ status: z.enum(["CONFIRMED", "PACKED", "SHIPPED"]) });

/** POST /api/seller/v1/orders/{number}/status  { "status": "CONFIRMED" } — confirm → packed → handed over. */
export const POST = sellerApi<{ number: string }>("orders:write", async (req, ctx, { number }) => {
  const body = zBody.parse(await jsonBody(req));
  return apiSetOrderStatus(ctx.shop.id, ctx.actor, number, body.status);
});
