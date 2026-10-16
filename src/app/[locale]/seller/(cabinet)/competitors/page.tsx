import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Crown, Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { competitorPrices } from "@/server/services/seller/competitors";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { MatchPriceButton } from "@/components/seller/match-price";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";

const TONE = { cheapest: "success", competitive: "info", expensive: "danger", alone: "neutral" } as const;
const PAGE = 20;

export default async function CompetitorsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string; filter?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/competitors");
  const t = await getTranslations("sellerCompetitors");
  if (shop.tier !== "PRO")
    return (
      <div>
        <PageHeader title={t("title")} description={t("subtitle")} />
        <EmptyState
          className="card"
          icon={<Crown className="h-8 w-8 text-accent" />}
          title={t("proOnlyTitle")}
          description={t("proOnlyText")}
          action={
            <Link href="/seller/academy" className={buttonClasses("accent")}>
              {t("goPro")}
            </Link>
          }
        />
      </div>
    );
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const onlyExpensive = sp.filter === "expensive";
  const data = await competitorPrices(shop.id, locale, { page, onlyExpensive }, PAGE);
  const fmt = (v: number) => formatUZS(v, locale);
  return (
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className="flex rounded-[12px] border border-border bg-surface p-0.5 text-sm font-semibold">
            <Link href="/seller/competitors" aria-current={!onlyExpensive ? "true" : undefined} className={cn("rounded-[10px] px-3 py-1.5", !onlyExpensive ? "bg-primary text-white" : "text-muted")}>
              {t("all")}
            </Link>
            <Link href="/seller/competitors?filter=expensive" aria-current={onlyExpensive ? "true" : undefined} className={cn("rounded-[10px] px-3 py-1.5", onlyExpensive ? "bg-primary text-white" : "text-muted")}>
              {t("onlyExpensive")}
            </Link>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["cheapest", "competitive", "expensive", "alone"] as const).map((k) => (
          <Card key={k} className="p-4">
            <p className="text-[13px] text-muted">{t(`status.${k}`)}</p>
            <p className="tabular mt-1 text-2xl font-extrabold">{data.summary[k]}</p>
          </Card>
        ))}
      </div>
      <ul className="space-y-3">
        {data.rows.map((r) => (
          <li key={r.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{r.image && <Image src={r.image} alt="" fill sizes="48px" className="object-cover" />}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/seller/products/${r.id}`} className="line-clamp-1 font-semibold hover:underline">
                  {r.title}
                </Link>
                <p className="text-[13px] text-muted">
                  {t("yourPrice")}: <b className="tabular text-fg">{fmt(r.price)}</b>
                  {r.position.min !== null && (
                    <>
                      {" · "}
                      {t("min")}: <b className="tabular text-fg">{fmt(r.position.min)}</b> · {t("median")}: <span className="tabular">{fmt(r.position.median!)}</span> · {t("rank", { rank: r.position.rank, count: r.position.count })}
                    </>
                  )}
                </p>
              </div>
              <Badge tone={TONE[r.position.status]}>
                {t(`status.${r.position.status}`)}
                {r.position.status === "expensive" && r.position.diff !== null && ` +${(r.position.diff * 100).toFixed(0)}%`}
              </Badge>
              {r.position.status === "expensive" && r.position.min !== null && <MatchPriceButton productId={r.id} price={r.position.min} />}
            </div>
            {r.offers.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-muted">{t("offers", { count: r.offers.length })}</summary>
                <ul className="mt-2 divide-y divide-border text-sm">
                  {r.offers.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
                      <a href={`/${locale}/p/${o.slug}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate hover:underline">
                        {o.title}
                      </a>
                      <span className="text-muted">{o.shop}</span>
                      <span className="flex items-center gap-0.5 text-muted">
                        <Star className="h-3.5 w-3.5" /> {o.rating.toFixed(1)}
                      </span>
                      <Badge>{t(`matchType.${o.match}`)}</Badge>
                      <b className="tabular w-28 text-right">{fmt(o.price)}</b>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
        {data.rows.length === 0 && <li className="card p-8 text-center text-muted">{t("empty")}</li>}
      </ul>
      <Pagination page={page} total={data.total} pageSize={PAGE} />
    </div>
  );
}
