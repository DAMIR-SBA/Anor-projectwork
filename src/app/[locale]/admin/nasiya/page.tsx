import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { nasiyaSettings } from "@/server/services/admin/finance";
import { PageHeader } from "@/components/ui/display";
import { ApplicationDecision, NasiyaForm } from "@/components/admin/user-tools";
import { pendingApplications } from "@/server/services/nasiya";
import { formatUZS } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";

export default async function AdminNasiyaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("nasiya.manage");
  const t = await getTranslations("adminNasiya");
  const tn = await getTranslations("nasiya");
  const [settings, plans, pending] = await Promise.all([nasiyaSettings(), db.installmentPlan.findMany({ orderBy: { months: "asc" } }), pendingApplications()]);
  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} description={t("subtitle")} actions={<Link href="/admin/finance?tab=installments" className="text-sm font-semibold text-primary hover:underline">{t("portfolio")} →</Link>} />
      <section className="card p-5">
        <h2 className="mb-1 font-bold">{t("pendingTitle", { n: pending.length })}</h2>
        <p className="mb-3 text-sm text-muted">{t("pendingHint")}</p>
        <ul className="divide-y divide-border">
          {pending.map((a) => {
            const sc = a.scoring as { score?: number } | null;
            return (
              <li key={a.id} className="flex flex-wrap items-end justify-between gap-3 py-3">
                <div className="text-sm">
                  <Link href={`/admin/users/${a.user.id}`} className="font-semibold hover:underline">
                    {a.fullName} ({a.user.login})
                  </Link>
                  <p className="text-muted">
                    {t("appLine", { income: formatUZS(a.monthlyIncome, locale), employment: tn.has(`employment.${a.employment}`) ? tn(`employment.${a.employment}`) : a.employment, score: sc?.score ?? "—", at: fmtDateTime(a.createdAt.toISOString(), locale) })}
                  </p>
                </div>
                <ApplicationDecision id={a.id} suggested={settings.defaultLimit} />
              </li>
            );
          })}
          {!pending.length && <li className="py-4 text-center text-sm text-muted">{t("noPending")}</li>}
        </ul>
      </section>
      <NasiyaForm settings={settings} plans={plans.map((p) => ({ id: p.id, months: p.months, markupPercent: p.markupPercent, minPrice: p.minPrice, maxPrice: p.maxPrice, isActive: p.isActive }))} />
    </div>
  );
}
