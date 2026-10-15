import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/display";
import { GiftCardBuy } from "@/components/account/gift-card-buy";

export async function generateMetadata() {
  const t = await getTranslations("giftcards");
  return { title: t("title"), description: t("subtitle") };
}

export default async function GiftCardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("giftcards");
  const user = await getCurrentUser();
  return (
    <div className="container-page py-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <GiftCardBuy signedIn={!!user} />
    </div>
  );
}
