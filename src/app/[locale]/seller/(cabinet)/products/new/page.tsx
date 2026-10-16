import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { db } from "@/server/db";
import { categoryOptions } from "@/server/services/seller/products";
import { PageHeader } from "@/components/ui/display";
import { ProductEditor } from "@/components/seller/product-editor";
import { locText } from "@/lib/localized";

export default async function NewProductPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/products/new");
  const t = await getTranslations("sellerProducts");
  const [categories, brands] = await Promise.all([categoryOptions(locale), db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  return (
    <div>
      <Link href="/seller/products" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {t("title")}
      </Link>
      <PageHeader title={t("add")} />
      <ProductEditor initial={null} categories={categories.map((c) => ({ ...c, label: locText(c.label, locale) }))} brands={brands} tier={shop.tier} shopApproved={shop.status === "APPROVED"} />
    </div>
  );
}
