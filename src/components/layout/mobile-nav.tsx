"use client";

import { useTranslations } from "next-intl";
import { Home, LayoutGrid, ShoppingCart, Heart, User } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/** Bottom tab bar on phones (≤ md). */
export function MobileNav({ cartCount, wishlistCount }: { cartCount: number; wishlistCount: number }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const items = [
    { href: "/", label: t("home"), icon: Home, match: (p: string) => p === "/" },
    { href: "/catalog", label: t("catalog"), icon: LayoutGrid, match: (p: string) => p.startsWith("/catalog") || p.startsWith("/c/") },
    { href: "/cart", label: t("cart"), icon: ShoppingCart, count: cartCount, match: (p: string) => p.startsWith("/cart") },
    { href: "/wishlist", label: t("favorites"), icon: Heart, count: wishlistCount, match: (p: string) => p.startsWith("/wishlist") },
    { href: "/account", label: t("account"), icon: User, match: (p: string) => p.startsWith("/account") || p.startsWith("/auth") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main">
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active = it.match(pathname);
          return (
            <li key={it.href}>
              <Link href={it.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", active ? "text-primary" : "text-muted")} aria-current={active ? "page" : undefined}>
                <span className="relative">
                  <it.icon className="h-6 w-6" />
                  {!!it.count && it.count > 0 && <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-4 text-white">{it.count}</span>}
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
