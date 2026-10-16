import { getTranslations } from "next-intl/server";
import { Heart, MapPin, ShoppingCart, MessageCircle, Package } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AnorLogo } from "@/components/brand/AnorLogo";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { SearchBox } from "./search-box";
import { AccountMenu } from "./account-menu";
import { CatalogButton } from "./catalog-menu";
import { LiveBadge } from "@/components/providers/realtime";
import type { CategoryNode } from "@/server/services/categories";

type HeaderProps = {
  user: { login: string; name: string | null; avatarUrl: string | null; isPlus: boolean; hasShop: boolean } | null;
  counts: { cart: number; wishlist: number; unread: number; notifications: number };
  categories: CategoryNode[];
  topLinks: Array<{ href: string; label: string; accent?: boolean }>;
};

const BADGE = "absolute -right-2 -top-1.5 min-w-[18px] rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-[18px] text-white";

function IconLink({ href, label, count, live, children }: { href: string; label: string; count?: number; live?: "chat"; children: React.ReactNode }) {
  return (
    <Link href={href} className="relative hidden flex-col items-center gap-0.5 rounded-[12px] px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:bg-surface-3 hover:text-fg md:flex">
      <span className="relative">
        {children}
        {live ? <LiveBadge initial={count ?? 0} kind={live} className={BADGE} /> : !!count && count > 0 && <span className={BADGE}>{count > 99 ? "99+" : count}</span>}
      </span>
      {label}
    </Link>
  );
}

export async function Header({ user, counts, categories, topLinks }: HeaderProps) {
  const t = await getTranslations("nav");
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="hidden border-b border-border bg-surface-2 md:block">
        <div className="container-page flex h-9 items-center gap-5 text-[13px] font-medium text-muted">
          <Link href="/pvz" className="flex items-center gap-1 hover:text-fg">
            <MapPin className="h-3.5 w-3.5" /> {t("deliverTo")} <span className="font-bold text-fg">{t("city")}</span>
          </Link>
          {topLinks.map((l) => (
            <Link key={l.href} href={l.href} className={l.accent ? "font-bold text-brand-ink" : "hover:text-fg"}>
              {l.label}
            </Link>
          ))}
          <span className="ml-auto flex items-center gap-1">
            <Link href={user?.hasShop ? "/seller" : "/seller/onboarding"} className="hover:text-fg">
              {user?.hasShop ? t("sellerCabinet") : t("becomeSeller")}
            </Link>
            <LocaleSwitcher compact className="ml-2" />
            <ThemeToggle className="p-1.5" />
          </span>
        </div>
      </div>
      <div className="container-page flex h-16 items-center gap-3 md:h-[72px] md:gap-4">
        <Link href="/" className="shrink-0" aria-label="ANOR">
          <AnorLogo height={34} className="hidden sm:block" />
          <AnorLogo variant="symbol" height={36} className="sm:hidden" />
        </Link>
        <CatalogButton categories={categories} label={t("catalog")} />
        <div className="min-w-0 flex-1">
          <SearchBox />
        </div>
        <nav className="flex items-center gap-0.5" aria-label="Account">
          <IconLink href="/account/orders" label={t("orders")}>
            <Package className="h-6 w-6" />
          </IconLink>
          <IconLink href="/chat" label={t("chat")} count={counts.unread} live="chat">
            <MessageCircle className="h-6 w-6" />
          </IconLink>
          <IconLink href="/wishlist" label={t("favorites")} count={counts.wishlist}>
            <Heart className="h-6 w-6" />
          </IconLink>
          <IconLink href="/cart" label={t("cart")} count={counts.cart}>
            <ShoppingCart className="h-6 w-6" />
          </IconLink>
          <AccountMenu user={user} notifications={counts.notifications} />
        </nav>
      </div>
    </header>
  );
}
