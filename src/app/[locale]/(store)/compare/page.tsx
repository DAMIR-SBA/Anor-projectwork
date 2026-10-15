import { getTranslations, setRequestLocale } from "next-intl/server";
import { CompareView } from "@/components/catalog/compare-view";
import { PageHeader } from "@/components/ui/display";

export default async function ComparePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("compare");
  return (
    <div className="container-page py-5">
      <PageHeader title={t("title")} />
      <CompareView />
    </div>
  );
}
