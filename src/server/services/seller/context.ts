import "server-only";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { ACTIVE_SHOP_COOKIE } from "@/server/auth/guards";

/** The caller's active shop inside server actions and route handlers (same rule as the cabinet layout). */
export async function activeShop(userId: string) {
  const shops = await db.shop.findMany({ where: { ownerId: userId, status: { not: "REJECTED" } }, select: { id: true, status: true, tier: true, name: true, slug: true, restrictedAt: true, ownerId: true }, orderBy: { createdAt: "asc" } });
  const wanted = (await cookies()).get(ACTIVE_SHOP_COOKIE)?.value;
  const shop = shops.find((s) => s.id === wanted) ?? shops.find((s) => s.status === "APPROVED") ?? shops[0];
  if (!shop) throw new AppError("forbidden");
  return shop;
}
