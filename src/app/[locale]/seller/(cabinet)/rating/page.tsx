import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, Ban, CheckCircle2, PackageX, RotateCcw, Star, Timer } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { ratingOverview } from "@/server/services/seller/rating";
import { Badge, Card, PageHeader, ProgressBar } from "@/components/ui/display";
import { formatUZS } from "@/lib/money";
import { fmtDateTime, fmtDay } from "@/lib/format-date";
import { cn } from "@/lib/cn";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const LEVEL_TONE = { excellent: "success", good: "success", warning: "accent", restricted: "danger" } as const;

export default async function SellerRatingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/rating");
  const t = await getTranslations("sellerRating");
  const r = await ratingOverview(shop.id);
  const m = r.measures;
  const components = [
    { key: "sla", icon: Timer, value: `${m.slaCompliance.toFixed(0)}%`, detail: m.handovers ? t("slaDetail", { onTime: m.onTime, total: m.handovers }) : t("noHandovers") },
    { key: "reviews", icon: Star, value: m.reviewCount ? `${m.rating.toFixed(2)} ★` : "—", detail: m.reviewCount ? t("reviewsDetail", { count: m.reviewCount }) : t("noReviews") },
    { key: "cancellations", icon: PackageX, value: pct(m.cancellationRate), detail: t("cancelDetail", { n: m.sellerCancels, total: m.orders }) },
    { key: "returns", icon: RotateCcw, value: pct(m.returnRate), detail: t("returnDetail", { n: m.returns, total: m.orders }) },
  ] as const;
  const zones = [
    { key: "restricted", from: 0, to: r.thresholds.restrict, cls: "bg-danger/25" },
    { key: "warning", from: r.thresholds.restrict, to: r.thresholds.warning, cls: "bg-accent/35" },
    { key: "good", from: r.thresholds.warning, to: 100, cls: "bg-success/25" },
  ] as const;
  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {r.restrictedAt && (
        <div role="alert" className="flex gap-3 rounded-[16px] border border-danger/30 bg-danger/5 p-4">
          <Ban className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="text-sm">
            <p className="font-bold text-danger">{t("restrictedTitle", { date: fmtDay(r.restrictedAt, locale) })}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>{t("restrictions.ads")}</li>
              <li>{t("restrictions.ranking")}</li>
              <li>{t("restrictions.campaigns")}</li>
            </ul>
            <p className="mt-1 text-muted">{t("restrictedHow", { n: r.thresholds.restrict })}</p>
          </div>
        </div>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="text-sm text-muted">{t("score")}</p>
            <p className="tabular text-5xl font-extrabold tracking-tight">{r.score.toFixed(1)}</p>
          </div>
          <div className="pb-1.5">
            <Badge tone={LEVEL_TONE[r.level]}>{t(`levels.${r.level}`)}</Badge>
            <p className="mt-1 max-w-md text-sm text-muted">{t(`levelHint.${r.level}`)}</p>
          </div>
          <p className="ml-auto pb-1.5 text-[13px] text-muted">{t("period")}</p>
        </div>
        {/* Scale with labelled zones; the marker shows the current score. */}
        <div className="relative mt-5" aria-hidden>
          <div className="flex h-3 overflow-hidden rounded-full">
            {zones.map((z) => (
              <span key={z.key} className={cn("h-full", z.cls)} style={{ width: `${z.to - z.from}%` }} />
            ))}
          </div>
          <span className="absolute -top-1.5 h-6 w-1.5 -translate-x-1/2 rounded-full bg-fg ring-2 ring-surface" style={{ left: `${Math.max(0, Math.min(100, r.score))}%` }} />
          <div className="mt-1.5 flex text-[12px] text-muted">
            {zones.map((z) => (
              <span key={z.key} style={{ width: `${z.to - z.from}%` }} className="truncate">
                {z.from}–{z.to} · {t(`zones.${z.key}`)}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {components.map((c) => {
          const part = r.parts[c.key];
          return (
            <Card key={c.key} className="flex flex-col p-4">
              <div className="flex items-center justify-between text-sm text-muted">
                <span className="font-semibold text-fg">{t(`components.${c.key}`)}</span>
                <c.icon className="h-4 w-4" />
              </div>
              <p className="tabular mt-1 text-2xl font-extrabold">{c.value}</p>
              <p className="text-[13px] text-muted">{c.detail}</p>
              <div className="mt-3 flex items-center gap-2">
                <ProgressBar value={part} tone={part >= 80 ? "success" : part >= 65 ? "accent" : "primary"} />
                <span className="tabular w-10 text-right text-[13px] font-semibold">{Math.round(part)}</span>
              </div>
              <p className="mt-1 text-[12px] text-muted">{t("weight", { n: Math.round(r.weights[c.key] * 100) })}</p>
              <p className="mt-2 text-[13px]">{t(`tips.${c.key}`)}</p>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-bold">{t("warnings")}</h2>
          <ul className="mt-3 space-y-2">
            {r.warnings.map((w) => (
              <li key={w.id} className="flex gap-2.5 text-sm">
                {w.resolvedAt ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                <div>
                  <p className="font-semibold">
                    {t.has(`warningTypes.${w.type}`) ? t(`warningTypes.${w.type}`) : w.type} <span className="font-normal text-muted">· {w.resolvedAt ? t("resolved") : t("open")}</span>
                  </p>
                  <p className="text-[13px] text-muted">{fmtDateTime(w.createdAt, locale)}</p>
                </div>
              </li>
            ))}
            {r.warnings.length === 0 && <li className="text-sm text-muted">{t("noWarnings")}</li>}
          </ul>
        </Card>
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-bold">{t("penalties")}</h2>
            <p className="tabular text-sm font-semibold">{t("penaltiesTotal", { amount: formatUZS(r.penaltiesTotal, locale) })}</p>
          </div>
          <ul className="mt-3 divide-y divide-border text-sm">
            {r.penalties.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.has(`penaltyTypes.${p.type}`) ? t(`penaltyTypes.${p.type}`) : p.type}</p>
                  <p className="text-[13px] text-muted">
                    {fmtDateTime(p.createdAt, locale)}
                    {p.order && (
                      <>
                        {" · "}
                        <Link href={`/seller/orders/${p.order.id}`} className="underline">
                          №{p.order.number}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <span className="tabular font-bold text-danger">−{formatUZS(p.amount, locale)}</span>
              </li>
            ))}
            {r.penalties.length === 0 && <li className="py-2 text-muted">{t("noPenalties")}</li>}
          </ul>
        </Card>
      </div>

      <Card className="p-5 text-sm">
        <h2 className="font-bold">{t("how")}</h2>
        <p className="mt-1 text-muted">{t("howText", { warning: r.thresholds.warning, restrict: r.thresholds.restrict })}</p>
      </Card>
    </div>
  );
}
