import { z } from "zod";
import { searchParams, sellerApi, zPage } from "@/server/api/seller-api";
import { apiListOrders } from "@/server/services/seller/api-v1";

export const dynamic = "force-dynamic";

const zQuery = zPage.extend({ status: z.enum(["PLACED", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"]).optional(), since: z.coerce.date().optional() });

/** GET /api/seller/v1/orders?status=PLACED&since=2026-10-01T00:00:00Z */
export const GET = sellerApi("orders:read", async (req, ctx) => {
  const q = zQuery.parse(searchParams(req));
  return apiListOrders(ctx.shop.id, { page: q.page, perPage: q.per_page, status: q.status, since: q.since });
});
