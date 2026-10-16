import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { adminCategories } from "@/server/services/admin/categories";
import { PageHeader } from "@/components/ui/display";
import { CategoryManager } from "@/components/admin/category-manager";

export default async function AdminCategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("categories.manage");
  const t = await getTranslations("adminCategories");
  const rows = await adminCategories();
  return (
    <div>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <CategoryManager rows={rows} canEdit={staff.permissions.has("categories.manage")} />
    </div>
  );
}
