import { getTranslations, setRequestLocale } from "next-intl/server";
import { BadgePercent, Crown, Headset, Timer, Truck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { currentPlus } from "@/server/services/plus";
import { PlusSubscribe } from "@/components/account/plus-views";
import { formatUZS } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";
import { FREE_DELIVERY_THRESHOLD, PLUS_FREE_DELIVERY_THRESHOLD } from "@/lib/delivery";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "plus" });
  return { title: t("metaTitle"), description: t("lead") };
}

export default async function PlusLanding({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("plus");
  const user = await getCurrentUser();
  const [sub, wallet, cards] = user
    ? await Promise.all([currentPlus(user.id), db.wallet.findUnique({ where: { userId: user.id }, select: { balance: true } }), db.savedCard.findMany({ where: { userId: user.id }, select: { id: true, brand: true, last4: true, provider: true } })])
    : [null, null, []];
  const benefits = [
    { icon: Truck, title: t("b.delivery"), text: t("b.deliveryText", { plus: formatUZS(PLUS_FREE_DELIVERY_THRESHOLD, locale), std: formatUZS(FREE_DELIVERY_THRESHOLD, locale) }) },
    { icon: BadgePercent, title: t("b.cashback"), text: t("b.cashbackText") },
    { icon: Timer, title: t("b.early"), text: t("b.earlyText") },
    { icon: Headset, title: t("b.support"), text: t("b.supportText") },
  ];
  return (
    <div className="container-page space-y-8 py-6 md:py-10">
      <section className="grid items-start gap-6 rounded-[24px] bg-gradient-to-br from-[#1A1A1F] via-[#2b1020] to-primary-dark p-6 text-white md:grid-cols-[1.1fr_1fr] md:p-10">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-accent">
            <Crown className="h-5 w-5" /> ANOR Plus
          </p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">{t("title")}</h1>
          <p className="mt-3 max-w-xl text-white/80">{t("lead")}</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {benefits.map((b) => (
              <li key={b.title} className="rounded-[16px] bg-white/10 p-4">
                <p className="flex items-center gap-2 font-bold">
                  <b.icon className="h-5 w-5 text-accent" /> {b.title}
                </p>
                <p className="mt-1 text-sm text-white/75">{b.text}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[20px] bg-surface p-5 text-fg">
          {sub ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-lg font-bold">
                <Crown className="h-5 w-5 text-accent" /> {t("youArePlus")}
              </p>
              <p className="text-sm text-muted">{t(sub.autoRenew ? "renewsOn" : "endsOn", { date: fmtDay(sub.currentPeriodEnd.toISOString(), locale) })}</p>
              <Link href="/account/plus" className="font-semibold text-primary underline">
                {t("manage")}
              </Link>
            </div>
          ) : (
            <PlusSubscribe signedIn={!!user} walletBalance={wallet?.balance ?? 0} cards={cards} />
          )}
        </div>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        {(["q1", "q2", "q3"] as const).map((k) => (
          <details key={k} className="card p-4">
            <summary className="cursor-pointer font-bold">{t(`faq.${k}`)}</summary>
            <p className="mt-2 text-sm text-muted">{t(`faq.${k}a`)}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
