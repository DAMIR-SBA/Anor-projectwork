import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { adminPlatformSettings } from "@/server/services/admin/platform";
import { PageHeader } from "@/components/ui/display";
import { SettingsForm } from "@/components/admin/platform-tools";
import { fmtDateTime } from "@/lib/format-date";

export default async function AdminSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("settings.manage");
  const t = await getTranslations("adminSettings");
  const { settings, updatedAt, updatedBy } = await adminPlatformSettings();
  return (
    <div className="max-w-4xl">
      <PageHeader title={t("title")} description={updatedAt ? t("lastSaved", { at: fmtDateTime(updatedAt.toISOString(), locale), by: updatedBy ?? "—" }) : t("subtitle")} />
      <SettingsForm initial={settings} />
    </div>
  );
}
