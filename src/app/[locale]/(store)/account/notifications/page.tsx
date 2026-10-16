import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/display";
import { NotificationsView } from "@/components/account/notifications-view";
import { TelegramLinkCard } from "@/components/telegram/link-card";

export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/notifications");
  const t = await getTranslations("notifications");
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const prefs = { email: true, sms: false, telegram: true, push: true, ...((user.notifyPrefs as object | null) ?? {}) };
  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} />
      <TelegramLinkCard linked={!!user.telegramId} username={user.telegramUsername} />
      <NotificationsView items={items.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))} prefs={prefs as { email: boolean; sms: boolean; telegram: boolean; push: boolean }} />
    </div>
  );
}
