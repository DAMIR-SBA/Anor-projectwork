import { getTranslations, setRequestLocale } from "next-intl/server";
import { Crown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { plusOverview } from "@/server/services/plus";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { PlusAutoRenew, PlusSubscribe } from "@/components/account/plus-views";
import { formatUZS } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";

export default async function AccountPlusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/plus");
  const t = await getTranslations("plus");
  const o = await plusOverview(user.id);
  const day = (d: Date) => fmtDay(d.toISOString(), locale);
  return (
    <div className="space-y-5">
      <PageHeader title="ANOR Plus" description={t("accountSubtitle")} />
      {o.sub ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Crown className="h-6 w-6 text-accent" />
            <span className="text-lg font-bold">{t(`plans.${o.sub.plan}`)}</span>
            <Badge tone={o.sub.autoRenew ? "success" : "accent"}>{o.sub.autoRenew ? t("autoRenewOn") : t("autoRenewOff")}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted">{t(o.sub.autoRenew ? "renewsOn" : "endsOn", { date: day(o.sub.currentPeriodEnd) })}</p>
          <p className="text-sm text-muted">{t("since", { date: day(o.sub.startedAt) })}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <PlusAutoRenew on={o.sub.autoRenew} />
            <Link href="/plus" className="self-center text-sm font-semibold text-primary underline">
              {t("benefits")}
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <p className="mb-4 text-sm text-muted">{t("notMember")}</p>
          <PlusSubscribe signedIn walletBalance={o.walletBalance} cards={o.cards} />
        </Card>
      )}
      <Card className="p-5">
        <h2 className="mb-3 font-bold">{t("payments")}</h2>
        <ul className="divide-y divide-border text-sm">
          {o.history.map((p) => (
            <li key={p.id} className="flex justify-between gap-2 py-2">
              <span>
                {day(p.paidAt ?? p.createdAt)} · {p.method}
              </span>
              <span className="tabular font-semibold">{formatUZS(p.amount, locale)}</span>
            </li>
          ))}
          {!o.history.length && <li className="py-3 text-muted">{t("noPayments")}</li>}
        </ul>
      </Card>
    </div>
  );
}
