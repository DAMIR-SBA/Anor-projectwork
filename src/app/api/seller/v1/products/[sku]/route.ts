import { sellerApi } from "@/server/api/seller-api";
import { apiGetSku } from "@/server/services/seller/api-v1";

export const dynamic = "force-dynamic";

/** GET /api/seller/v1/products/{sku} */
export const GET = sellerApi<{ sku: string }>("products:read", async (_req, ctx, { sku }) => apiGetSku(ctx.shop.id, decodeURIComponent(sku)));
