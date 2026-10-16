import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarClock, Download, Landmark, Receipt, Wallet } from "lucide-react";
import { requireShop } from "@/server/auth/guards";
import { financeOverview } from "@/server/services/seller/finance";
import { Badge, Card, PageHeader, StatCard, Table } from "@/components/ui/display";
import { formatUZS } from "@/lib/money";
import { fmtDay, fmtDateTime } from "@/lib/format-date";

export default async function SellerFinancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/finance");
  const t = await getTranslations("sellerFinance");
  const f = await financeOverview(shop.id);
  const fmt = (v: number) => formatUZS(v, locale);
  const c = f.current.totals;
  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("accrued")} value={fmt(f.current.net)} hint={t("since", { date: fmtDay(f.current.start, locale) })} icon={<Wallet className="h-5 w-5" />} />
        <StatCard label={t("pending")} value={fmt(f.pending)} icon={<Landmark className="h-5 w-5" />} />
        <StatCard label={t("nextPayout")} value={fmtDay(f.nextPayout, locale)} icon={<CalendarClock className="h-5 w-5" />} />
        <StatCard label={t("lastPaid")} value={f.lastPaid ? fmt(f.lastPaid.net) : "—"} hint={f.lastPaid?.paidAt ? fmtDay(f.lastPaid.paidAt, locale) : undefined} icon={<Receipt className="h-5 w-5" />} />
      </div>
      <Card className="p-5">
        <h2 className="mb-3 font-bold">{t("currentWeek")}</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {(
            [
              ["gross", c.gross, 1],
              ["commission", c.commission, -1],
              ["logistics", c.logistics, -1],
              ["adSpend", c.adSpend, -1],
              ["penalties", c.penalties, -1],
              ["refunds", c.refunds, -1],
            ] as const
          ).map(([k, v, sign]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-muted">{t(`lines.${k}`)}</dt>
              <dd className="tabular">{sign < 0 && v ? "−" : ""}{fmt(v)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-1.5 text-base font-extrabold sm:col-span-2">
            <dt>{t("net")}</dt>
            <dd className="tabular">{fmt(f.current.net)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[13px] text-muted">{t("ordersDelivered", { count: f.current.ordersCount })}</p>
      </Card>
      <Card className="p-2 md:p-3">
        <h2 className="px-2 pb-2 pt-1 font-bold">{t("payouts")}</h2>
        <Table head={[t("period"), t("orders"), t("lines.gross"), t("deductions"), t("net"), t("status"), ""]} empty={f.payouts.length ? null : <p className="p-4 text-sm text-muted">{t("noPayouts")}</p>}>
          {f.payouts.map((p) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap">
                {fmtDay(p.periodStart, locale, { short: true })} – {fmtDay(new Date(p.periodEnd.getTime() - 1), locale, { short: true })}
              </td>
              <td className="tabular">{p.ordersCount}</td>
              <td className="tabular">{fmt(p.gross)}</td>
              <td className="tabular text-muted">−{fmt(p.commission + p.logistics + p.adSpend + p.penalties + p.refunds)}</td>
              <td className="tabular font-bold">{fmt(p.net)}</td>
              <td>
                <Badge tone={p.status === "PAID" ? "success" : "accent"}>{t(`statuses.${p.status}`)}</Badge>
                {p.reference && <span className="block font-mono text-[11px] text-muted">{p.reference}</span>}
              </td>
              <td>
                <a href={`/api/seller/payouts/${p.id}/export`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  <Download className="h-4 w-4" /> Excel
                </a>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {f.penalties.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("penalties")}</h2>
          <ul className="divide-y divide-border text-sm">
            {f.penalties.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {t(`penaltyTypes.${p.type as "LATE_HANDOVER"}`)} {p.order && `· №${p.order.number}`}
                  <span className="block text-xs text-muted">{fmtDateTime(p.createdAt, locale)}</span>
                </span>
                <span className="tabular font-semibold text-danger">−{fmt(p.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
