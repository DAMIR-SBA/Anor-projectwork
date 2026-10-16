"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { groupDigits } from "@/lib/money";

type Facets = { brands: Array<{ slug: string; name: string; count: number }>; priceMin: number; priceMax: number };

function useParamsState() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const update = (mutate: (q: URLSearchParams) => void) => {
    const q = new URLSearchParams(sp.toString());
    mutate(q);
    q.delete("page");
    start(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
  };
  return { sp, update, pending };
}

function Toggle({ name, label }: { name: string; label: string }) {
  const { sp, update } = useParamsState();
  const on = sp.get(name) === "1";
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-[15px]">
      {label}
      <input type="checkbox" checked={on} onChange={() => update((q) => (on ? q.delete(name) : q.set(name, "1")))} className="h-5 w-5 accent-[#C8102E]" />
    </label>
  );
}

/** Price inputs start from the URL; the parent remounts them (key) when the URL range changes. */
function PriceRange({ facets, initialMin, initialMax }: { facets: Facets; initialMin: string; initialMax: string }) {
  const t = useTranslations("catalog");
  const { update } = useParamsState();
  const [min, setMin] = useState(initialMin);
  const [max, setMax] = useState(initialMax);
  const applyPrice = () =>
    update((q) => {
      const a = min.replace(/\D/g, "");
      const b = max.replace(/\D/g, "");
      if (a) q.set("min", a);
      else q.delete("min");
      if (b) q.set("max", b);
      else q.delete("max");
    });
  return (
    <fieldset>
      <legend className="mb-2 font-bold">{t("price")}</legend>
      <div className="flex items-center gap-2">
        <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} onBlur={applyPrice} onKeyDown={(e) => e.key === "Enter" && applyPrice()} placeholder={`${t("priceFrom")} ${groupDigits(facets.priceMin)}`} aria-label={t("priceFrom")} className="h-10 w-full min-w-0 rounded-[10px] border border-border bg-surface px-3 text-sm" />
        <span className="text-muted">—</span>
        <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} onBlur={applyPrice} onKeyDown={(e) => e.key === "Enter" && applyPrice()} placeholder={`${t("priceTo")} ${groupDigits(facets.priceMax)}`} aria-label={t("priceTo")} className="h-10 w-full min-w-0 rounded-[10px] border border-border bg-surface px-3 text-sm" />
      </div>
    </fieldset>
  );
}

function FilterBody({ facets }: { facets: Facets }) {
  const t = useTranslations("catalog");
  const { sp, update } = useParamsState();
  const brands = sp.getAll("brand");
  const urlMin = sp.get("min") ?? "";
  const urlMax = sp.get("max") ?? "";

  return (
    <div className="space-y-5">
      <PriceRange key={`${urlMin}|${urlMax}`} facets={facets} initialMin={urlMin} initialMax={urlMax} />
      {facets.brands.length > 0 && (
        <fieldset>
          <legend className="mb-2 font-bold">{t("brand")}</legend>
          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            {facets.brands.map((b) => (
              <label key={b.slug} className="flex cursor-pointer items-center gap-2.5 py-1 text-[15px]">
                <input
                  type="checkbox"
                  className="h-4.5 w-4.5 accent-[#C8102E]"
                  checked={brands.includes(b.slug)}
                  onChange={(e) =>
                    update((q) => {
                      const next = e.target.checked ? [...brands, b.slug] : brands.filter((x) => x !== b.slug);
                      q.delete("brand");
                      next.forEach((x) => q.append("brand", x));
                    })
                  }
                />
                <span className="flex-1">{b.name}</span>
                <span className="text-xs text-muted">{b.count}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-2 font-bold">{t("rating")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {[4.5, 4, 3].map((r) => {
            const on = sp.get("rating") === String(r);
            return (
              <button key={r} type="button" onClick={() => update((q) => (on ? q.delete("rating") : q.set("rating", String(r))))} className={cn("rounded-full border px-3 py-1 text-sm font-semibold", on ? "border-primary bg-primary-50 text-primary dark:bg-primary/15" : "border-border")}>
                ★ {t("ratingFrom", { rating: r })}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-bold">{t("delivery")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {(["today", "tomorrow"] as const).map((d) => {
            const on = sp.get("delivery") === d;
            return (
              <button key={d} type="button" onClick={() => update((q) => (on ? q.delete("delivery") : q.set("delivery", d)))} className={cn("rounded-full border px-3 py-1 text-sm font-semibold", on ? "border-primary bg-primary-50 text-primary dark:bg-primary/15" : "border-border")}>
                {d === "today" ? t("deliveryToday") : t("deliveryTomorrow")}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="space-y-0.5">
        <legend className="mb-1 font-bold">{t("availability")}</legend>
        <Toggle name="stock" label={t("inStock")} />
        <Toggle name="halal" label={t("halal")} />
        <Toggle name="uz" label={t("madeInUz")} />
        <Toggle name="used" label={t("used")} />
      </fieldset>
    </div>
  );
}

const FILTER_KEYS = ["brand", "min", "max", "rating", "stock", "delivery", "halal", "uz", "used"];

export function CatalogFilters({ facets, mode }: { facets: Facets; mode: "desktop" | "mobile" }) {
  const t = useTranslations("catalog");
  const { sp, update } = useParamsState();
  const [open, setOpen] = useState(false);
  const active = FILTER_KEYS.reduce((n, k) => n + sp.getAll(k).length, 0);
  const clear = () => update((q) => FILTER_KEYS.forEach((k) => q.delete(k)));
  if (mode === "desktop")
    return (
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="card sticky top-36 max-h-[calc(100dvh-10rem)] overflow-y-auto p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">{t("filters")}</h2>
            {active > 0 && (
              <button type="button" onClick={clear} className="text-sm font-semibold text-brand-ink">
                {t("clearFilters")}
              </button>
            )}
          </div>
          <FilterBody facets={facets} />
        </div>
      </aside>
    );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-[12px] bg-surface px-3 text-sm font-bold shadow-[var(--shadow-soft)] lg:hidden">
        <SlidersHorizontal className="h-4 w-4" /> {t("filters")} {active > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-white">{active}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label={t("filters")}>
          <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] animate-[slide-up_0.2s_ease-out] flex-col rounded-t-[20px] bg-surface">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-extrabold">{t("filters")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <FilterBody facets={facets} />
            </div>
            <div className="flex gap-2 border-t border-border p-4">
              <button type="button" onClick={clear} className="h-11 flex-1 rounded-[12px] bg-surface-3 font-bold">
                {t("clearFilters")}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="h-11 flex-1 rounded-[12px] bg-primary font-bold text-white">
                {t("showResults")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function SortSelect() {
  const t = useTranslations("catalog");
  const { sp, update } = useParamsState();
  const sorts = ["popular", "new", "price_asc", "price_desc", "rating", "discount"] as const;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-muted sm:inline">{t("sort")}:</span>
      <select aria-label={t("sort")} value={sp.get("sort") ?? "popular"} onChange={(e) => update((q) => (e.target.value === "popular" ? q.delete("sort") : q.set("sort", e.target.value)))} className="h-10 rounded-[12px] border border-border bg-surface px-3 font-semibold">
        {sorts.map((s) => (
          <option key={s} value={s}>
            {t(`sorts.${s}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
