"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Circle,
  Menu,
  X,
  Activity,
  CalendarClock,
  ChartLine,
  Fingerprint,
  Flag,
  FolderTree,
  GalleryHorizontal,
  Gem,
  Headset,
  IdCard,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  MessageSquareQuote,
  MessagesSquare,
  Package,
  Percent,
  Radio,
  Repeat,
  Scale,
  ScrollText,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Store,
  TicketPercent,
  Truck,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { AnorLogo } from "@/components/brand/AnorLogo";
import { cn } from "@/lib/cn";
import type { AdminNavGroup } from "./nav";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity, CalendarClock, ChartLine, Fingerprint, Flag, FolderTree, GalleryHorizontal, Gem, Headset, IdCard, KeyRound, LayoutDashboard, LifeBuoy, Megaphone, MessageSquareQuote, MessagesSquare, Package, Percent, Radio, Repeat, Scale, ScrollText, Settings, ShieldAlert, ShoppingBag, Store, TicketPercent, Truck, Undo2, Users, Wallet,
};

export function AdminSidebar({ groups, badges }: { groups: AdminNavGroup[]; badges?: Record<string, number> }) {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

  const nav = (
    <nav className="flex flex-col gap-5 overflow-y-auto px-3 pb-8" aria-label="Admin">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/40">{t(`groups.${g.key}`)}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Circle;
              const active = isActive(item.href) && !(item.href === "/admin/staff" && pathname.startsWith("/admin/staff/roles"));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium text-white/75 transition-colors hover:bg-white/8 hover:text-white",
                      active && "bg-primary text-white hover:bg-primary",
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0" />
                    <span className="flex-1 truncate">{t(item.key)}</span>
                    {badges?.[item.key] ? <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-[#1A1A1F]">{badges[item.key]}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <button type="button" className="fixed left-3 top-3 z-40 rounded-[10px] bg-[#141418] p-2 text-white lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
        <Menu className="h-5 w-5" />
      </button>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-[#141418] lg:flex">
        <div className="flex h-16 items-center gap-2 px-5">
          <AnorLogo tone="white" height={26} />
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">Admin</span>
        </div>
        {nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#141418]">
            <div className="flex h-16 items-center justify-between px-5">
              <AnorLogo tone="white" height={26} />
              <button type="button" onClick={() => setOpen(false)} className="text-white/70" aria-label="Close">
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
