import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { moderationQueue, PRODUCT_TABS, type ProductTab } from "@/server/services/admin/products";
import { PageHeader } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { AdminTabs, FilterForm, inputCls } from "@/components/admin/tabs";
import { ProductModeration } from "@/components/admin/product-moderation";

export default async function AdminProductsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; q?: string; page?: string; shop?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("products.view");
  const t = await getTranslations("adminProducts");
  const sp = await searchParams;
  const tab = (PRODUCT_TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as ProductTab) : "pending";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await moderationQueue(tab, { q: sp.q, shopId: sp.shop, page });
  return (
    <div>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AdminTabs active={tab} tabs={PRODUCT_TABS.map((k) => ({ key: k, href: `/admin/moderation/products?tab=${k}`, label: t(`tabs.${k}`), count: k === "pending" ? data.counts[k] : undefined }))} />
      <FilterForm submitLabel={t("search")}>
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={sp.q} placeholder={t("searchPlaceholder")} aria-label={t("search")} className={`${inputCls} w-full max-w-sm`} />
      </FilterForm>
      <ProductModeration rows={data.rows} canModerate={staff.permissions.has("products.moderate")} />
      <div className="mt-4">
        <Pagination page={page} total={data.total} pageSize={20} />
      </div>
    </div>
  );
}
