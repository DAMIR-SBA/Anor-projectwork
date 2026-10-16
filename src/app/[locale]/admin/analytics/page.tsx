import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { platformAnalytics, RANGES, type Range } from "@/server/services/admin/analytics";
import { Badge, Card, PageHeader, StatCard, Table } from "@/components/ui/display";
import { AdminTabs, BarList } from "@/components/admin/tabs";
import { PlatformCharts } from "@/components/admin/analytics-charts";
import { REGIONS } from "@/lib/delivery";
import { loc, locText } from "@/lib/localized";
import { formatUZS } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";

/** Change vs the previous period in percent; null when there is nothing to compare against. */
const trend = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : null);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default async function AdminAnalyticsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ days?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("analytics.view");
  const t = await getTranslations("adminAnalytics");
  const to = await getTranslations("orders");
  const sp = await searchParams;
  const days = (RANGES as readonly number[]).includes(Number(sp.days)) ? (Number(sp.days) as Range) : 30;
  const a = await platformAnalytics(days);
  const { cur, prev } = a.kpis;
  const money = (v: number) => formatUZS(v, locale);
  const region = (k: string) => locText(REGIONS.find((r) => r.key === k)?.[locale === "ru" ? "ru" : "uz"] ?? k, locale);
  const period = `${fmtDay(`${a.from}T12:00:00+05:00`, locale, { short: true })} – ${fmtDay(`${a.to}T12:00:00+05:00`, locale, { short: true })}`;

  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} description={t("subtitle", { period })} />
      <AdminTabs active={String(days)} tabs={RANGES.map((d) => ({ key: String(d), href: `/admin/analytics?days=${d}`, label: t("lastDays", { n: d }) }))} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("gmv")} value={money(cur.gmv)} trend={trend(cur.gmv, prev.gmv)} hint={t("vsPrev")} />
        <StatCard label={t("orders")} value={cur.orders.toLocaleString("ru-RU")} trend={trend(cur.orders, prev.orders)} hint={t("vsPrev")} />
        <StatCard label={t("aov")} value={money(cur.aov)} trend={trend(cur.aov, prev.aov)} hint={t("vsPrev")} />
        <StatCard label={t("buyers")} value={cur.buyers.toLocaleString("ru-RU")} trend={trend(cur.buyers, prev.buyers)} hint={t("vsPrev")} />
        <StatCard label={t("newUsers")} value={cur.newUsers.toLocaleString("ru-RU")} trend={trend(cur.newUsers, prev.newUsers)} hint={t("vsPrev")} />
        <StatCard label={t("visitors")} value={cur.visitors.toLocaleString("ru-RU")} trend={trend(cur.visitors, prev.visitors)} hint={t("visitorsHint")} />
        <StatCard label={t("conversion")} value={pct(cur.conversion)} hint={t("conversionHint", { prev: pct(prev.conversion) })} />
        <StatCard label={t("cancelRate")} value={pct(cur.cancelRate)} hint={t("cancelHint", { prev: pct(prev.cancelRate) })} />
      </div>
      <p className="text-[13px] text-muted">{t("definitions")}</p>

      <PlatformCharts series={a.series} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("byCategory")}</h2>
          <BarList
            empty={t("empty")}
            rows={a.categories.map((c) => ({ key: c.id, label: <Link href={`/c/${c.slug}`} className="hover:underline">{loc(c, "name", locale)}</Link>, value: c.revenue, display: money(c.revenue), sub: t("units", { n: c.units }) }))}
          />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("byRegion")}</h2>
          <BarList empty={t("empty")} rows={a.regions.map((r) => ({ key: r.region, label: region(r.region), value: r.gmv, display: money(r.gmv), sub: t("ordersN", { n: r.orders }) }))} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("byPayment")}</h2>
          <BarList empty={t("empty")} rows={a.payments.map((p) => ({ key: p.method, label: to(`paymentMethod.${p.method}`), value: p.gmv, display: money(p.gmv), sub: t("ordersN", { n: p.orders }) }))} />
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-bold">{t("topShops")}</h2>
        <Table head={["#", t("shop"), t("gmv"), t("orders"), t("aov"), t("commission"), t("rating")]} empty={!a.shops.length ? <p className="py-6 text-center text-sm text-muted">{t("empty")}</p> : null}>
          {a.shops.map((s, i) => (
            <tr key={s.id}>
              <td className="tabular text-muted">{i + 1}</td>
              <td>
                <Link href={`/admin/moderation/shops/${s.id}`} className="font-semibold hover:underline">
                  {locText(s.name, locale)}
                </Link>{" "}
                {s.tier === "PRO" && <Badge tone="accent">PRO</Badge>}
              </td>
              <td className="tabular font-semibold">{money(s.gmv)}</td>
              <td className="tabular">{s.orders}</td>
              <td className="tabular">{money(s.orders ? Math.round(s.gmv / s.orders) : 0)}</td>
              <td className="tabular">{money(s.commission)}</td>
              <td className="tabular">{s.rating ? s.rating.toFixed(1) : "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
