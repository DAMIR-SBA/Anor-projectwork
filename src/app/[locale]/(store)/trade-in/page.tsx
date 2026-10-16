import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Camera, ClipboardCheck, Repeat, Wallet } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/display";
import { TradeInEstimator } from "@/components/content/tradein-tools";
import { OFFER_VALID_DAYS } from "@/lib/tradein";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tradein" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function TradeInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tradein");
  const user = await getCurrentUser();
  const steps = [
    { icon: ClipboardCheck, title: t("how1"), text: t("how1Text") },
    { icon: Camera, title: t("how2"), text: t("how2Text", { days: OFFER_VALID_DAYS }) },
    { icon: Repeat, title: t("how3"), text: t("how3Text") },
    { icon: Wallet, title: t("how4"), text: t("how4Text") },
  ];
  return (
    <div className="container-page space-y-6 py-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="card flex gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-primary-50 text-primary dark:bg-primary/10">
              <s.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <b className="block">
                {i + 1}. {s.title}
              </b>
              <span className="text-sm text-muted">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <TradeInEstimator signedIn={!!user} />
    </div>
  );
}
