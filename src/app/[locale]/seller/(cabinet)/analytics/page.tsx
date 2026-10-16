import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { sellerAnalytics, skuEconomics } from "@/server/services/seller/analytics";
import { categoryOptions } from "@/server/services/seller/products";
import { Card, PageHeader } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { CommissionCalculator, SalesCharts } from "@/components/seller/analytics-views";
import { formatUZS } from "@/lib/money";
import { locText } from "@/lib/localized";
import { cn } from "@/lib/cn";

const RANGES = [7, 30, 90] as const;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default async function SellerAnalyticsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ days?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/analytics");
  const t = await getTranslations("sellerAnalytics");
  const sp = await searchParams;
  const days = RANGES.find((d) => String(d) === sp.days) ?? 30;
  const [a, sku, cats] = await Promise.all([sellerAnalytics(shop.id, days), skuEconomics(shop.id, days), categoryOptions(locale)]);
  const fmt = (v: number) => formatUZS(v, locale);
  const tiles: Array<[string, string, number | null]> = [
    [t("revenue"), fmt(a.kpi.revenue.value), a.kpi.revenue.delta],
    [t("orders"), String(a.kpi.orders.value), a.kpi.orders.delta],
    [t("aov"), fmt(a.kpi.aov.value), a.kpi.aov.delta],
    [t("units"), String(a.kpi.units.value), a.kpi.units.delta],
    [t("views"), String(a.kpi.views.value), a.kpi.views.delta],
    [t("conversion"), pct(a.kpi.conversion.value), a.kpi.conversion.delta],
    [t("cancelRate"), pct(a.kpi.cancelRate.value), null],
    [t("returnRate"), pct(a.kpi.returnRate.value), null],
  ];
  return (
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-[12px] border border-border bg-surface p-0.5" role="group" aria-label={t("period")}>
              {RANGES.map((d) => (
                <Link key={d} href={`/seller/analytics?days=${d}`} aria-current={d === days ? "true" : undefined} className={cn("rounded-[10px] px-3 py-1.5 text-sm font-semibold", d === days ? "bg-primary text-white" : "text-muted hover:text-fg")}>
                  {t("days", { n: d })}
                </Link>
              ))}
            </div>
            <a href={`/api/seller/analytics/export?days=${days}`} className={buttonClasses("outline", "sm")}>
              <Download className="h-4 w-4" /> Excel
            </a>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, delta]) => (
          <Card key={label} className="p-4">
            <p className="text-[13px] text-muted">{label}</p>
            <p className="tabular mt-1 text-xl font-extrabold">{value}</p>
            {delta !== null && Number.isFinite(delta) && (
              <p className={cn("mt-0.5 flex items-center gap-1 text-[12px] font-semibold", delta >= 0 ? "text-success" : "text-danger")}>
                {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />} {delta >= 0 ? "+" : ""}
                {(delta * 100).toFixed(0)}% <span className="font-normal text-muted">{t("vsPrev")}</span>
              </p>
            )}
          </Card>
        ))}
      </div>
      <SalesCharts series={a.series} />
      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="overflow-x-auto p-5">
          <h2 className="mb-3 font-bold">{t("topProducts")}</h2>
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2">{t("product")}</th>
                <th className="pb-2 text-right">{t("units")}</th>
                <th className="pb-2 text-right">{t("revenue")}</th>
                <th className="pb-2 text-right">{t("views")}</th>
                <th className="pb-2 text-right">{t("conversion")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {a.top.map((p) => (
                <tr key={p.productId}>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[8px] bg-surface-2">{p.image && <Image src={p.image} alt="" fill sizes="36px" className="object-cover" />}</span>
                      <span className="line-clamp-1">{locText(p.title, locale)}</span>
                    </span>
                  </td>
                  <td className="tabular text-right">{p.units}</td>
                  <td className="tabular text-right font-semibold">{fmt(p.revenue)}</td>
                  <td className="tabular text-right">{p.views}</td>
                  <td className="tabular text-right">{pct(p.conversion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!a.top.length && <p className="py-6 text-center text-muted">{t("noData")}</p>}
        </Card>
        <CommissionCalculator categories={cats.map((c) => ({ ...c, label: locText(c.label, locale) }))} tier={shop.tier} />
      </div>
      <Card className="overflow-x-auto p-5">
        <h2 className="mb-1 font-bold">{t("economics")}</h2>
        <p className="mb-3 text-sm text-muted">{t("economicsHint")}</p>
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2">SKU</th>
              <th className="pb-2 text-right">{t("units")}</th>
              <th className="pb-2 text-right">{t("avgPrice")}</th>
              <th className="pb-2 text-right">{t("commission")}</th>
              <th className="pb-2 text-right">{t("logistics")}</th>
              <th className="pb-2 text-right">{t("ads")}</th>
              <th className="pb-2 text-right">{t("returnsCost")}</th>
              <th className="pb-2 text-right">{t("payout")}</th>
              <th className="pb-2 text-right">{t("profit")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sku.map((s) => (
              <tr key={s.sku}>
                <td className="py-2">
                  <span className="font-mono text-xs">{s.sku}</span>
                  <span className="block max-w-56 truncate text-xs text-muted">{s.title}</span>
                </td>
                <td className="tabular text-right">{s.units}</td>
                <td className="tabular text-right">{fmt(s.price)}</td>
                <td className="tabular text-right">−{fmt(s.commission)}</td>
                <td className="tabular text-right">−{fmt(s.logistics)}</td>
                <td className="tabular text-right">{s.ads ? `−${fmt(s.ads)}` : "—"}</td>
                <td className="tabular text-right">{s.returnsCost ? `−${fmt(s.returnsCost)}` : "—"}</td>
                <td className="tabular text-right font-bold">{fmt(s.payout)}</td>
                <td className={cn("tabular text-right font-bold", s.profit === null ? "text-muted" : s.profit < 0 ? "text-danger" : "text-success")}>{s.profit === null ? t("noCost") : `${fmt(s.profit)} · ${Math.round((s.margin ?? 0) * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sku.length && <p className="py-6 text-center text-muted">{t("noData")}</p>}
      </Card>
    </div>
  );
}
