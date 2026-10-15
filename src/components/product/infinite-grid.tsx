"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ProductCard, ProductCardSkeleton } from "./product-card";
import { GRID } from "./grid-class";
import type { ProductCardData } from "@/lib/types";

/** Infinite scroll over /api/v1/products with the current filters (falls back to a button). */
export function InfiniteGrid({ initial, total, query, pageSize }: { initial: ProductCardData[]; total: number; query: string; pageSize: number }) {
  const t = useTranslations("catalog");
  const locale = useLocale();
  const [items, setItems] = useState(initial);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const done = items.length >= total;

  useEffect(() => {
    setItems(initial);
    setPage(1);
  }, [initial, query]);

  const loadMore = async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/products?${query}${query ? "&" : ""}page=${page + 1}&pageSize=${pageSize}&locale=${locale}`);
      const data = (await res.json()) as { items: ProductCardData[] };
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...data.items.filter((p) => !seen.has(p.id))];
      });
      setPage((p) => p + 1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  });

  return (
    <>
      <div className={GRID}>
        {items.map((p, i) => (
          <ProductCard key={p.id} p={p} priority={i < 4} />
        ))}
        {loading && Array.from({ length: 5 }, (_, i) => <ProductCardSkeleton key={`s${i}`} />)}
      </div>
      <div ref={sentinel} className="flex justify-center py-8">
        {done ? (
          items.length > pageSize && <span className="text-sm text-muted">{t("endOfList")}</span>
        ) : (
          <button type="button" onClick={loadMore} className="rounded-[12px] bg-surface px-5 py-2.5 text-sm font-bold shadow-[var(--shadow-soft)] hover:bg-surface-3">
            {t("loadMore")}
          </button>
        )}
      </div>
    </>
  );
}
