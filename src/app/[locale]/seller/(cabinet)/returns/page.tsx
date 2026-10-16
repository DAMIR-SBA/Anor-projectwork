import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { listSellerReturns } from "@/server/services/seller/orders";
import { PageHeader } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { ReturnsBoard } from "@/components/seller/returns-board";
import { cn } from "@/lib/cn";

const TABS = ["open", "disputed", "closed"] as const;

export default async function SellerReturnsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const { shop } = await requireShop("/seller/returns");
  const t = await getTranslations("sellerReturns");
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "open";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listSellerReturns(shop.id, tab, page);
  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <nav className="flex gap-1 border-b border-border" aria-label={t("title")}>
        {TABS.map((k) => {
          const n = k === "open" ? data.counts.open : k === "disputed" ? data.counts.disputed : 0;
          return (
            <Link key={k} href={`/seller/returns?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold", tab === k ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>
              {t(`tabs.${k}`)} {n ? <span className="rounded-full bg-surface-3 px-1.5 text-xs text-fg">{n}</span> : null}
            </Link>
          );
        })}
      </nav>
      <ReturnsBoard rows={data.items} />
      <Pagination page={page} total={data.total} pageSize={20} />
    </div>
  );
}
