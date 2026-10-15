import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogOut, Store } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { ADMIN_NAV } from "@/components/admin/nav";
import { AdminSidebar } from "@/components/admin/sidebar";
import { Avatar, Badge } from "@/components/ui/display";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { staffLogoutAction } from "@/server/actions/staff";
import { adminBadges } from "@/server/services/admin-badges";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff();
  const t = await getTranslations("admin");
  const groups = ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || staff.permissions.has(i.permission)) })).filter((g) => g.items.length);
  const badges = await adminBadges(staff.permissions);

  return (
    <div className="flex min-h-dvh bg-surface-2">
      <AdminSidebar groups={groups} badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-2 border-b border-border bg-surface/90 px-4 backdrop-blur md:px-6">
          <Link href="/" className="mr-auto hidden items-center gap-2 text-sm font-semibold text-muted hover:text-fg sm:flex lg:ml-0">
            <Store className="h-4 w-4" /> {t("backToStore")}
          </Link>
          <LocaleSwitcher compact />
          <ThemeToggle />
          <div className="flex items-center gap-2.5 pl-2">
            <Avatar name={staff.user.name ?? staff.user.login} size={34} />
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-bold">{staff.user.name ?? staff.user.login}</p>
              <Badge tone={staff.role === "SUPER_ADMIN" ? "primary" : "neutral"} className="mt-0.5 px-1.5 py-0 text-[10px]">
                {staff.role}
              </Badge>
            </div>
          </div>
          <form action={staffLogoutAction}>
            <button type="submit" className="rounded-[10px] p-2 text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("logout")} title={t("logout")}>
              <LogOut className="h-5 w-5" />
            </button>
          </form>
        </header>
        <main id="main" className="flex-1 p-4 pt-6 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
