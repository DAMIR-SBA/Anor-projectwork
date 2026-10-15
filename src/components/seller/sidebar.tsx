"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart3, LayoutDashboard, Megaphone, Menu, MessageCircleQuestion, MessageSquareQuote, MessagesSquare, Package, Settings, ShoppingBag, Store, TicketPercent, Wallet, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { AnorLogo } from "@/components/brand/AnorLogo";
import { cn } from "@/lib/cn";

// `ready: false` items belong to the seller-cabinet phase and render as disabled entries until then.
const ITEMS = [
  { href: "/seller", key: "dashboard", icon: LayoutDashboard, ready: true },
  { href: "/seller/orders", key: "orders", icon: ShoppingBag, ready: false },
  { href: "/seller/products", key: "products", icon: Package, ready: false },
  { href: "/seller/reviews", key: "reviews", icon: MessageSquareQuote, ready: true },
  { href: "/seller/questions", key: "questions", icon: MessageCircleQuestion, ready: true },
  { href: "/seller/chats", key: "chats", icon: MessagesSquare, ready: true },
  { href: "/seller/finance", key: "finance", icon: Wallet, ready: false },
  { href: "/seller/analytics", key: "analytics", icon: BarChart3, ready: false },
  { href: "/seller/promotions", key: "promotions", icon: TicketPercent, ready: false },
  { href: "/seller/ads", key: "ads", icon: Megaphone, ready: false },
  { href: "/seller/settings", key: "settings", icon: Settings, ready: false },
] as const;

export function SellerSidebar({ badges, shop }: { badges: Record<string, number>; shop: { name: string; slug: string } | null }) {
  const t = useTranslations("seller");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-6" aria-label={t("title")}>
      {ITEMS.map((it) => {
        const active = it.href === "/seller" ? pathname === "/seller" : pathname.startsWith(it.href);
        const cls = "flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium";
        if (!it.ready)
          return (
            <span key={it.href} className={cn(cls, "cursor-not-allowed text-muted/60")} title={t("soon")} aria-disabled="true">
              <it.icon className="h-4.5 w-4.5" /> <span className="flex-1">{t(`nav.${it.key}`)}</span>
            </span>
          );
        return (
          <Link key={it.href} href={it.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn(cls, "text-fg hover:bg-surface-3", active && "bg-primary text-white hover:bg-primary")}>
            <it.icon className="h-4.5 w-4.5" /> <span className="flex-1">{t(`nav.${it.key}`)}</span>
            {badges[it.key] ? <span className={cn("rounded-full px-1.5 text-xs font-bold", active ? "bg-white text-primary" : "bg-primary text-white")}>{badges[it.key]}</span> : null}
          </Link>
        );
      })}
      {shop && (
        <Link href={`/shop/${shop.slug}`} className="mt-4 flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium text-muted hover:bg-surface-3 hover:text-fg">
          <Store className="h-4.5 w-4.5" /> {t("nav.storefront")}
        </Link>
      )}
    </nav>
  );
  const head = (
    <div className="flex h-16 items-center gap-2 px-5">
      <AnorLogo height={24} />
      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Seller</span>
    </div>
  );
  return (
    <>
      <button type="button" className="fixed left-3 top-3 z-40 rounded-[10px] bg-surface p-2 shadow lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
        <Menu className="h-5 w-5" />
      </button>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        {head}
        {nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface">
            <div className="flex items-center justify-between pr-4">
              {head}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
