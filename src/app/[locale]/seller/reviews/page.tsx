import { getTranslations, setRequestLocale } from "next-intl/server";
import { MessageSquareQuote, Reply, Star, Timer } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireSeller } from "@/server/auth/guards";
import { sellerReviews, type SellerReviewTab } from "@/server/services/review-queries";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { SellerReviewItem } from "@/components/seller/review-inbox";
import { cn } from "@/lib/cn";

const TABS: SellerReviewTab[] = ["unanswered", "negative", "removal", "all"];

export default async function SellerReviewsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const { user } = await requireSeller("/seller/reviews");
  const t = await getTranslations("seller.reviews");
  const tab = (TABS as string[]).includes(sp.tab ?? "") ? (sp.tab as SellerReviewTab) : "unanswered";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await sellerReviews(user.id, tab, page, locale);
  const rt = data.stats.responseTimeMins;

  return (
    <div className="max-w-4xl">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label={t("avg")} value={data.stats.avg ? data.stats.avg.toFixed(2) : "—"} hint={`${data.stats.count}`} icon={<Star className="h-5 w-5" />} />
        <StatCard label={t("replyRate")} value={`${Math.round(data.stats.replyRate * 100)}%`} icon={<Reply className="h-5 w-5" />} />
        <StatCard label={t("responseTime")} value={rt == null ? "—" : rt < 120 ? t("minutes", { count: rt }) : t("hours", { count: Math.round(rt / 60) })} icon={<Timer className="h-5 w-5" />} />
      </div>
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label={t("title")}>
        {TABS.map((k) => {
          const n = k === "all" ? null : data.counts[k];
          return (
            <Link key={k} href={`/seller/reviews?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold", tab === k ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>
              {t(`tabs.${k}`)} {n ? <span className="rounded-full bg-surface-3 px-1.5 text-xs text-fg">{n}</span> : null}
            </Link>
          );
        })}
      </nav>
      {data.items.length === 0 ? (
        <EmptyState className="card" icon={<MessageSquareQuote className="h-8 w-8" />} title={t("empty")} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <SellerReviewItem key={r.id} review={r} />
          ))}
        </ul>
      )}
      <Pagination page={page} total={data.total} pageSize={15} />
    </div>
  );
}
