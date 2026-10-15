"use client";

import { useLocale, useTranslations } from "next-intl";
import { LineChart } from "@/components/charts/line-chart";
import { fmtDay } from "@/lib/format-date";

/** Two single-series charts (no dual axis): weekly average rating and weekly review volume. */
export function ReviewTrendCharts({ trend }: { trend: Array<{ week: string; avg: number; count: number }> }) {
  const t = useTranslations("moderation.stats");
  const locale = useLocale();
  // Weeks with only a couple of reviews swing the average wildly; keep them out of the rating line.
  const rated = trend.filter((p) => p.count >= 3);
  if (trend.length < 2) return <p className="py-8 text-center text-sm text-muted">{t("noData")}</p>;
  const label = (w: string) => fmtDay(w, locale, { short: true });
  const table = (y: string) => ({ x: t("week"), y, show: t("table") });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-3 font-bold">{t("trend")}</h2>
        <LineChart title={t("trend")} points={rated.map((p) => ({ x: p.week, y: Math.round(p.avg * 100) / 100, label: label(p.week) }))} formatY={(v) => `${v.toFixed(2)} ★`} formatTick={(v) => v.toFixed(1)} tableLabels={table(t("avgRating"))} />
      </section>
      <section className="card p-5">
        <h2 className="mb-3 font-bold">{t("volume")}</h2>
        <LineChart title={t("volume")} zeroBased points={trend.map((p) => ({ x: p.week, y: p.count, label: label(p.week) }))} formatY={(v) => String(Math.round(v))} tableLabels={table(t("reviews"))} />
      </section>
    </div>
  );
}
