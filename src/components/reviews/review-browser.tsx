"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Camera, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/display";
import { Stars } from "@/components/product/rating";
import { ReviewCard } from "./review-card";
import { MediaLightbox, MediaThumb, type MediaItem } from "./media-lightbox";
import { loadReviewsAction } from "@/server/actions/reviews";
import type { ReviewSort, ReviewView } from "@/server/services/review-queries";
import { cn } from "@/lib/cn";

type Stats = {
  rating: number;
  count: number;
  breakdown: Record<string, number>;
  withMedia: number;
  variants: Array<{ id: string; title: string; count: number }>;
  media: Array<MediaItem & { reviewId: string }>;
};

type Filters = { sort: ReviewSort; rating?: number; media?: boolean; variantId?: string };

export function ReviewBrowser({ productId, stats, initial, signedIn, summary, cta }: { productId: string; stats: Stats; initial: { items: ReviewView[]; total: number; hasMore: boolean }; signedIn: boolean; summary: ReactNode; cta: ReactNode }) {
  const t = useTranslations("reviews");
  const [filters, setFilters] = useState<Filters>({ sort: "helpful" });
  const [list, setList] = useState(initial);
  const [page, setPage] = useState(1);
  const [pending, start] = useTransition();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = (next: Filters, nextPage: number) =>
    start(async () => {
      const res = await loadReviewsAction({ productId, ...next, page: nextPage });
      if (!res.ok || !res.data) return;
      const data = res.data as typeof initial;
      setList((prev) => (nextPage === 1 ? data : { ...data, items: [...prev.items, ...data.items] }));
      setPage(nextPage);
    });

  const apply = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    load(next, 1);
    if (patch.rating !== undefined || patch.media !== undefined) listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filtered = !!(filters.rating || filters.media || filters.variantId);
  const max = Math.max(1, ...Object.values(stats.breakdown));

  return (
    <div>
      {stats.count > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
          <div>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-extrabold leading-none tracking-tight">{stats.rating.toFixed(1)}</span>
              <div className="pb-1">
                <Stars value={stats.rating} size={18} />
                <p className="mt-1 text-[13px] text-muted">{t("basedOn", { count: stats.count })}</p>
              </div>
            </div>
            <ul className="mt-4 space-y-1">
              {[5, 4, 3, 2, 1].map((n) => {
                const c = stats.breakdown[String(n)] ?? 0;
                const active = filters.rating === n;
                return (
                  <li key={n}>
                    <button
                      type="button"
                      disabled={!c}
                      onClick={() => apply({ rating: active ? undefined : n })}
                      aria-pressed={active}
                      className={cn("grid w-full grid-cols-[28px_1fr_36px] items-center gap-2 rounded-[8px] px-1.5 py-1 text-[13px] hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent", active && "bg-surface-3")}
                    >
                      <span className="flex items-center gap-0.5 font-semibold">
                        <span aria-hidden="true">{n}</span> <Star className="h-3 w-3 text-accent" fill="currentColor" strokeWidth={0} aria-hidden="true" />
                        <span className="sr-only">{t("filterRating", { n })}:</span>
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${(c / max) * 100}%` }} />
                      </span>
                      <span className="text-right tabular-nums text-muted">{c}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">{cta}</div>
          </div>
          <div className="min-w-0 space-y-4">
            {summary}
            {stats.media.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                  <Camera className="h-4 w-4" /> {t("photosFromBuyers")}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {stats.media.slice(0, 12).map((m, i) => (
                    <MediaThumb key={m.url + i} item={m} size={80} onClick={() => setLightbox(i)} label={t("photoN", { n: i + 1 })} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <EmptyState icon={<Star className="h-7 w-7" />} title={t("noReviews")} description={t("noReviewsText")} action={cta} />
      )}

      {stats.count > 0 && (
        <>
          <div ref={listRef} className="scroll-mt-24" />
          <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-border pb-4">
            <label className="sr-only" htmlFor="review-sort">
              {t("sort")}
            </label>
            <Select id="review-sort" className="h-9 w-auto min-w-[150px] text-sm" value={filters.sort} onChange={(e) => apply({ sort: e.target.value as ReviewSort })}>
              <option value="helpful">{t("sortHelpful")}</option>
              <option value="new">{t("sortNew")}</option>
              <option value="high">{t("sortHigh")}</option>
              <option value="low">{t("sortLow")}</option>
            </Select>
            {stats.withMedia > 0 && (
              <button type="button" aria-pressed={!!filters.media} onClick={() => apply({ media: !filters.media })} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold", filters.media ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-surface-2")}>
                <Camera className="h-4 w-4" /> {t("filterMedia")} <span className="text-muted">{stats.withMedia}</span>
              </button>
            )}
            {stats.variants.length > 1 && (
              <Select aria-label={t("filterVariant")} className="h-9 w-auto max-w-[220px] text-sm" value={filters.variantId ?? ""} onChange={(e) => apply({ variantId: e.target.value || undefined })}>
                <option value="">{t("allVariants")}</option>
                {stats.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} ({v.count})
                  </option>
                ))}
              </Select>
            )}
            {filters.rating && (
              <button type="button" onClick={() => apply({ rating: undefined })} className="inline-flex h-9 items-center gap-1 rounded-full bg-surface-3 px-3 text-sm font-semibold">
                {t("filterRating", { n: filters.rating })} <X className="h-3.5 w-3.5" />
              </button>
            )}
            {filtered && (
              <button type="button" onClick={() => apply({ rating: undefined, media: false, variantId: undefined })} className="text-sm font-semibold text-primary hover:underline">
                {t("clearFilters")}
              </button>
            )}
          </div>

          <div className={cn("divide-y divide-border pt-5 transition-opacity", pending && page === 1 && "opacity-50")} aria-busy={pending}>
            {list.items.length ? list.items.map((r) => <ReviewCard key={r.id} review={r} signedIn={signedIn} />) : <p className="py-8 text-center text-muted">{t("noMatches")}</p>}
          </div>
          {list.hasMore && (
            <div className="mt-2 text-center">
              <Button variant="outline" loading={pending && page >= 1} onClick={() => load(filters, page + 1)}>
                {t("showMore")}
              </Button>
            </div>
          )}
        </>
      )}
      {lightbox !== null && <MediaLightbox items={stats.media} index={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
