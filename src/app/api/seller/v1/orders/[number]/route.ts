import { sellerApi } from "@/server/api/seller-api";
import { apiGetOrder } from "@/server/services/seller/api-v1";

export const dynamic = "force-dynamic";

/** GET /api/seller/v1/orders/{number} */
export const GET = sellerApi<{ number: string }>("orders:read", async (_req, ctx, { number }) => apiGetOrder(ctx.shop.id, number));
