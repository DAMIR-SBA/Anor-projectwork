import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { Card, PageHeader } from "@/components/ui/display";
import { PushToggle } from "@/components/pwa/pwa";
import { env } from "@/server/env";
import { NotificationsView } from "@/components/account/notifications-view";
import { TelegramLinkCard } from "@/components/telegram/link-card";

export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/notifications");
  const t = await getTranslations("notifications");
  const tp = await getTranslations("pwa");
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const prefs = { email: true, sms: false, telegram: true, push: true, ...((user.notifyPrefs as object | null) ?? {}) };
  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} />
      <TelegramLinkCard linked={!!user.telegramId} username={user.telegramUsername} />
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-bold">{tp("pushTitle")}</p>
          <p className="text-sm text-muted">{tp("pushText")}</p>
        </div>
        <PushToggle vapidKey={env().VAPID_PUBLIC_KEY ?? null} />
      </Card>
      <NotificationsView items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))} prefs={prefs as { email: boolean; sms: boolean; telegram: boolean; push: boolean }} />
    </div>
  );
}
