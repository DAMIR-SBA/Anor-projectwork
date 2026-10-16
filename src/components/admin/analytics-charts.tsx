"use client";

import { useLocale, useTranslations } from "next-intl";
import { LineChart } from "@/components/charts/line-chart";
import { formatUZS, formatUZSCompact } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";

type Point = { day: string; gmv: number; orders: number; newUsers: number };

/** GMV, orders and sign-ups as separate single-axis charts (never one dual-axis chart). */
export function PlatformCharts({ series, only }: { series: Point[]; only?: "gmv" }) {
  const t = useTranslations("adminAnalytics");
  const locale = useLocale();
  const label = (d: string) => fmtDay(`${d}T12:00:00+05:00`, locale, { short: true });
  const table = (y: string) => ({ x: t("day"), y, show: t("table") });
  const gmv = <LineChart title={t("gmvChart")} zeroBased height={only ? 180 : 220} points={series.map((p) => ({ x: p.day, y: p.gmv, label: label(p.day) }))} formatY={(v) => formatUZS(v, locale)} formatTick={(v) => formatUZSCompact(v, locale)} tableLabels={table(t("gmv"))} />;
  if (only) return gmv;
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <section className="card min-w-0 p-5">
        <h2 className="mb-3 font-bold">{t("gmvChart")}</h2>
        {gmv}
      </section>
      <section className="card min-w-0 p-5">
        <h2 className="mb-3 font-bold">{t("ordersChart")}</h2>
        <LineChart title={t("ordersChart")} zeroBased points={series.map((p) => ({ x: p.day, y: p.orders, label: label(p.day) }))} formatY={(v) => String(Math.round(v))} tableLabels={table(t("orders"))} />
      </section>
      <section className="card min-w-0 p-5">
        <h2 className="mb-3 font-bold">{t("usersChart")}</h2>
        <LineChart title={t("usersChart")} zeroBased points={series.map((p) => ({ x: p.day, y: p.newUsers, label: label(p.day) }))} formatY={(v) => String(Math.round(v))} tableLabels={table(t("newUsers"))} />
      </section>
    </div>
  );
}
