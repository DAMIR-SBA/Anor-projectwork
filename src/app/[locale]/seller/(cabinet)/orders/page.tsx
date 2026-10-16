import { getTranslations, setRequestLocale } from "next-intl/server";
import { Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { listSellerOrders, type OrderTab } from "@/server/services/seller/orders";
import { PageHeader } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { OrdersBoard } from "@/components/seller/orders-board";
import { cn } from "@/lib/cn";

const TABS: OrderTab[] = ["new", "confirmed", "packed", "shipped", "delivered", "cancelled", "all"];

export default async function SellerOrdersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const { shop } = await requireShop("/seller/orders");
  const t = await getTranslations("sellerOrders");
  const tab = (TABS as string[]).includes(sp.tab ?? "") ? (sp.tab as OrderTab) : "new";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listSellerOrders(shop.id, tab, { q: sp.q, page });
  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label={t("title")}>
        {TABS.map((k) => {
          const n = (data.counts as Record<string, number>)[k];
          return (
            <Link key={k} href={`/seller/orders?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold", tab === k ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>
              {t(`tabs.${k}`)} {n ? <span className={cn("rounded-full px-1.5 text-xs", k === "new" ? "bg-primary text-white" : "bg-surface-3 text-fg")}>{n}</span> : null}
            </Link>
          );
        })}
      </nav>
      <form method="get" className="relative max-w-sm">
        <input type="hidden" name="tab" value={tab} />
        <label className="sr-only" htmlFor="o-q">
          {t("search")}
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input id="o-q" name="q" defaultValue={sp.q} placeholder={t("search")} className="h-10 w-full rounded-[12px] border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary" />
      </form>
      <OrdersBoard rows={data.items} />
      <Pagination page={page} total={data.total} pageSize={20} />
    </div>
  );
}
