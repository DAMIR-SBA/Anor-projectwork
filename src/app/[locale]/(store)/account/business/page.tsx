import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BadgeCheck, Building2, FileText, Landmark, Percent } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { businessProfile, buyerInvoices, buyerQuotes } from "@/server/services/b2b";
import { Badge, Card, EmptyState, KeyValue, PageHeader, type BadgeTone } from "@/components/ui/display";
import { BusinessForm, EditBusiness, QuoteActions } from "@/components/b2b/b2b-tools";
import { formatUZS } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";
import { formatAccount, INVOICE_BANK_DAYS, QUOTE_MIN_QTY } from "@/lib/b2b";
import { loc, locText } from "@/lib/localized";

const QUOTE_TONE: Record<string, BadgeTone> = { OPEN: "info", QUOTED: "accent", ACCEPTED: "primary", ORDERED: "success", DECLINED: "neutral", EXPIRED: "neutral" };
const INVOICE_TONE: Record<string, BadgeTone> = { ISSUED: "accent", PAID: "success", CANCELLED: "neutral" };

export default async function BusinessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/business");
  const t = await getTranslations("b2b");
  const [profile, quotes, invoices] = await Promise.all([businessProfile(user.id), buyerQuotes(user.id), buyerInvoices(user.id)]);
  const fmt = (v: number) => formatUZS(v, locale);
  const form = { companyName: profile?.companyName ?? "", taxId: profile?.taxId ?? "", legalAddress: profile?.legalAddress ?? "", bankName: profile?.bankName ?? "", bankAccount: profile?.bankAccount ?? "", bankMfo: profile?.bankMfo ?? "" };
  const perks = [
    { icon: Percent, title: t("perkWholesale"), text: t("perkWholesaleText") },
    { icon: FileText, title: t("perkQuotes"), text: t("perkQuotesText", { min: QUOTE_MIN_QTY }) },
    { icon: Landmark, title: t("perkInvoice"), text: t("perkInvoiceText", { days: INVOICE_BANK_DAYS }) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {!profile ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {perks.map((p) => (
              <Card key={p.title} className="p-4">
                <p.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                <p className="mt-2 font-bold">{p.title}</p>
                <p className="text-sm text-muted">{p.text}</p>
              </Card>
            ))}
          </div>
          <Card className="p-5">
            <h2 className="mb-1 text-lg font-bold">{t("formTitle")}</h2>
            <p className="mb-4 text-sm text-muted">{t("formHint")}</p>
            <BusinessForm initial={form} />
          </Card>
        </>
      ) : (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-primary-50 text-primary dark:bg-primary/10">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-bold">{profile.companyName}</p>
                {profile.verifiedAt ? (
                  <Badge tone="success">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> {t("verified", { date: fmtDay(profile.verifiedAt.toISOString(), locale) })}
                  </Badge>
                ) : (
                  <Badge tone="accent">{t("unverified")}</Badge>
                )}
              </div>
            </div>
            <EditBusiness initial={form} />
          </div>
          <KeyValue
            className="mt-4"
            items={[
              [t("taxId"), profile.taxId],
              [t("legalAddress"), profile.legalAddress],
              [t("bankName"), profile.bankName || "—"],
              [t("bankMfo"), profile.bankMfo || "—"],
              [t("bankAccount"), formatAccount(profile.bankAccount) || "—"],
            ]}
          />
          <p className="mt-4 rounded-[12px] bg-surface-2 p-3 text-sm text-muted">{t("activeHint", { days: INVOICE_BANK_DAYS })}</p>
        </Card>
      )}

      <section id="quotes" className="scroll-mt-32 space-y-3">
        <h2 className="text-lg font-bold">{t("quotesTitle")}</h2>
        {quotes.length === 0 ? (
          <EmptyState className="card" icon={<FileText className="h-8 w-8" />} title={t("quotesEmpty")} description={t("quotesEmptyHint", { min: QUOTE_MIN_QTY })} />
        ) : (
          <ul className="space-y-3">
            {quotes.map((q) => (
              <li key={q.id} className="card flex flex-col gap-3 p-4 sm:flex-row">
                <Link href={`/p/${q.product.slug}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] bg-surface-2">
                  {q.product.media[0] && <Image src={q.product.media[0].url} alt="" fill sizes="64px" className="object-cover" />}
                </Link>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={QUOTE_TONE[q.state] ?? "neutral"}>{t(`quoteStatus.${q.state}`)}</Badge>
                    <span className="text-xs text-muted">
                      {q.number} · {fmtDay(q.createdAt.toISOString(), locale)} · {locText(q.shop.name, locale)}
                    </span>
                  </div>
                  <Link href={`/p/${q.product.slug}`} className="line-clamp-1 font-semibold hover:text-primary">
                    {loc(q.product, "title", locale)}
                    {q.variant && (locale === "ru" ? q.variant.titleRu : locText(q.variant.titleUz, locale)) ? ` · ${locale === "ru" ? q.variant.titleRu : locText(q.variant.titleUz, locale)}` : ""}
                  </Link>
                  <p className="text-sm text-muted">
                    {t("qtyTimes", { qty: q.quantity })}
                    {q.variant && ` · ${t("listPrice", { price: fmt(q.variant.price) })}`}
                    {q.targetPrice ? ` · ${t("yourTarget", { price: fmt(q.targetPrice) })}` : ""}
                  </p>
                  {q.quotedPrice != null && (
                    <p className="text-sm">
                      <b className="text-primary">{t("offer", { price: fmt(q.quotedPrice), total: fmt(q.quotedPrice * q.quantity) })}</b>
                      {q.validUntil && q.state === "QUOTED" && <span className="text-muted"> · {t("validUntil", { date: fmtDay(q.validUntil.toISOString(), locale) })}</span>}
                    </p>
                  )}
                  {q.sellerNote && <p className="rounded-[10px] bg-surface-2 p-2 text-sm">{q.sellerNote}</p>}
                  {q.state === "ACCEPTED" && (
                    <Link href="/cart" className="text-sm font-semibold text-primary hover:underline">
                      {t("inCart")}
                    </Link>
                  )}
                </div>
                <QuoteActions quoteId={q.id} state={q.state} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="invoices" className="scroll-mt-32 space-y-3">
        <h2 className="text-lg font-bold">{t("invoicesTitle")}</h2>
        {invoices.length === 0 ? (
          <EmptyState className="card" icon={<Landmark className="h-8 w-8" />} title={t("invoicesEmpty")} description={t("invoicesEmptyHint")} />
        ) : (
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li key={inv.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{inv.number}</b>
                    <Badge tone={INVOICE_TONE[inv.status]}>{t(`invoiceStatus.${inv.status}`)}</Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {fmtDay(inv.createdAt.toISOString(), locale)} · {t("vatIncl", { vat: fmt(inv.vat) })}
                    {inv.status === "ISSUED" && ` · ${t("payBy", { date: fmtDay(inv.dueDate.toISOString(), locale) })}`}
                    {inv.paidAt && ` · ${t("paidOn", { date: fmtDay(inv.paidAt.toISOString(), locale) })}`}
                  </p>
                </div>
                <b className="tabular">{fmt(inv.amount)}</b>
                <div className="flex gap-2">
                  {inv.group.orders[0] && (
                    <Link href={`/account/orders/${inv.group.orders[0].id}`} className="text-sm font-semibold text-primary hover:underline">
                      {t("order")}
                    </Link>
                  )}
                  <a href={`/api/invoices/${inv.id}?locale=${locale === "ru" ? "ru" : "uz"}`} target="_blank" rel="noopener" className="text-sm font-semibold text-primary hover:underline">
                    PDF
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
