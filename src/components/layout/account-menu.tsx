"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, ChevronDown, LogOut, Package, Settings, Shield, Store, User, Wallet, Gift, MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Avatar, Badge } from "@/components/ui/display";
import { logoutAction } from "@/server/actions/auth";
import { clearOfflineCache } from "@/components/pwa/pwa";

type Props = { user: { login: string; name: string | null; avatarUrl: string | null; isPlus: boolean; hasShop: boolean } | null; notifications: number };

export function AccountMenu({ user, notifications }: Props) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!user) {
    return (
      <Link href="/auth/login" aria-label={t("login")} className="ml-1 inline-flex h-10 items-center gap-2 rounded-[12px] bg-primary px-4 text-sm font-bold text-white hover:bg-primary-dark">
        <User className="h-4.5 w-4.5" />
        <span className="hidden sm:inline">{t("login")}</span>
      </Link>
    );
  }

  const items = [
    { href: "/account", icon: User, label: t("account") },
    { href: "/account/orders", icon: Package, label: t("orders") },
    { href: "/account/notifications", icon: Bell, label: t("notifications"), count: notifications },
    { href: "/chat", icon: MessageCircle, label: t("chat") },
    { href: "/account/wallet", icon: Wallet, label: t("wallet") },
    { href: "/account/rewards", icon: Gift, label: "Bonus" },
    { href: "/account/security", icon: Shield, label: "Security" },
    { href: "/account/profile", icon: Settings, label: "Profile" },
  ];

  return (
    <div ref={ref} className="relative ml-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-[12px] p-1 pr-2 hover:bg-surface-3" aria-expanded={open} aria-haspopup="menu" aria-label={t("account")}>
        <span className="relative">
          <Avatar name={user.name ?? user.login} src={user.avatarUrl} size={36} />
          {notifications > 0 && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-primary" />}
        </span>
        <ChevronDown className="hidden h-4 w-4 text-muted sm:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 animate-[slide-up_0.15s_ease-out] overflow-hidden rounded-[16px] border border-border bg-surface shadow-[var(--shadow-lift)]">
          <div className="border-b border-border p-4">
            <p className="truncate font-bold">{user.name ?? user.login}</p>
            <p className="flex items-center gap-2 text-sm text-muted">
              @{user.login} {user.isPlus && <Badge tone="accent">PLUS</Badge>}
            </p>
          </div>
          <ul className="p-1.5">
            {items.map((it) => (
              <li key={it.href}>
                <Link href={it.href} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium hover:bg-surface-2">
                  <it.icon className="h-4.5 w-4.5 text-muted" />
                  <span className="flex-1">{it.label}</span>
                  {!!it.count && <span className="rounded-full bg-primary px-1.5 text-xs font-bold text-white">{it.count}</span>}
                </Link>
              </li>
            ))}
            <li>
              <Link href={user.hasShop ? "/seller" : "/seller/onboarding"} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium hover:bg-surface-2">
                <Store className="h-4.5 w-4.5 text-muted" />
                {user.hasShop ? t("sellerCabinet") : t("becomeSeller")}
              </Link>
            </li>
          </ul>
          <form action={logoutAction} onSubmit={clearOfflineCache} className="border-t border-border p-1.5">
            <button type="submit" role="menuitem" className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10">
              <LogOut className="h-4.5 w-4.5" /> {t("logout")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
