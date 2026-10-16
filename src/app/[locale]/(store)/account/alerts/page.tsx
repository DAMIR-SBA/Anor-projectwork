import { getTranslations, setRequestLocale } from "next-intl/server";
import { BellRing, TrendingDown } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { cardsByIds } from "@/server/services/catalog";
import { PageHeader } from "@/components/ui/display";
import { ProductCard } from "@/components/product/product-card";

export default async function AlertsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/alerts");
  const t = await getTranslations("privacy");
  const alerts = await db.productAlert.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const cards = await cardsByIds([...new Set(alerts.map((a) => a.productId))], locale);
  return (
    <div className="space-y-5">
      <PageHeader title={t("alertsTitle")} description={t("alertsSubtitle")} />
      {alerts.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {alerts.map((a) => {
            const p = cards.find((c) => c.id === a.productId);
            if (!p) return null;
            return (
              <li key={a.id} className="space-y-1">
                <ProductCard p={p} />
                <p className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted">
                  {a.type === "PRICE_DROP" ? <TrendingDown className="h-3.5 w-3.5 text-success" /> : <BellRing className="h-3.5 w-3.5 text-primary" />}
                  {t(`alertTypes.${a.type}`)}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="card p-8 text-center text-muted">{t("alertsEmpty")}</p>
      )}
    </div>
  );
}
