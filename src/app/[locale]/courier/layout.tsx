import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogOut } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { AnorLogo } from "@/components/brand/AnorLogo";
import { staffLogoutAction } from "@/server/actions/staff";

export const metadata = { robots: { index: false } };

/** Mobile-first courier app shell (staff with courier.deliver). */
export default async function CourierLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("courier.deliver");
  const t = await getTranslations("courier");
  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-surface-2">
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#1A1A1F] px-4 py-3 text-white">
        <Link href="/courier" className="flex items-center gap-2">
          <AnorLogo tone="white" height={24} />
          <span className="text-sm font-bold">{t("title")}</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {staff.user.name}
          <form action={staffLogoutAction}>
            <button type="submit" aria-label="logout">
              <LogOut className="h-5 w-5" />
            </button>
          </form>
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
