import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { financeOverview, installmentPortfolio, payoutsList, refundsList } from "@/server/services/admin/finance";
import { generatePayoutsAction, settlePayoutsAction } from "@/server/actions/admin-risk";
import { cancelInvoiceAction, markInvoicePaidAction } from "@/server/actions/b2b";
import { adminInvoices } from "@/server/services/b2b";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { AdminTabs } from "@/components/admin/tabs";
import { ActionButton } from "@/components/admin/ui";
import { formatUZS } from "@/lib/money";
import { fmtDay, fmtDateTime } from "@/lib/format-date";

const TABS = ["overview", "payouts", "refunds", "invoices", "installments"] as const;

export default async function AdminFinancePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; status?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("finance.view");
  const t = await getTranslations("adminFinance");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "overview";
  const page = Math.max(1, Number(sp.page) || 1);
  const fmt = (v: number) => formatUZS(v, locale);
  const canManage = staff.permissions.has("finance.manage");
  return (
    <div>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <a href="/api/admin/finance/payouts/export" download className={buttonClasses("outline", "sm")}>
              <Download className="h-4 w-4" /> Excel
            </a>
            {canManage && <ActionButton action={generatePayoutsAction} input={{}} label={t("generate")} confirm={t("generateConfirm")} />}
            {canManage && <ActionButton action={settlePayoutsAction} input={{}} variant="primary" label={t("settle")} confirm={t("settleConfirm")} />}
          </div>
        }
      />
      <AdminTabs active={tab} tabs={TABS.map((k) => ({ key: k, href: `/admin/finance?tab=${k}`, label: t(`tabs.${k}`) }))} />
      {tab === "overview" && <Overview t={t} fmt={fmt} />}
      {tab === "payouts" && <Payouts t={t} fmt={fmt} locale={locale} status={sp.status} page={page} />}
      {tab === "refunds" && <Refunds t={t} fmt={fmt} locale={locale} page={page} />}
      {tab === "invoices" && <Invoices t={t} fmt={fmt} locale={locale} page={page} status={sp.status} canManage={canManage} />}
      {tab === "installments" && <Installments t={t} fmt={fmt} locale={locale} />}
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"adminFinance">>>;

async function Overview({ t, fmt }: { t: T; fmt: (v: number) => string }) {
  const o = await financeOverview(30);
  const tiles: Array<[string, string, string?]> = [
    [t("gmv"), fmt(o.gmv), t("ordersN", { count: o.orders })],
    [t("commission"), fmt(o.commission)],
    [t("adRevenue"), fmt(o.adRevenue)],
    [t("takeRate"), `${(o.takeRate * 100).toFixed(1)}%`, t("takeRateHint")],
    [t("logistics"), fmt(o.logistics)],
    [t("refunds"), fmt(o.refunds.amount), t("refundsN", { count: o.refunds.count })],
    [t("penalties"), fmt(o.penalties)],
    [t("payoutsPaid"), fmt(o.payoutsPaid.amount), t("payoutsN", { count: o.payoutsPaid.count })],
  ];
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">{t("period30")}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([k, v, hint]) => (
          <Card key={k} className="p-4">
            <p className="text-[13px] text-muted">{k}</p>
            <p className="tabular mt-1 text-xl font-extrabold">{v}</p>
            {hint && <p className="text-[12px] text-muted">{hint}</p>}
          </Card>
        ))}
      </div>
      <h2 className="text-lg font-bold">{t("liabilities")}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[13px] text-muted">{t("payoutsPending")}</p>
          <p className="tabular mt-1 text-xl font-extrabold">{fmt(o.payoutsPending.amount)}</p>
          <p className="text-[12px] text-muted">{t("payoutsN", { count: o.payoutsPending.count })}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-muted">{t("walletBalances")}</p>
          <p className="tabular mt-1 text-xl font-extrabold">{fmt(o.walletBalances)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-muted">{t("bonusLiability")}</p>
          <p className="tabular mt-1 text-xl font-extrabold">{o.bonusLiability.toLocaleString("ru-RU")}</p>
          <p className="text-[12px] text-muted">{t("bonusHint")}</p>
        </Card>
      </div>
    </div>
  );
}

