import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, Clock, Store } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireSeller } from "@/server/auth/guards";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { SellerSidebar } from "@/components/seller/sidebar";
import { Avatar, EmptyState } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { RealtimeProvider } from "@/components/providers/realtime";

export const metadata = { robots: { index: false, follow: false } };

export default async function SellerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, shops, shop } = await requireSeller();
  const t = await getTranslations("seller");
  const live = shop && shop.status === "APPROVED";
  const [reviews, questions, chats, orders, returns] = shop
    ? await Promise.all([
        db.review.count({ where: { product: { shopId: shop.id }, status: "APPROVED", deletedAt: null, reply: { is: null } } }),
        db.question.count({ where: { product: { shopId: shop.id }, status: "PUBLISHED", answers: { none: { isSeller: true } } } }),
        db.conversationMember.aggregate({ _sum: { unreadCount: true }, where: { userId: user.id, hiddenAt: null, OR: [{ role: "SELLER", conversation: { shopId: shop.id } }, { conversation: { type: "SELLER_SUPPORT" } }] } }).then((a) => a._sum.unreadCount ?? 0),
        db.order.count({ where: { shopId: shop.id, status: "PLACED" } }),
        db.return.count({ where: { status: "REQUESTED", order: { shopId: shop.id } } }),
      ])
    : [0, 0, 0, 0, 0];

  return (
    <RealtimeProvider enabled driver={env().REALTIME_DRIVER}>
      <div className="flex min-h-dvh bg-surface-2">
        <SellerSidebar badges={{ reviews, questions, chats, orders, returns }} shop={shop} shops={shops.filter((s) => s.status === "APPROVED")} />
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
                <p className="text-xs text-muted">
                  {user.name ?? user.login}
                  {shop?.tier === "PRO" && <span className="ml-1 rounded bg-accent px-1 text-[10px] font-bold text-[#1A1A1F]">PRO</span>}
                </p>
              </div>
            </div>
          </header>
          {shop && shop.status !== "APPROVED" && (
            <div className="flex flex-wrap items-center gap-2 border-b border-accent/40 bg-accent/12 px-4 py-2.5 text-sm md:px-6">
              <Clock className="h-4 w-4 text-accent" /> <span className="flex-1">{t(`status.${shop.status as "PENDING"}`)}</span>
              <Link href="/seller/onboarding" className="font-semibold text-primary hover:underline">
                {t("status.open")}
              </Link>
            </div>
          )}
          {shop?.restrictedAt && (
            <div className="flex items-center gap-2 border-b border-danger/30 bg-danger/8 px-4 py-2.5 text-sm text-danger md:px-6">
              <AlertTriangle className="h-4 w-4" /> {t("status.restricted")}
              <Link href="/seller/rating" className="ml-auto font-semibold underline">
                {t("nav.rating")}
              </Link>
            </div>
          )}
          <main id="main" className="flex-1 p-4 pt-6 md:p-6 lg:p-8">
            {live || shop ? (
              children
            ) : (
              <EmptyState
                className="card"
                icon={<Store className="h-8 w-8" />}
                title={t("noShop")}
                description={t("noShopText")}
                action={
                  <Link href="/seller/onboarding" className={buttonClasses("primary", "md")}>
                    {t("openShop")}
                  </Link>
                }
              />
            )}
          </main>
        </div>
      </div>
    </RealtimeProvider>
  );
}
