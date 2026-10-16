"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Scale,
  BarChart3,
  Boxes,
  Code2,
  GraduationCap,
  Gauge,
  LayoutDashboard,
  Megaphone,
  Menu,
  MessageCircleQuestion,
  MessageSquareQuote,
  MessagesSquare,
  Package,
  Settings,
  ShoppingBag,
  Store,
  TicketPercent,
  Undo2,
  Wallet,
  X,
} from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { AnorLogo } from "@/components/brand/AnorLogo";
import { switchShopAction } from "@/server/actions/seller-onboarding";
import { cn } from "@/lib/cn";

const GROUPS = [
  {
    key: "sales",
    items: [
      { href: "/seller", key: "dashboard", icon: LayoutDashboard },
      { href: "/seller/orders", key: "orders", icon: ShoppingBag },
      { href: "/seller/returns", key: "returns", icon: Undo2 },
      { href: "/seller/chats", key: "chats", icon: MessagesSquare },
      { href: "/seller/reviews", key: "reviews", icon: MessageSquareQuote },
      { href: "/seller/questions", key: "questions", icon: MessageCircleQuestion },
    ],
  },
  {
    key: "catalog",
    items: [
      { href: "/seller/products", key: "products", icon: Package },
      { href: "/seller/stock", key: "stock", icon: Boxes },
      { href: "/seller/promotions", key: "promotions", icon: TicketPercent },
      { href: "/seller/ads", key: "ads", icon: Megaphone },
    ],
  },
  {
    key: "money",
    items: [
      { href: "/seller/analytics", key: "analytics", icon: BarChart3 },
      { href: "/seller/finance", key: "finance", icon: Wallet },
      { href: "/seller/rating", key: "rating", icon: Gauge },
      { href: "/seller/competitors", key: "competitors", icon: Scale },
    ],
  },
  {
    key: "grow",
    items: [
      { href: "/seller/academy", key: "academy", icon: GraduationCap },
      { href: "/seller/api", key: "api", icon: Code2 },
      { href: "/seller/settings", key: "settings", icon: Settings },
    ],
  },
] as const;

type ShopOption = { id: string; name: string; slug: string };

export function SellerSidebar({ badges, shop, shops }: { badges: Record<string, number>; shop: ShopOption | null; shops: ShopOption[] }) {
  const t = useTranslations("seller");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const nav = (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-6" aria-label={t("title")}>
      {shops.length > 1 && shop && (
        <label className="block px-1">
          <span className="sr-only">{t("switchShop")}</span>
          <select
            value={shop.id}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                await switchShopAction({ shopId: e.target.value });
                router.refresh();
              })
            }
            className="h-9 w-full rounded-[10px] border border-border bg-surface-2 px-2 text-sm font-semibold"
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {GROUPS.map((g) => (
        <div key={g.key}>
          <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted">{t(`groups.${g.key}`)}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = it.href === "/seller" ? pathname === "/seller" : pathname.startsWith(it.href);
              return (
                <li key={it.href}>
                  <Link href={it.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium text-fg hover:bg-surface-3", active && "bg-primary text-white hover:bg-primary")}>
                    <it.icon className="h-4.5 w-4.5" /> <span className="flex-1">{t(`nav.${it.key}`)}</span>
                    {badges[it.key] ? <span className={cn("rounded-full px-1.5 text-xs font-bold", active ? "bg-white text-primary" : "bg-primary text-white")}>{badges[it.key]}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {shop && (
        <Link href={`/shop/${shop.slug}`} className="flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium text-muted hover:bg-surface-3 hover:text-fg">
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
      <button type="button" className="fixed left-3 top-3 z-40 rounded-[10px] bg-surface p-2 shadow lg:hidden" onClick={() => setOpen(true)} aria-label={t("menu")}>
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
              <button type="button" onClick={() => setOpen(false)} aria-label={t("close")}>
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
