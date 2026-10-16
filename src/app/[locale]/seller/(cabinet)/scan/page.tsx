import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { PageHeader } from "@/components/ui/display";
import { Scanner } from "@/components/seller/scanner";

export default async function ScanPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireShop("/seller/scan");
  const t = await getTranslations("sellerStock");
  return (
    <div>
      <Link href="/seller/stock" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {t("title")}
      </Link>
      <PageHeader title={t("scan.title")} description={t("scan.subtitle")} />
      <Scanner />
    </div>
  );
}
