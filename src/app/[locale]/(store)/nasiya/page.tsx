import { getTranslations, setRequestLocale } from "next-intl/server";
import { BadgeCheck, CalendarClock, ShoppingBag, Smartphone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getPlans } from "@/server/services/catalog";
import { NasiyaCalculator } from "@/components/account/nasiya-views";
import { buttonClasses } from "@/components/ui/button";
import { formatUZS } from "@/lib/money";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nasiya" });
  return { title: t("landing.metaTitle"), description: t("landing.lead") };
}

export default async function NasiyaLanding({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("nasiya");
  const plans = await getPlans();
  const steps = [
    { icon: Smartphone, title: t("landing.step1"), text: t("landing.step1Text") },
    { icon: BadgeCheck, title: t("landing.step2"), text: t("landing.step2Text") },
    { icon: ShoppingBag, title: t("landing.step3"), text: t("landing.step3Text") },
  ];
  return (
    <div className="container-page space-y-8 py-6 md:py-10">
      <section className="grid items-center gap-6 rounded-[24px] bg-gradient-to-br from-[#1A1A1F] to-[#3a0a14] p-6 text-white md:grid-cols-[1.2fr_1fr] md:p-10">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-accent">
            <CalendarClock className="h-5 w-5" /> ANOR NASIYA
          </p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">{t("landing.title")}</h1>
          <p className="mt-3 max-w-xl text-white/80">{t("landing.lead")}</p>
          <Link href="/account/nasiya" className={buttonClasses("primary", "lg", "mt-5 bg-accent text-[#1A1A1F] hover:bg-accent/90")}>
            {t("landing.cta")}
          </Link>
        </div>
        <div className="text-fg">
          <NasiyaCalculator plans={plans} />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-extrabold">{t("landing.how")}</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="card flex gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 font-extrabold text-primary dark:bg-primary/15">{i + 1}</span>
              <div>
                <p className="flex items-center gap-2 font-bold">
                  <s.icon className="h-4 w-4 text-primary" /> {s.title}
                </p>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-extrabold">{t("landing.plans")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2">{t("landing.term")}</th>
                <th className="px-3 py-2">{t("landing.markup")}</th>
                <th className="px-3 py-2">{t("landing.range")}</th>
                <th className="px-3 py-2">{t("landing.example")}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.months} className="border-b border-border">
                  <td className="px-3 py-3 font-bold">{t("calc.monthsN", { n: p.months })}</td>
                  <td className="px-3 py-3 tabular">{Math.round(p.markupPercent * 100)}%</td>
                  <td className="px-3 py-3 tabular">
                    {formatUZS(p.minPrice, locale)} – {formatUZS(p.maxPrice, locale)}
                  </td>
                  <td className="px-3 py-3 tabular">{formatUZS(Math.ceil((5_000_000 * (1 + p.markupPercent)) / p.months / 100) * 100, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[13px] text-muted">{t("landing.exampleNote")}</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {(["q1", "q2", "q3", "q4"] as const).map((k) => (
          <details key={k} className="card p-4">
            <summary className="cursor-pointer font-bold">{t(`faq.${k}`)}</summary>
            <p className="mt-2 text-sm text-muted">{t(`faq.${k}a`)}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
