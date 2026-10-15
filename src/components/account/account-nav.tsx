"use client";

import { useTranslations } from "next-intl";
import { Bell, Building2, CalendarClock, Crown, Gift, KeyRound, LayoutDashboard, MapPin, MessageSquareQuote, Package, Repeat, ShieldCheck, Trophy, Undo2, User, Wallet, BellRing } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/account", key: "overview", icon: LayoutDashboard },
  { href: "/account/orders", key: "orders", icon: Package },
  { href: "/account/returns", key: "returns", icon: Undo2 },
  { href: "/account/addresses", key: "addresses", icon: MapPin },
  { href: "/account/notifications", key: "notifications", icon: Bell },
  { href: "/account/wallet", key: "wallet", icon: Wallet },
  { href: "/account/rewards", key: "rewards", icon: Trophy },
  { href: "/account/nasiya", key: "nasiya", icon: CalendarClock },
  { href: "/account/plus", key: "plus", icon: Crown },
  { href: "/account/reviews", key: "reviews", icon: MessageSquareQuote },
  { href: "/account/alerts", key: "alerts", icon: BellRing },
  { href: "/account/gift-cards", key: "giftCards", icon: Gift },
  { href: "/account/trade-in", key: "tradeIn", icon: Repeat },
  { href: "/account/business", key: "business", icon: Building2 },
  { href: "/account/profile", key: "profile", icon: User },
  { href: "/account/security", key: "security", icon: ShieldCheck },
  { href: "/account/privacy", key: "privacy", icon: KeyRound },
] as const;

export function AccountNav() {
  const t = useTranslations("account.nav");
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
      {ITEMS.map((it) => {
        const active = it.href === "/account" ? pathname === "/account" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-[12px] px-3 py-2 text-[15px] font-medium transition-colors",
              active ? "bg-primary-50 font-semibold text-primary dark:bg-primary/15" : "text-fg hover:bg-surface-3",
            )}
          >
            <it.icon className="h-4.5 w-4.5" />
            {t(it.key)}
          </Link>
        );
      })}
    </nav>
  );
}
