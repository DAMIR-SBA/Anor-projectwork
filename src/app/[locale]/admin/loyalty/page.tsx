import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { loyaltySettings, loyaltyStats } from "@/server/services/loyalty";
import { Card, PageHeader } from "@/components/ui/display";
import { LoyaltyForm } from "@/components/admin/marketing-tools";

export default async function AdminLoyaltyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("loyalty.manage");
  const t = await getTranslations("adminLoyalty");
  const [s, st] = await Promise.all([loyaltySettings(), loyaltyStats()]);
  const n = (v: number) => v.toLocaleString(locale === "ru" ? "ru-RU" : "uz-UZ");
  const total = Object.values(st.tiers).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <LoyaltyForm initial={s} />
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("distribution")}</h2>
            <ul className="space-y-2 text-sm">
              {(["STANDARD", "SILVER", "GOLD"] as const).map((k) => (
                <li key={k} className="grid grid-cols-[90px_1fr_48px] items-center gap-2">
                  <span>{t(`tierNames.${k}`)}</span>
                  <span className="h-2.5 rounded-full bg-surface-3">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${((st.tiers[k] ?? 0) / total) * 100}%` }} />
                  </span>
                  <span className="tabular text-right font-semibold">{n(st.tiers[k] ?? 0)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="font-bold">{t("liability")}</h2>
            <p className="flex justify-between">
              <span className="text-muted">{t("outstanding")}</span> <b className="tabular">{n(st.bonusOutstanding)}</b>
            </p>
            <p className="flex justify-between">
              <span className="text-muted">{t("cashback30")}</span> <b className="tabular">{n(st.cashback30)}</b>
            </p>
            <p className="flex justify-between">
              <span className="text-muted">{t("expiring30")}</span> <b className="tabular">{n(st.expiring30)}</b>
            </p>
          </Card>
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="font-bold">{t("referrals30")}</h2>
            {(["PAID", "BLOCKED"] as const).map((k) => (
              <p key={k} className="flex justify-between">
                <span className="text-muted">{t(`referralStatus.${k}`)}</span> <b className="tabular">{n(st.referrals[k]?.count ?? 0)}</b>
              </p>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
