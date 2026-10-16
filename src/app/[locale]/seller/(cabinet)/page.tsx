import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, CalendarClock, Gauge, ShoppingBag, Star, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireSeller } from "@/server/auth/guards";
import { sellerDashboard } from "@/server/services/seller/dashboard";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { RevenueChart } from "@/components/seller/analytics-views";
import { formatUZS } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";
import { scoreLevel } from "@/lib/seller";
import { cn } from "@/lib/cn";

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <p className={cn("mt-0.5 flex items-center gap-1 text-[12px] font-semibold", up ? "text-success" : "text-danger")}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />} {up ? "+" : ""}
      {(value * 100).toFixed(0)}% <span className="font-normal text-muted">{label}</span>
    </p>
  );
}

export default async function SellerHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireSeller();
  const t = await getTranslations("sellerDashboard");
  if (!shop) return null;
  const d = await sellerDashboard(shop.id);
  const fmt = (v: number) => formatUZS(v, locale);
  const level = scoreLevel(d.kpi.score);
  return (
    <div className="space-y-5">
      <PageHeader
        title={shop.name}
        description={t("subtitle")}
        actions={
          <Link href="/seller/products/new" className={buttonClasses("primary")}>
            {t("addProduct")}
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="p-4">
          <p className="flex items-center justify-between text-[13px] text-muted">
            {t("revenue7")} <Wallet className="h-4 w-4" />
          </p>
          <p className="tabular mt-1 text-xl font-extrabold">{fmt(d.kpi.revenue.value)}</p>
          <Delta value={d.kpi.revenue.delta} label={t("vsPrevWeek")} />
        </Card>
        <Card className="p-4">
          <p className="flex items-center justify-between text-[13px] text-muted">
            {t("orders7")} <ShoppingBag className="h-4 w-4" />
          </p>
          <p className="tabular mt-1 text-xl font-extrabold">{d.kpi.orders.value}</p>
          <Delta value={d.kpi.orders.delta} label={t("vsPrevWeek")} />
        </Card>
        <Link href="/seller/rating" className="card block p-4 hover:ring-2 hover:ring-primary/30">
          <p className="flex items-center justify-between text-[13px] text-muted">
            {t("score")} <Gauge className="h-4 w-4" />
          </p>
          <p className="tabular mt-1 text-xl font-extrabold">{d.kpi.score.toFixed(1)}</p>
          <Badge tone={level === "restricted" ? "danger" : level === "warning" ? "accent" : "success"} className="mt-1">
            {t(`levels.${level}`)}
          </Badge>
        </Link>
        <Link href="/seller/reviews" className="card block p-4 hover:ring-2 hover:ring-primary/30">
          <p className="flex items-center justify-between text-[13px] text-muted">
            {t("rating")} <Star className="h-4 w-4" />
          </p>
          <p className="tabular mt-1 text-xl font-extrabold">{d.kpi.reviewCount ? d.kpi.rating.toFixed(2) : "—"}</p>
          <p className="mt-0.5 text-[12px] text-muted">{t("reviewsCount", { count: d.kpi.reviewCount })}</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">{t("revenue30")}</h2>
              <Link href="/seller/analytics" className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                {t("analytics")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <RevenueChart series={d.series} title={t("revenue30")} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("top")}</h2>
            <ul className="divide-y divide-border">
              {d.top.map((p) => (
                <li key={p.productId} className="flex items-center gap-3 py-2 text-sm">
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[8px] bg-surface-2">{p.image && <Image src={p.image} alt="" fill sizes="40px" className="object-cover" />}</span>
                  <Link href={`/seller/products/${p.productId}`} className="line-clamp-2 min-w-0 flex-1 font-semibold hover:underline">
                    {p.title}
                  </Link>
                  <span className="hidden shrink-0 text-muted sm:inline">{t("units", { count: p.units })}</span>
                  <b className="tabular shrink-0 text-right sm:w-32">{fmt(p.revenue)}</b>
                </li>
              ))}
              {d.top.length === 0 && <li className="py-2 text-sm text-muted">{t("noSales")}</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-2 font-bold">{t("todo")}</h2>
            <ul className="space-y-1">
              {d.todo.map((x) => (
                <li key={x.key}>
                  <Link href={x.href} className="flex items-center gap-2 rounded-[10px] px-2 py-2 text-sm hover:bg-surface-2">
                    <span className="flex-1">{t(`todoItems.${x.key}`)}</span>
                    <Badge tone={x.tone}>{x.count}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted" />
                  </Link>
                </li>
              ))}
              {d.todo.length === 0 && <li className="px-2 py-2 text-sm text-muted">{t("allDone")}</li>}
            </ul>
          </Card>
          <Link href="/seller/finance" className="card block p-5 hover:ring-2 hover:ring-primary/30">
            <h2 className="flex items-center gap-2 font-bold">
              <CalendarClock className="h-5 w-5 text-primary" /> {t("payout")}
            </h2>
            <p className="tabular mt-2 text-2xl font-extrabold">{fmt(d.payout.estimate)}</p>
            <p className="text-[13px] text-muted">{t("payoutHint", { date: fmtDay(d.payout.nextAt, locale) })}</p>
            {d.payout.estimate < 0 && <p className="mt-1 text-[13px] text-danger">{t("negativeHint")}</p>}
            {d.payout.pending > 0 && <p className="mt-1 text-[13px]">{t("pendingPayouts", { amount: fmt(d.payout.pending) })}</p>}
          </Link>
          {d.tier === "BASIC" && (
            <Link href="/seller/academy" className="block rounded-[16px] border border-accent/40 bg-accent/10 p-4 text-sm hover:bg-accent/15">
              <p className="font-bold">{t("proTitle")}</p>
              <p className="mt-0.5 text-muted">{t("proText")}</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
