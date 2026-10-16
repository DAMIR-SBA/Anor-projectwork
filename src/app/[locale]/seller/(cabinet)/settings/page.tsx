import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireShop } from "@/server/auth/guards";
import { settingsView } from "@/server/services/seller/settings";
import { PageHeader } from "@/components/ui/display";
import { BankForm, DocumentsCard, ProfileForm, WarehousesCard } from "@/components/seller/settings-views";

export default async function SellerSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/settings");
  const t = await getTranslations("sellerSettings");
  const v = await settingsView(shop.id);
  return (
    <div>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <ProfileForm v={v} />
          <WarehousesCard v={v} />
        </div>
        <div className="space-y-5">
          <BankForm v={v} />
          <DocumentsCard v={v} />
        </div>
      </div>
    </div>
  );
}
