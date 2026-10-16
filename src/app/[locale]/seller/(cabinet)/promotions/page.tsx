import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireShop } from "@/server/auth/guards";
import { promotionsOverview } from "@/server/services/seller/promotions";
import { PageHeader } from "@/components/ui/display";
import { CampaignCard, PromotionForm, PromotionList } from "@/components/seller/promotions-views";

export default async function SellerPromotionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/promotions");
  const t = await getTranslations("sellerPromotions");
  const data = await promotionsOverview(shop.id, locale);
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {shop.restrictedAt && <p className="rounded-[12px] bg-danger/10 p-3 text-sm font-semibold text-danger">{t("restricted")}</p>}
      <section aria-labelledby="camp-title">
        <h2 id="camp-title" className="mb-2 text-lg font-bold">
          {t("campaigns")}
        </h2>
        <ul className="space-y-3">
          {data.campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} products={data.products} />
          ))}
          {data.campaigns.length === 0 && <li className="card p-6 text-center text-sm text-muted">{t("noCampaigns")}</li>}
        </ul>
      </section>
      <section aria-labelledby="own-title" className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <h2 id="own-title" className="mb-2 text-lg font-bold">
            {t("own")}
          </h2>
          <PromotionList rows={data.promotions} />
        </div>
        <PromotionForm products={data.products} />
      </section>
    </div>
  );
}
