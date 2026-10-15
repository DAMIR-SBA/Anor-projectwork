import { getTranslations } from "next-intl/server";
import { ArrowLeft, CheckCircle2, Clock, EyeOff, Flag } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { reviewAnalytics } from "@/server/services/review-queries";
import { Card, PageHeader, StatCard, Table } from "@/components/ui/display";
import { ReviewTrendCharts } from "@/components/admin/review-analytics-charts";

function duration(mins: number | null) {
  if (mins == null) return "—";
  if (mins < 60) return `${mins} min`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h`;
  return `${Math.round(mins / 1440)} d`;
}

export default async function ReviewAnalyticsPage() {
  await requireStaff("reviews.moderate");
  const t = await getTranslations("moderation");
  const a = await reviewAnalytics();
  return (
    <div className="space-y-5">
      <Link href="/admin/moderation/reviews" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {t("title")}
      </Link>
      <PageHeader title={t("stats.title")} description={t("stats.subtitle")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("stats.approved")} value={a.status.APPROVED ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} />
        <StatCard label={t("stats.pending")} value={a.status.PENDING ?? 0} icon={<Clock className="h-5 w-5" />} />
        <StatCard label={t("stats.rejected")} value={(a.status.REJECTED ?? 0) + (a.status.HIDDEN ?? 0)} icon={<EyeOff className="h-5 w-5" />} />
        <StatCard label={t("stats.autoFlags")} value={a.autoFlags} icon={<Flag className="h-5 w-5" />} />
      </div>
      <ReviewTrendCharts trend={a.trend} />
      <div className="grid gap-5 2xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("stats.mostReported")}</h2>
          {a.mostReported.length ? (
            <Table head={[t("stats.product"), t("stats.rating"), t("stats.reportsCol")]}>
              {a.mostReported.map((p) => (
                <tr key={p.id}>
                  <td>
                    <a href={`/p/${p.slug}#reviews`} target="_blank" rel="noopener" className="line-clamp-1 font-semibold hover:underline">
                      {p.titleUz}
                    </a>
                    <span className="text-xs text-muted">{p.shop.name}</span>
                  </td>
                  <td className="tabular">{p.rating.toFixed(1)}</td>
                  <td className="tabular font-bold">{p.reports}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-sm text-muted">{t("stats.noData")}</p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("stats.responseTime")}</h2>
          <Table head={[t("stats.shop"), t("stats.rating"), t("stats.reviews"), t("stats.replies"), t("stats.avgResponse")]}>
            {a.shops.map((s) => (
              <tr key={s.name}>
                <td className="font-semibold">{s.name}</td>
                <td className="tabular">{s.rating.toFixed(1)}</td>
                <td className="tabular">{s.reviews}</td>
                <td className="tabular">{s.reviews ? `${Math.round((s.replies / s.reviews) * 100)}%` : "—"}</td>
                <td className="tabular">{duration(s.responseTimeMins)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}
