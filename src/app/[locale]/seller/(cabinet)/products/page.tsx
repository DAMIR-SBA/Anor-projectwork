import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download, FileUp, Plus, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { listSellerProducts, type SellerProductFilter } from "@/server/services/seller/products";
import { PageHeader } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { ProductsTable } from "@/components/seller/products-table";
import { cn } from "@/lib/cn";

const TABS = ["ALL", "ACTIVE", "PENDING", "DRAFT", "LOW_STOCK", "REJECTED", "ARCHIVED"] as const;

export default async function SellerProductsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const { shop } = await requireShop("/seller/products");
  const t = await getTranslations("sellerProducts");
  const status = (TABS as readonly string[]).includes(sp.status ?? "") ? (sp.status as SellerProductFilter["status"]) : "ALL";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listSellerProducts(shop.id, { q: sp.q, status, page, sort: (sp.sort as SellerProductFilter["sort"]) ?? "new" });
  const total = Object.values(data.counts).reduce((a, b) => a + b, 0) - (data.counts.ARCHIVED ?? 0);
  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <a href="/api/seller/products/export" download className={buttonClasses("outline", "sm")}>
              <Download className="h-4 w-4" /> CSV
            </a>
            <Link href="/seller/products/import" className={buttonClasses("outline", "sm")}>
              <FileUp className="h-4 w-4" /> {t("importCsv")}
            </Link>
            <Link href="/seller/products/new" className={buttonClasses("primary", "sm")}>
              <Plus className="h-4 w-4" /> {t("add")}
            </Link>
          </div>
        }
      />
      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label={t("title")}>
        {TABS.map((k) => {
          const n = k === "ALL" ? total : k === "LOW_STOCK" ? null : (data.counts[k] ?? 0);
          return (
            <Link key={k} href={`/seller/products?status=${k}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} aria-current={status === k ? "page" : undefined} className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold", status === k ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>
              {t(`tabs.${k}`)} {n ? <span className="rounded-full bg-surface-3 px-1.5 text-xs text-fg">{n}</span> : null}
            </Link>
          );
        })}
      </nav>
      <form className="flex flex-wrap gap-2" method="get">
        <input type="hidden" name="status" value={status} />
        <label className="relative w-full max-w-sm">
          <span className="sr-only">{t("search")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={sp.q} placeholder={t("search")} className="h-10 w-full rounded-[12px] border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </label>
        <select name="sort" defaultValue={sp.sort ?? "new"} aria-label={t("sort")} className="h-10 rounded-[12px] border border-border bg-surface px-3 text-sm">
          <option value="new">{t("sortNew")}</option>
          <option value="sold">{t("sortSold")}</option>
          <option value="price">{t("sortPrice")}</option>
        </select>
        <button type="submit" className={buttonClasses("secondary", "sm", "h-10")}>
          {t("apply")}
        </button>
      </form>
      <ProductsTable rows={data.items} />
      <Pagination page={page} total={data.total} pageSize={25} />
    </div>
  );
}
