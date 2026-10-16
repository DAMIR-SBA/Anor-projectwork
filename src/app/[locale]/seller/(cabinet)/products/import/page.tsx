import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { PageHeader } from "@/components/ui/display";
import { CsvImport } from "@/components/seller/csv-import";

export default async function ImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireShop("/seller/products/import");
  const t = await getTranslations("sellerProducts");
  return (
    <div className="max-w-4xl">
      <Link href="/seller/products" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {t("title")}
      </Link>
      <PageHeader title={t("import.title")} />
      <CsvImport />
    </div>
  );
}
