"use client";

import { useLocale, useTranslations } from "next-intl";
import { LineChart } from "@/components/charts/line-chart";
import { formatUZS, formatUZSCompact } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";

export function PriceHistory({ points }: { points: Array<{ price: number; at: string }> }) {
  const t = useTranslations("product");
  const tc = useTranslations("common");
  const locale = useLocale();
  if (points.length < 2) return null;
  const fmtDate = (iso: string) => fmtDay(iso, locale, { short: true });
  return (
    <LineChart
      title={t("priceHistory")}
      points={points.map((p) => ({ x: p.at, y: p.price, label: fmtDate(p.at) }))}
      formatY={(v) => formatUZS(v, locale)}
      formatTick={(v) => formatUZSCompact(v, locale)}
      minLabel={t("lowest90")}
      tableLabels={{ x: tc("date"), y: t("priceHistory"), show: tc("details") }}
      height={200}
    />
  );
}
