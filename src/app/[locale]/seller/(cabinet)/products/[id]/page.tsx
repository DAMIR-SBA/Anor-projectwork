import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { db } from "@/server/db";
import { categoryOptions, editableProduct } from "@/server/services/seller/products";
import { PageHeader } from "@/components/ui/display";
import { ProductEditor } from "@/components/seller/product-editor";
import { locText } from "@/lib/localized";

export default async function EditProductPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop(`/seller/products/${id}`);
  const t = await getTranslations("sellerProducts");
  const [product, categories, brands] = await Promise.all([editableProduct(shop.id, id), categoryOptions(locale), db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  if (!product) notFound();
  return (
    <div>
      <Link href="/seller/products" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {t("title")}
      </Link>
      <PageHeader title={locale === "ru" ? product.titleRu : locText(product.titleUz, locale)} />
      <ProductEditor initial={product} categories={categories.map((c) => ({ ...c, label: locText(c.label, locale) }))} brands={brands} tier={shop.tier} shopApproved={shop.status === "APPROVED"} />
    </div>
  );
}