async function Payouts({ t, fmt, locale, status, page }: { t: T; fmt: (v: number) => string; locale: string; status?: string; page: number }) {
  const data = await payoutsList({ status, page });
  return (
    <div>
      <div className="mb-3 flex gap-1.5 text-sm">
        {(["", "PENDING", "PAID"] as const).map((s) => (
          <Link key={s} href={`/admin/finance?tab=payouts${s ? `&status=${s}` : ""}`} className={`rounded-full border px-3 py-1 font-semibold ${(status ?? "") === s ? "border-primary bg-primary text-white" : "border-border hover:bg-surface-2"}`}>
            {s ? t(`payoutStatus.${s}`) : t("all")}
          </Link>
        ))}
      </div>
      <div tabIndex={0} className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">{t("shop")}</th>
              <th className="px-3 py-2.5">{t("period")}</th>
              <th className="px-3 py-2.5 text-right">{t("gross")}</th>
              <th className="px-3 py-2.5 text-right">{t("deductions")}</th>
              <th className="px-3 py-2.5 text-right">{t("net")}</th>
              <th className="px-3 py-2.5">{t("status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2">
                  <Link href={`/admin/moderation/shops/${p.shop.id}`} className="font-semibold hover:underline">
                    {p.shop.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-[13px]">
                  {fmtDay(p.periodStart.toISOString(), locale)} — {fmtDay(new Date(p.periodEnd.getTime() - 1).toISOString(), locale)}
                </td>
                <td className="tabular px-3 py-2 text-right">{fmt(p.gross)}</td>
                <td className="tabular px-3 py-2 text-right text-muted">−{fmt(p.commission + p.logistics + p.adSpend + p.penalties + p.refunds)}</td>
                <td className={`tabular px-3 py-2 text-right font-bold ${p.net < 0 ? "text-danger" : ""}`}>{fmt(p.net)}</td>
                <td className="px-3 py-2">
                  <Badge tone={p.status === "PAID" ? "success" : "accent"}>{t(`payoutStatus.${p.status === "PAID" ? "PAID" : "PENDING"}`)}</Badge>
                  {p.reference && <span className="block font-mono text-[11px] text-muted">{p.reference}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 && <p className="p-8 text-center text-muted">{t("empty")}</p>}
      </div>
      <div className="mt-4">
        <Pagination page={page} total={data.total} pageSize={30} />
      </div>
    </div>
  );
}

async function Refunds({ t, fmt, locale, page }: { t: T; fmt: (v: number) => string; locale: string; page: number }) {
  const data = await refundsList(page);
  return (
    <div>
      <div tabIndex={0} className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">{t("date")}</th>
              <th className="px-3 py-2.5">{t("order")}</th>
              <th className="px-3 py-2.5">{t("method")}</th>
              <th className="px-3 py-2.5 text-right">{t("amount")}</th>
              <th className="px-3 py-2.5">{t("status")}</th>
              <th className="px-3 py-2.5">{t("reason")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-[13px]">{fmtDateTime(r.createdAt.toISOString(), locale)}</td>
                <td className="px-3 py-2 font-mono text-[13px]">{r.payment.group?.number ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.payment.method} → {r.method}
                </td>
                <td className="tabular px-3 py-2 text-right font-semibold">{fmt(r.amount)}</td>
                <td className="px-3 py-2">
                  <Badge tone={r.status === "COMPLETED" ? "success" : r.status === "FAILED" ? "danger" : "accent"}>{t(`refundStatus.${r.status}`)}</Badge>
                </td>
                <td className="px-3 py-2 text-[13px] text-muted">{r.return?.number ?? r.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 && <p className="p-8 text-center text-muted">{t("noRefunds")}</p>}
      </div>
      <div className="mt-4">
        <Pagination page={page} total={data.total} pageSize={30} />
      </div>
    </div>
  );
}

async function Installments({ t, fmt, locale }: { t: T; fmt: (v: number) => string; locale: string }) {
  const p = await installmentPortfolio();
  const active = (p.contracts.ACTIVE?.count ?? 0) + (p.contracts.OVERDUE?.count ?? 0);
  const overdueTotal = Object.values(p.aging).reduce((a, b) => a + b, 0);
  const maxAging = Math.max(1, ...Object.values(p.aging));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[13px] text-muted">{t("activeContracts")}</p>
          <p className="tabular mt-1 text-xl font-extrabold">{active}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-muted">{t("outstanding")}</p>
          <p className="tabular mt-1 text-xl font-extrabold">{fmt(p.outstanding)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-muted">{t("overdueTotal")}</p>
          <p className="tabular mt-1 text-xl font-extrabold text-danger">{fmt(overdueTotal)}</p>
          <p className="text-[12px] text-muted">{t("overdueN", { count: p.overdue.length })}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-muted">{t("applications")}</p>
          <p className="tabular mt-1 text-xl font-extrabold">{(p.applications.PENDING ?? 0) + (p.applications.APPROVED ?? 0) + (p.applications.REJECTED ?? 0)}</p>
          <p className="text-[12px] text-muted">{t("applicationsHint", { approved: p.applications.APPROVED ?? 0, rejected: p.applications.REJECTED ?? 0 })}</p>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("aging")}</h2>
          <ul className="space-y-2 text-sm">
            {(["1-30", "31-60", "61-90", "90+"] as const).map((b) => (
              <li key={b} className="grid grid-cols-[90px_1fr_140px] items-center gap-2">
                <span>{t("days", { range: b })}</span>
                <span className="h-2.5 rounded-full bg-surface-3">
                  <span className="block h-full rounded-full bg-danger" style={{ width: `${(p.aging[b] / maxAging) * 100}%` }} />
                </span>
                <span className="tabular text-right font-semibold">{fmt(p.aging[b])}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("byPlan")}</h2>
          <ul className="space-y-1.5 text-sm">
            {p.byPlan.map((b) => (
              <li key={b.months} className="flex justify-between">
                <span>{t("months", { n: b.months })}</span>
                <span className="tabular">
                  {b.count} · {fmt(b.total)}
                </span>
              </li>
            ))}
            {!p.byPlan.length && <li className="text-muted">{t("noContracts")}</li>}
          </ul>
        </Card>
      </div>
      <Card className="p-0">
        <h2 className="border-b border-border p-4 font-bold">{t("overdueReport")}</h2>
        <div tabIndex={0} className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2">{t("contract")}</th>
                <th className="px-3 py-2">{t("customer")}</th>
                <th className="px-3 py-2">{t("installment")}</th>
                <th className="px-3 py-2">{t("dueDate")}</th>
                <th className="px-3 py-2 text-right">{t("daysLate")}</th>
                <th className="px-3 py-2 text-right">{t("amountDue")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {p.overdue.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2 font-mono text-[13px]">{o.contract.number}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/users/${o.contract.user.id}`} className="hover:underline">
                      {o.contract.user.name ?? o.contract.user.login}
                    </Link>
                    <span className="block text-[12px] text-muted">{o.contract.user.phone ?? ""}</span>
                  </td>
                  <td className="px-3 py-2">
                    {o.index}/{o.contract.months}
                  </td>
                  <td className="px-3 py-2">{fmtDay(o.dueDate, locale)}</td>
                  <td className="tabular px-3 py-2 text-right text-danger">{o.days}</td>
                  <td className="tabular px-3 py-2 text-right font-semibold">{fmt(o.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!p.overdue.length && <p className="p-6 text-center text-sm text-muted">{t("noOverdue")}</p>}
        </div>
      </Card>
    </div>
  );
}

const INVOICE_FILTERS = ["ISSUED", "PAID", "CANCELLED", "all"] as const;

async function Invoices({ t, fmt, locale, page, status, canManage }: { t: T; fmt: (v: number) => string; locale: string; page: number; status?: string; canManage: boolean }) {
  const filter = (INVOICE_FILTERS as readonly string[]).includes(status ?? "") ? (status as (typeof INVOICE_FILTERS)[number]) : "ISSUED";
  const data = await adminInvoices(filter, page);
  const sum = (s: string) => data.sums.find((x) => x.status === s);
  const now = new Date();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("invoicesHint")}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(["ISSUED", "PAID", "CANCELLED"] as const).map((s) => (
          <Card key={s} className="p-4">
            <p className="text-[13px] text-muted">{t(`invoiceStatus.${s}`)}</p>
            <p className="tabular mt-1 text-xl font-extrabold">{fmt(sum(s)?._sum.amount ?? 0)}</p>
            <p className="text-[12px] text-muted">{t("invoicesN", { count: sum(s)?._count._all ?? 0 })}</p>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {INVOICE_FILTERS.map((s) => (
          <Link key={s} href={`/admin/finance?tab=invoices&status=${s}`} aria-current={filter === s ? "page" : undefined} className={filter === s ? "rounded-full bg-[#1A1A1F] px-3 py-1 text-sm font-semibold text-white" : "rounded-full bg-surface-3 px-3 py-1 text-sm font-semibold"}>
            {s === "all" ? t("all") : t(`invoiceStatus.${s}`)}
          </Link>
        ))}
      </div>
      <div tabIndex={0} className="card overflow-x-auto p-0">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">{t("invoice")}</th>
              <th className="px-3 py-2.5">{t("company")}</th>
              <th className="px-3 py-2.5 text-right">{t("amount")}</th>
              <th className="px-3 py-2.5">{t("dueDate")}</th>
              <th className="px-3 py-2.5">{t("status")}</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.items.map((inv) => (
              <tr key={inv.id}>
                <td className="px-4 py-2">
                  <a href={`/api/invoices/${inv.id}?locale=${locale === "ru" ? "ru" : "uz"}`} target="_blank" rel="noopener" className="font-mono text-[13px] font-semibold text-primary hover:underline">
                    {inv.number}
                  </a>
                  <span className="block text-xs text-muted">{fmtDateTime(inv.createdAt.toISOString(), locale)}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="block font-semibold">{inv.user.businessProfile?.companyName ?? inv.user.login}</span>
                  <span className="text-xs text-muted">{t("taxIdShort", { taxId: inv.user.businessProfile?.taxId ?? "—" })}</span>
                </td>
                <td className="tabular px-3 py-2 text-right font-semibold">
                  {fmt(inv.amount)}
                  <span className="block text-xs font-normal text-muted">{t("vatShort", { vat: fmt(inv.vat) })}</span>
                </td>
                <td className={inv.status === "ISSUED" && inv.dueDate < now ? "px-3 py-2 text-[13px] font-semibold text-danger" : "px-3 py-2 text-[13px]"}>{fmtDay(inv.dueDate.toISOString(), locale)}</td>
                <td className="px-3 py-2">
                  <Badge tone={inv.status === "PAID" ? "success" : inv.status === "CANCELLED" ? "neutral" : "accent"}>{t(`invoiceStatus.${inv.status}`)}</Badge>
                  {inv.paidRef && <span className="block text-xs text-muted">{t("paidRef", { ref: inv.paidRef })}</span>}
                </td>
                <td className="px-3 py-2">
                  {canManage && inv.status === "ISSUED" && (
                    <div className="flex justify-end gap-1.5">
                      <ActionButton action={markInvoicePaidAction} input={{ invoiceId: inv.id }} variant="primary" label={t("markPaid")} reason={{ title: t("markPaidTitle", { number: inv.number, amount: fmt(inv.amount) }), label: t("paymentOrder"), hint: t("paymentOrderHint") }} success={t("markedPaid")} />
                      <ActionButton action={cancelInvoiceAction} input={{ invoiceId: inv.id }} variant="ghost" label={t("cancelInvoice")} reason={{ title: t("cancelInvoiceTitle", { number: inv.number }), label: t("reason") }} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 && <p className="p-8 text-center text-muted">{t("noInvoices")}</p>}
      </div>
      <Pagination page={page} total={data.total} pageSize={25} />
    </div>
  );
}
