"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bell, CheckCheck } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { Switch } from "@/components/ui/form";
import { markNotificationsReadAction, saveNotifyPrefsAction } from "@/server/actions/wallet";
import { fmtDateTime } from "@/lib/format-date";
import { cn } from "@/lib/cn";

type N = { id: string; title: string; body: string; href: string | null; readAt: string | null; createdAt: string };

export function NotificationsView({ items, prefs }: { items: N[]; prefs: { email: boolean; sms: boolean; telegram: boolean; push: boolean } }) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-4 p-4">
        <span className="w-full text-sm font-bold">{t("settings")}</span>
        {(["email", "sms", "telegram", "push"] as const).map((k) => (
          <Switch key={k} defaultChecked={prefs[k]} label={t(`channels.${k}`)} onChange={(e) => start(async () => void (await saveNotifyPrefsAction({ ...prefs, [k]: e.target.checked })))} />
        ))}
      </div>
      {items.some((i) => !i.readAt) && (
        <Button variant="outline" size="sm" loading={pending} leftIcon={<CheckCheck className="h-4 w-4" />} onClick={() => start(async () => void (await markNotificationsReadAction({}), router.refresh()))}>
          {t("markAll")}
        </Button>
      )}
      {items.length === 0 ? (
        <EmptyState className="card" icon={<Bell className="h-8 w-8" />} title={t("empty")} />
      ) : (
        <ul className="card divide-y divide-border">
          {items.map((n) => {
            const body = (
              <div className={cn("flex gap-3 p-4", !n.readAt && "bg-primary-50/60 dark:bg-primary/5")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{n.title}</p>
                  <p className="text-sm text-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{fmtDateTime(n.createdAt, locale)}</p>
                </div>
              </div>
            );
            return <li key={n.id}>{n.href ? <Link href={n.href} onClick={() => !n.readAt && start(async () => void (await markNotificationsReadAction({ ids: [n.id] })))}>{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
