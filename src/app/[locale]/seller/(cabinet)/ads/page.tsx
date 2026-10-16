import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireShop } from "@/server/auth/guards";
import { db } from "@/server/db";
import { listCampaigns, MIN_BID, MIN_DAILY_BUDGET } from "@/server/services/ads";
import { categoryOptions } from "@/server/services/seller/products";
import { PageHeader } from "@/components/ui/display";
import { AdsManager } from "@/components/seller/ads-manager";
import { locText } from "@/lib/localized";

export default async function SellerAdsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/ads");
  const t = await getTranslations("sellerAds");
  const [campaigns, products, categories] = await Promise.all([
    listCampaigns(shop.id),
    db.product.findMany({ where: { shopId: shop.id, status: "ACTIVE", deletedAt: null }, select: { id: true, titleUz: true }, orderBy: { soldCount: "desc" }, take: 200 }),
    categoryOptions(locale),
  ]);
  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AdsManager campaigns={campaigns} products={products.map((p) => ({ id: p.id, label: locText(p.titleUz, locale) }))} categories={categories.map((c) => ({ id: c.id, label: locText(c.label, locale) }))} restricted={!!shop.restrictedAt} minBid={MIN_BID} minBudget={MIN_DAILY_BUDGET} />
    </div>
  );
}
