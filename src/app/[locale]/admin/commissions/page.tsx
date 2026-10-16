import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { adminCategories } from "@/server/services/admin/categories";
import { Card, PageHeader } from "@/components/ui/display";
import { CommissionTable } from "@/components/admin/category-manager";
import { logisticsFee } from "@/lib/pricing";
import { formatUZS } from "@/lib/money";

export default async function AdminCommissionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("commissions.manage");
  const t = await getTranslations("adminCategories");
  const rows = await adminCategories();
  return (
    <div className="space-y-5">
      <PageHeader title={t("commissionsTitle")} description={t("commissionsSubtitle")} />
      <Card className="p-4 text-sm">
        <p className="font-semibold">{t("logisticsTitle")}</p>
        <p className="mt-1 text-muted">{t("logisticsText", { fbo: formatUZS(logisticsFee("FBO", 500, 1), locale), fbs: formatUZS(logisticsFee("FBS", 500, 1), locale), heavy: formatUZS(logisticsFee("FBS", 2000, 1) - logisticsFee("FBS", 1000, 1), locale) })}</p>
      </Card>
      <CommissionTable rows={rows} canEdit={staff.permissions.has("commissions.manage")} />
    </div>
  );
}
