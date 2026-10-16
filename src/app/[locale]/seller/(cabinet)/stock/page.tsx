import { getTranslations, setRequestLocale } from "next-intl/server";
import { ScanLine, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { listSupplies, stockOverview } from "@/server/services/seller/stock";
import { PageHeader } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { StockTable, SuppliesList, SupplyForm } from "@/components/seller/stock-views";
import { cn } from "@/lib/cn";

export default async function SellerStockPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; q?: string; low?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const { shop } = await requireShop("/seller/stock");
  const t = await getTranslations("sellerStock");
  const tab = sp.tab === "supplies" ? "supplies" : "stock";
  const page = Math.max(1, Number(sp.page) || 1);
  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Link href="/seller/scan" className={buttonClasses("outline", "sm")}>
            <ScanLine className="h-4 w-4" /> {t("scanner")}
          </Link>
        }
      />
      <nav className="flex gap-1 border-b border-border" aria-label={t("title")}>
        {(["stock", "supplies"] as const).map((k) => (
          <Link key={k} href={`/seller/stock?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold", tab === k ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>
            {t(`tabs.${k}`)}
          </Link>
        ))}
      </nav>
      {tab === "stock" ? (
        <StockTab shopId={shop.id} q={sp.q} low={sp.low === "1"} page={page} t={t} />
      ) : (
        <SuppliesTab shopId={shop.id} />
      )}
    </div>
  );
}

async function StockTab({ shopId, q, low, page, t }: { shopId: string; q?: string; low: boolean; page: number; t: Awaited<ReturnType<typeof getTranslations<"sellerStock">>> }) {
  const data = await stockOverview(shopId, { q, low, page });
  return (
    <>
      <form method="get" className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="tab" value="stock" />
        <label className="relative w-full max-w-sm">
          <span className="sr-only">{t("search")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder={t("search")} className="h-10 w-full rounded-[12px] border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="low" value="1" defaultChecked={low} className="h-4 w-4 accent-[#C8102E]" /> {t("lowOnly")}
        </label>
        <button type="submit" className={buttonClasses("secondary", "sm", "h-10")}>
          {t("apply")}
        </button>
      </form>
      <StockTable data={data} />
      <Pagination page={page} total={data.total} pageSize={30} />
    </>
  );
}

async function SuppliesTab({ shopId }: { shopId: string }) {
  const [supplies, warehouses, variants] = await Promise.all([
    listSupplies(shopId),
    db.warehouse.findMany({ where: { type: "PLATFORM", isActive: true }, select: { id: true, name: true } }),
    db.variant.findMany({ where: { product: { shopId, deletedAt: null } }, select: { id: true, sku: true, titleUz: true, product: { select: { titleUz: true, fulfillment: true } } }, orderBy: { sku: "asc" } }),
  ]);
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <SuppliesList rows={supplies} demo={env().DEMO_MODE} />
      <SupplyForm warehouses={warehouses} variants={variants.sort((a, b) => Number(b.product.fulfillment === "FBO") - Number(a.product.fulfillment === "FBO")).map((v) => ({ id: v.id, label: `${v.sku} — ${v.product.titleUz}${v.titleUz ? ` · ${v.titleUz}` : ""}${v.product.fulfillment === "FBO" ? " (FBO)" : ""}` }))} />
    </div>
  );
}
