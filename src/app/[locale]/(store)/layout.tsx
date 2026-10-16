import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getHeaderData } from "@/server/services/header-data";
import { ShopStateProvider } from "@/components/providers/shop-state";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { RealtimeProvider } from "@/components/providers/realtime";
import { PlatformBars } from "@/components/layout/platform-bars";

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("nav");
  const tc = await getTranslations("common");
  const data = await getHeaderData();
  const user = await getCurrentUser();
  const liked = user ? await db.wishlistItem.findMany({ where: { wishlist: { userId: user.id } }, select: { productId: true }, take: 1000 }) : [];
  const topLinks = [
    { href: "/deals", label: t("deals"), accent: true },
    { href: "/made-in-uzbekistan", label: t("madeInUz") },
    { href: "/nasiya", label: t("nasiya") },
    { href: "/plus", label: t("plus") },
    { href: "/videos", label: t("videos") },
    { href: "/assistant", label: t("assistant") },
    { href: "/help", label: t("help") },
  ];
  return (
    <RealtimeProvider enabled={!!user} driver={env().REALTIME_DRIVER}>
      <ShopStateProvider likedIds={liked.map((l) => l.productId)} signedIn={!!user}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white">
          {tc("skipToContent")}
        </a>
        <PlatformBars locale={locale} />
        <Header user={data.user} counts={data.counts} categories={data.categories} topLinks={topLinks} />
        <main id="main" className="min-h-[60vh]">
          {children}
        </main>
        <Footer />
        <MobileNav cartCount={data.counts.cart} wishlistCount={data.counts.wishlist} />
      </ShopStateProvider>
    </RealtimeProvider>
  );
}
