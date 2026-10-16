import { getTranslations, setRequestLocale } from "next-intl/server";
import { BadgeCheck, FileText } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { sellerQuotes } from "@/server/services/b2b";
import { Badge, EmptyState, PageHeader, type BadgeTone } from "@/components/ui/display";
import { QuoteResponder } from "@/components/b2b/b2b-tools";
import { formatUZS } from "@/lib/money";
import { fmtDay, fmtDateTime } from "@/lib/format-date";
import { loc, locText } from "@/lib/localized";
import { cn } from "@/lib/cn";

const TABS = ["open", "answered", "closed"] as const;
const TONE: Record<string, BadgeTone> = { OPEN: "info", QUOTED: "accent", ACCEPTED: "primary", ORDERED: "success", DECLINED: "neutral", EXPIRED: "neutral" };

export default async function SellerQuotesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/quotes");
  const t = await getTranslations("b2b");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "open";
  const data = await sellerQuotes(shop.id, tab);
  const fmt = (v: number) => formatUZS(v, locale);
  return (
    <div className="max-w-4xl">
      <PageHeader title={t("sellerTitle")} description={t("sellerSubtitle")} />
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label={t("sellerTitle")}>
        {TABS.map((k) => (
          <Link key={k} href={`/seller/quotes?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold", tab === k ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>
            {t(`sellerTabs.${k}`)} {k === "open" && data.open ? <span className="rounded-full bg-surface-3 px-1.5 text-xs text-fg">{data.open}</span> : null}
          </Link>
        ))}
      </nav>
      {data.items.length === 0 ? (
        <EmptyState className="card" icon={<FileText className="h-8 w-8" />} title={t("sellerEmpty")} description={t("sellerEmptyHint")} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((q) => {
            const company = q.user.businessProfile;
            const variantTitle = q.variant ? (locale === "ru" ? q.variant.titleRu : locText(q.variant.titleUz, locale)) : "";
            return (
              <li key={q.id} className="card space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[q.state] ?? "neutral"}>{t(`quoteStatus.${q.state}`)}</Badge>
                  <span className="text-xs text-muted">
                    {q.number} · {fmtDateTime(q.createdAt.toISOString(), locale)}
                  </span>
                </div>
                <Link href={`/p/${q.product.slug}`} className="line-clamp-1 font-bold hover:text-primary">
                  {loc(q.product, "title", locale)}
                  {variantTitle ? ` · ${variantTitle}` : ""}
                </Link>
                <p className="flex flex-wrap items-center gap-1 text-sm">
                  <b>{company?.companyName ?? q.user.name}</b>
                  {company && <span className="text-muted">· {t("taxIdShort", { taxId: company.taxId })}</span>}
                  {company?.verifiedAt && <BadgeCheck className="h-4 w-4 text-success" aria-label={t("verifiedShort")} />}
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <p>
                    <span className="block text-xs text-muted">{t("quantity")}</span>
                    <b className="tabular">{q.quantity}</b>
                  </p>
                  <p>
                    <span className="block text-xs text-muted">{t("listPriceLabel")}</span>
                    <b className="tabular">{q.variant ? fmt(q.variant.price) : "—"}</b>
                  </p>
                  <p>
                    <span className="block text-xs text-muted">{t("targetPrice")}</span>
                    <b className="tabular">{q.targetPrice ? fmt(q.targetPrice) : "—"}</b>
                  </p>
                  <p>
                    <span className="block text-xs text-muted">{t("stock")}</span>
                    <b className={cn("tabular", q.variant && q.variant.stock < q.quantity && "text-danger")}>{q.variant?.stock ?? "—"}</b>
                  </p>
                </div>
                {q.message && <p className="rounded-[10px] bg-surface-2 p-2.5 text-sm">{q.message}</p>}
                {q.quotedPrice != null && (
                  <p className="text-sm">
                    {t("yourOffer", { price: fmt(q.quotedPrice), total: fmt(q.quotedPrice * q.quantity) })}
                    {q.validUntil && <span className="text-muted"> · {t("validUntil", { date: fmtDay(q.validUntil.toISOString(), locale) })}</span>}
                  </p>
                )}
                {q.state === "OPEN" && q.variant && <QuoteResponder quoteId={q.id} listPrice={q.variant.price} targetPrice={q.targetPrice} quantity={q.quantity} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
