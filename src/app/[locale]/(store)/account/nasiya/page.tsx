import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarClock, CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { nasiyaOverview } from "@/server/services/nasiya";
import { Badge, Card, PageHeader, ProgressBar } from "@/components/ui/display";
import { NasiyaApplyForm, RepayButton } from "@/components/account/nasiya-views";
import { formatUZS } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";

const STATUS_TONE = { ACTIVE: "info", OVERDUE: "danger", PAID: "success", CANCELLED: "neutral" } as const;
const ROW_TONE = { DUE: "neutral", OVERDUE: "danger", PAID: "success" } as const;

export default async function AccountNasiyaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/nasiya");
  const t = await getTranslations("nasiya");
  const [o, wallet, cards] = await Promise.all([
    nasiyaOverview(user.id),
    db.wallet.findUnique({ where: { userId: user.id }, select: { balance: true } }),
    db.savedCard.findMany({ where: { userId: user.id }, select: { id: true, brand: true, last4: true, provider: true } }),
  ]);
  const fmt = (v: number) => formatUZS(v, locale);
  const day = (d: Date) => fmtDay(d.toISOString(), locale);
  const app = o.application;
  const waiting = o.canReapplyAt;
  const reasons = (app?.reason ?? "").split(",").filter(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader title={t("account.title")} description={t("account.subtitle")} />

      {o.limit > 0 ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted">{t("account.available")}</p>
              <p className="tabular text-3xl font-extrabold text-primary">{fmt(o.available)}</p>
            </div>
            <p className="text-sm text-muted">{t("account.limitOf", { used: fmt(o.used), limit: fmt(o.limit) })}</p>
          </div>
          <ProgressBar className="mt-3" value={o.used} max={o.limit} tone="accent" />
          <p className="mt-3 text-sm text-muted">{t("account.howToUse")}</p>
        </Card>
      ) : app?.status === "PENDING" ? (
        <Card className="flex items-start gap-3 p-5">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-info" />
          <div>
            <p className="font-bold">{t("account.pendingTitle")}</p>
            <p className="text-sm text-muted">{t("account.pendingText")}</p>
          </div>
        </Card>
      ) : app?.status === "REJECTED" && waiting ? (
        <Card className="flex items-start gap-3 p-5">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <p className="font-bold">{t("account.rejectedTitle")}</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-muted">
              {reasons.map((r) => (
                <li key={r}>{t.has(`reasons.${r}`) ? t(`reasons.${r}`) : r}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm">{t("account.reapply", { date: day(waiting) })}</p>
          </div>
        </Card>
      ) : !o.phoneVerified ? (
        <Card className="p-5">
          <p className="font-bold">{t("account.phoneTitle")}</p>
          <p className="mt-1 text-sm text-muted">{t("account.phoneText")}</p>
          <Link href="/account/security" className="mt-3 inline-block font-semibold text-primary underline">
            {t("account.phoneLink")}
          </Link>
        </Card>
      ) : (
        <Card className="p-5">
          <h2 className="text-lg font-bold">{t("account.applyTitle")}</h2>
          <p className="mb-4 mt-1 text-sm text-muted">{t("account.applyText", { min: fmt(o.settings.minMonthlyIncome), age: o.settings.minAgeYears })}</p>
          <NasiyaApplyForm defaultName={o.name ?? ""} />
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t("account.contracts")}</h2>
        {o.contracts.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              <span className="font-bold">{c.number}</span>
              <Badge tone={STATUS_TONE[c.status]}>{t(`status.${c.status}`)}</Badge>
              <span className="ml-auto text-sm text-muted">{t("account.signed", { date: day(c.signedAt), months: c.months })}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {c.group.orders.flatMap((x) => x.items.map((i) => i.title)).slice(0, 2).join(", ")} ·{" "}
              <Link href={`/account/orders/${c.group.orders[0]?.id ?? ""}`} className="underline">
                №{c.group.number}
              </Link>
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">{t("account.total")}</dt>
                <dd className="tabular font-semibold">{fmt(c.total)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("account.outstanding")}</dt>
                <dd className="tabular font-semibold">{fmt(c.outstanding)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("account.next")}</dt>
                <dd className="tabular font-semibold">{c.next ? `${fmt(c.next.amount - c.next.paidAmount)} · ${day(c.next.dueDate)}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("account.markup")}</dt>
                <dd className="tabular font-semibold">{fmt(c.markup)}</dd>
              </div>
            </dl>
            {c.status !== "PAID" && c.status !== "CANCELLED" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {c.overdue > 0 ? (
                  <RepayButton contractId={c.id} mode="overdue" amount={c.overdue} label={t("repay.overdue", { amount: fmt(c.overdue) })} variant="primary" walletBalance={wallet?.balance ?? 0} cards={cards} />
                ) : (
                  c.next && <RepayButton contractId={c.id} mode="next" amount={c.next.amount - c.next.paidAmount} label={t("repay.next", { amount: fmt(c.next.amount - c.next.paidAmount) })} variant="primary" walletBalance={wallet?.balance ?? 0} cards={cards} />
                )}
                {c.payoff > 0 && <RepayButton contractId={c.id} mode="payoff" amount={c.payoff} label={t("repay.payoff", { amount: fmt(c.payoff), saved: fmt(Math.max(0, c.outstanding - c.payoff)) })} walletBalance={wallet?.balance ?? 0} cards={cards} />}
              </div>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-primary">{t("account.schedule")}</summary>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 font-semibold">#</th>
                    <th className="py-1 font-semibold">{t("account.due")}</th>
                    <th className="py-1 text-right font-semibold">{t("account.amount")}</th>
                    <th className="py-1 text-right font-semibold">{t("account.state")}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.schedule.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-1.5 tabular">{r.index}</td>
                      <td className="py-1.5">{day(r.dueDate)}</td>
                      <td className="py-1.5 text-right tabular">{fmt(r.amount)}</td>
                      <td className="py-1.5 text-right">
                        <Badge tone={ROW_TONE[r.status]}>{r.status === "PAID" ? <CheckCircle2 className="mr-1 inline h-3 w-3" /> : null}{t(`rowStatus.${r.status}`)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </Card>
        ))}
        {!o.contracts.length && <p className="card p-6 text-center text-sm text-muted">{t("account.noContracts")}</p>}
      </section>
    </div>
  );
}
