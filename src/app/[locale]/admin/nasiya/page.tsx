import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { nasiyaSettings } from "@/server/services/admin/finance";
import { PageHeader } from "@/components/ui/display";
import { NasiyaForm } from "@/components/admin/user-tools";

export default async function AdminNasiyaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("nasiya.manage");
  const t = await getTranslations("adminNasiya");
  const [settings, plans] = await Promise.all([nasiyaSettings(), db.installmentPlan.findMany({ orderBy: { months: "asc" } })]);
  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} description={t("subtitle")} actions={<Link href="/admin/finance?tab=installments" className="text-sm font-semibold text-primary hover:underline">{t("portfolio")} →</Link>} />
      <NasiyaForm settings={settings} plans={plans.map((p) => ({ id: p.id, months: p.months, markupPercent: p.markupPercent, minPrice: p.minPrice, maxPrice: p.maxPrice, isActive: p.isActive }))} />
    </div>
  );
}
