import "server-only";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/server/db";
import { getCurrentUser, getStaffSession, getUserSession, type CurrentUser, type StaffContext } from "./session";
import type { Permission } from "@/lib/rbac";

/** Page guard: signed-in user (PIN satisfied) or redirect to login. */
export async function requireUser(next?: string): Promise<CurrentUser> {
  const locale = await getLocale();
  const s = await getUserSession();
  if (s?.needsPin) return redirect({ href: `/auth/pin${next ? `?next=${encodeURIComponent(next)}` : ""}`, locale });
  const user = await getCurrentUser();
  if (!user) return redirect({ href: `/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`, locale });
  return user;
}

/** Page guard for /admin: active staff session with the permission, else login / 403 page. */
export async function requireStaff(permission?: Permission): Promise<StaffContext> {
  const locale = await getLocale();
  const staff = await getStaffSession();
  if (!staff) return redirect({ href: "/staff/login", locale });
  if (permission && !staff.permissions.has(permission)) return redirect({ href: "/admin/forbidden", locale });
  return staff;
}

/** Only allow relative in-app redirects (no open redirect). */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

export const ACTIVE_SHOP_COOKIE = "anor_shop";

/** Seller cabinet guard: signed-in user, their shops and the active one (cookie, else the first). */
export async function requireSeller(next = "/seller") {
  const user = await requireUser(next);
  const shops = await db.shop.findMany({
    where: { ownerId: user.id },
    select: { id: true, slug: true, name: true, status: true, logoUrl: true, rating: true, tier: true, kycLevel: true, restrictedAt: true, fulfillmentScore: true, moderationNote: true },
    orderBy: { createdAt: "asc" },
  });
  const { cookies } = await import("next/headers");
  const wanted = (await cookies()).get(ACTIVE_SHOP_COOKIE)?.value;
  const shop = shops.find((s) => s.id === wanted) ?? shops[0] ?? null;
  return { user, shops, shop };
}

/** Like requireSeller, but the cabinet page needs a shop (layout shows onboarding otherwise). */
export async function requireShop(next = "/seller") {
  const ctx = await requireSeller(next);
  if (!ctx.shop) {
    const locale = await getLocale();
    return redirect({ href: "/seller/onboarding", locale });
  }
  return { ...ctx, shop: ctx.shop };
}
