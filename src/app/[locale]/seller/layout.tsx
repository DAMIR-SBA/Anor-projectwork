import { getTranslations, setRequestLocale } from "next-intl/server";
import { Store } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireSeller } from "@/server/auth/guards";
import { db } from "@/server/db";
import { SellerSidebar } from "@/components/seller/sidebar";
import { Avatar, EmptyState } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export const metadata = { robots: { index: false, follow: false } };

export default async function SellerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, shops } = await requireSeller();
  const t = await getTranslations("seller");
  const shop = shops[0] ?? null;
  const [reviews, questions] = shop
    ? await Promise.all([
        db.review.count({ where: { product: { shop: { ownerId: user.id } }, status: "APPROVED", deletedAt: null, reply: { is: null } } }),
        db.question.count({ where: { product: { shop: { ownerId: user.id } }, status: "PUBLISHED", answers: { none: { isSeller: true } } } }),
      ])
    : [0, 0];

  return (
    <div className="flex min-h-dvh bg-surface-2">
      <SellerSidebar badges={{ reviews, questions }} shop={shop} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-2 border-b border-border bg-surface/90 px-4 backdrop-blur md:px-6">
          <Link href="/" className="mr-auto hidden items-center gap-2 text-sm font-semibold text-muted hover:text-fg sm:flex">
            <Store className="h-4 w-4" /> ANOR
          </Link>
          <LocaleSwitcher compact />
          <ThemeToggle />
          <div className="flex items-center gap-2.5 pl-2">
            <Avatar name={shop?.name ?? user.name ?? user.login} src={shop?.logoUrl} size={34} />
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-bold">{shop?.name ?? user.login}</p>
              <p className="text-xs text-muted">{user.name ?? user.login}</p>
            </div>
          </div>
        </header>
        <main id="main" className="flex-1 p-4 pt-6 md:p-6 lg:p-8">
          {shop ? children : <EmptyState className="card" icon={<Store className="h-8 w-8" />} title={t("noShop")} description={t("noShopText")} action={<span className={buttonClasses("primary", "md", "pointer-events-none opacity-60")}>{t("openShop")}</span>} />}
        </main>
      </div>
    </div>
  );
}
