import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { Card, PageHeader } from "@/components/ui/display";
import { ProfileForm } from "@/components/privacy/privacy-tools";

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/profile");
  const t = await getTranslations("privacy");
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { login: true, name: true, email: true, avatarUrl: true, locale: true, marketingConsent: true } });
  return (
    <div className="space-y-5">
      <PageHeader title={t("profileTitle")} description={t("profileSubtitle")} />
      <Card className="p-5">
        <ProfileForm initial={{ login: u.login, name: u.name ?? "", email: u.email ?? "", avatarUrl: u.avatarUrl, locale: (["uz", "uz-Cyrl", "ru"].includes(u.locale) ? u.locale : "uz") as "uz", marketing: u.marketingConsent }} />
      </Card>
    </div>
  );
}
