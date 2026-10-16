"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Calculator } from "lucide-react";
import { LineChart } from "@/components/charts/line-chart";
import { Field, Input, Select } from "@/components/ui/form";
import { effectiveCommissionRate, logisticsFee } from "@/lib/pricing";
import { unitEconomics } from "@/lib/seller";
import { formatUZS, formatUZSCompact } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";
import { cn } from "@/lib/cn";

/** Revenue and orders as two single-axis charts (never one dual-axis chart). */
export function SalesCharts({ series }: { series: Array<{ day: string; revenue: number; orders: number }> }) {
  const t = useTranslations("sellerAnalytics");
  const locale = useLocale();
  const label = (d: string) => fmtDay(`${d}T12:00:00+05:00`, locale, { short: true });
  const table = (y: string) => ({ x: t("day"), y, show: t("table") });
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-3 font-bold">{t("revenueChart")}</h2>
        <LineChart title={t("revenueChart")} zeroBased points={series.map((p) => ({ x: p.day, y: p.revenue, label: label(p.day) }))} formatY={(v) => formatUZS(v, locale)} formatTick={(v) => formatUZSCompact(v, locale)} tableLabels={table(t("revenue"))} />
      </section>
      <section className="card p-5">
        <h2 className="mb-3 font-bold">{t("ordersChart")}</h2>
        <LineChart title={t("ordersChart")} zeroBased points={series.map((p) => ({ x: p.day, y: p.orders, label: label(p.day) }))} formatY={(v) => String(Math.round(v))} tableLabels={table(t("orders"))} />
      </section>
    </div>
  );
}

/** Compact 30-day revenue chart for the seller dashboard. */
export function RevenueChart({ series, title }: { series: Array<{ day: string; revenue: number }>; title: string }) {
  const t = useTranslations("sellerAnalytics");
  const locale = useLocale();
  const label = (d: string) => fmtDay(`${d}T12:00:00+05:00`, locale, { short: true });
  return <LineChart title={title} zeroBased height={180} points={series.map((p) => ({ x: p.day, y: p.revenue, label: label(p.day) }))} formatY={(v) => formatUZS(v, locale)} formatTick={(v) => formatUZSCompact(v, locale)} tableLabels={{ x: t("day"), y: t("revenue"), show: t("table") }} />;
}

/** "What will I earn?" calculator: commission (category × tier) and logistics fee by model and weight. */
export function CommissionCalculator({ categories, tier }: { categories: Array<{ id: string; label: string; commissionRate: number }>; tier: "BASIC" | "PRO" }) {
  const t = useTranslations("sellerAnalytics.calc");
  const locale = useLocale();
  const [v, setV] = useState({ categoryId: categories[0]?.id ?? "", price: "250000", cost: "150000", weight: "500", model: "FBS" as "FBO" | "FBS" | "DBS" });
  const cat = categories.find((c) => c.id === v.categoryId);
  const rate = cat ? effectiveCommissionRate(cat.commissionRate, tier) : 0.1;
  const e = unitEconomics({ price: Number(v.price) || 0, commissionRate: rate, logisticsFee: logisticsFee(v.model, Number(v.weight) || 0, 1), costPrice: v.cost ? Number(v.cost) : null });
  return (
    <section className="card space-y-4 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Calculator className="h-5 w-5 text-primary" /> {t("title")}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("category")} htmlFor="c-cat" className="sm:col-span-2">
          <Select id="c-cat" value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} — {Math.round(effectiveCommissionRate(c.commissionRate, tier) * 100)}%
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("price")} htmlFor="c-price">
          <Input id="c-price" inputMode="numeric" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("cost")} htmlFor="c-cost">
          <Input id="c-cost" inputMode="numeric" value={v.cost} onChange={(e) => setV({ ...v, cost: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("weight")} htmlFor="c-w">
          <Input id="c-w" inputMode="numeric" value={v.weight} onChange={(e) => setV({ ...v, weight: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("model")} htmlFor="c-model">
          <Select id="c-model" value={v.model} onChange={(e) => setV({ ...v, model: e.target.value as "FBS" })}>
            <option value="FBO">FBO</option>
            <option value="FBS">FBS</option>
            <option value="DBS">DBS</option>
          </Select>
        </Field>
      </div>
      <dl className="space-y-1.5 rounded-[12px] bg-surface-2 p-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">{t("commission", { rate: Math.round(rate * 100) })}</dt>
          <dd className="tabular">−{formatUZS(e.commission, locale)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{t("logistics")}</dt>
          <dd className="tabular">−{formatUZS(e.logistics, locale)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5 font-extrabold">
          <dt>{t("payout")}</dt>
          <dd className="tabular">{formatUZS(e.payout, locale)}</dd>
        </div>
        {e.profit !== null && (
          <div className={cn("flex justify-between font-bold", e.profit < 0 ? "text-danger" : "text-success")}>
            <dt>{t("profit", { margin: Math.round((e.margin ?? 0) * 100) })}</dt>
            <dd className="tabular">{formatUZS(e.profit, locale)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
