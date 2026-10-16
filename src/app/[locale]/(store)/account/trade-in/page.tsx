import { getTranslations, setRequestLocale } from "next-intl/server";
import { Repeat } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { myTradeIns } from "@/server/services/tradein";
import { Badge, EmptyState, PageHeader, type BadgeTone } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { TradeInOfferActions } from "@/components/content/tradein-tools";
import { formatUZS } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";
import { HANDOVER_DAYS } from "@/lib/tradein";

const TONE: Record<string, BadgeTone> = { SUBMITTED: "info", ESTIMATED: "accent", ACCEPTED: "primary", COMPLETED: "success", REJECTED: "neutral" };

export default async function MyTradeInsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/trade-in");
  const t = await getTranslations("tradein");
  const rows = await myTradeIns(user.id);
  const fmt = (v: number) => formatUZS(v, locale);
  return (
    <div className="space-y-5">
      <PageHeader
        title={t("myTitle")}
        description={t("mySubtitle")}
        actions={
          <Link href="/trade-in" className={buttonClasses("primary", "sm")}>
            {t("new")}
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState className="card" icon={<Repeat className="h-8 w-8" />} title={t("myEmpty")} description={t("myEmptyHint")} />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[r.status]}>{t(`status.${r.status}`)}</Badge>
                <span className="text-xs text-muted">
                  {r.number} · {fmtDay(r.createdAt.toISOString(), locale)}
                </span>
              </div>
              <p className="font-bold">{r.deviceModel}</p>
              <p className="text-sm text-muted">
                {t("gradeLabel")}: {t(`grade.${r.conditionGrade}`)} · {t("estimateShort", { value: fmt(r.estimatedValue) })}
              </p>
              {r.offeredValue != null && (
                <p className="text-sm">
                  {t("offerLine")}: <b className="text-primary">{fmt(r.offeredValue)}</b>
                </p>
              )}
              {r.staffNote && !["offer_expired", "not_handed_over", "buyer_declined"].includes(r.staffNote) && <p className="rounded-[10px] bg-surface-2 p-2.5 text-sm">{r.staffNote}</p>}
              {r.staffNote && ["offer_expired", "not_handed_over", "buyer_declined"].includes(r.staffNote) && <p className="text-sm text-muted">{t(`closed.${r.staffNote}`)}</p>}
              {r.status === "ESTIMATED" && <TradeInOfferActions id={r.id} />}
              {r.status === "ACCEPTED" && <p className="rounded-[10px] bg-primary-50 p-3 text-sm dark:bg-primary/10">{t("handover", { number: r.number, days: HANDOVER_DAYS })}</p>}
              {r.status === "COMPLETED" && (
                <Link href="/account/wallet" className="text-sm font-semibold text-primary hover:underline">
                  {t("paidToWallet")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
