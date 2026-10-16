import { z } from "zod";
import { searchParams, sellerApi, zPage } from "@/server/api/seller-api";
import { apiListProducts } from "@/server/services/seller/api-v1";

export const dynamic = "force-dynamic";

const zQuery = zPage.extend({ updated_since: z.coerce.date().optional() });

/** GET /api/seller/v1/products?page=1&per_page=50&updated_since=2026-10-01T00:00:00Z */
export const GET = sellerApi("products:read", async (req, ctx) => {
  const q = zQuery.parse(searchParams(req));
  return apiListProducts(ctx.shop.id, { page: q.page, perPage: q.per_page, updatedSince: q.updated_since });
});
