import "server-only";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
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
