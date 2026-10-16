import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { after } from "next/server";
import { categorySubtree, facets as getFacets, listProducts, type Filters, type Sort } from "@/server/services/catalog";
import { recordImpressions, sponsoredCards } from "@/server/services/ads";
import { applyExperiments, recordExperimentImpressions } from "@/server/services/experiments";
import { anonId } from "@/server/services/home";
import { InfiniteGrid } from "@/components/product/infinite-grid";
import { CatalogFilters, SortSelect } from "./filters";
import { EmptyState } from "@/components/ui/display";
import { Link } from "@/i18n/navigation";

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export function filtersFromParams(sp: SearchParams): Filters {
  const num = (k: string) => (one(sp[k]) ? Number(one(sp[k])) : undefined);
  return {
    q: one(sp.q),
    brands: many(sp.brand),
    minPrice: num("min"),
    maxPrice: num("max"),
    rating: num("rating"),
    inStock: one(sp.stock) === "1",
    delivery: one(sp.delivery) as Filters["delivery"],
    halal: one(sp.halal) === "1",
    madeInUz: one(sp.uz) === "1",
    used: one(sp.used) === "1",
    sort: one(sp.sort) as Sort | undefined,
  };
}

/** Query string for /api/v1/products that reproduces base + URL filters (for infinite scroll). */
function apiQuery(base: Filters, sp: SearchParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const val of many(v)) if (k !== "page") q.append(k, val);
  if (base.category) q.set("category", base.category);
  if (base.shopSlug) q.set("shop", base.shopSlug);
  if (base.brandSlug) q.set("brandSlug", base.brandSlug);
  if (base.madeInUz) q.set("uz", "1");
  if (base.halal) q.set("halal", "1");
  if (base.ids) q.set("ids", base.ids.join(","));
  if (base.sort && !q.get("sort")) q.set("sort", base.sort);
  return q.toString();
}

export async function CatalogListing({ base, searchParams, header, emptyExtra }: { base: Filters; searchParams: SearchParams; header?: ReactNode; emptyExtra?: ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("catalog");
  const filters: Filters = { ...filtersFromParams(searchParams), ...stripUndefined(base) };
  if (one(searchParams.sort)) filters.sort = one(searchParams.sort) as Sort;
  const pageSize = 20;
  const [data, facets] = await Promise.all([listProducts({ ...filters, page: 1, pageSize }, locale), getFacets(filters)]);
  // Sponsored slots (first page only): search keywords or the category being browsed. Labelled "Reklama".
  const adContext = filters.q?.trim() ? ({ placement: "SEARCH", query: filters.q } as const) : filters.category ? ({ placement: "CATEGORY", categoryIds: (await categorySubtree(filters.category)) ?? [] } as const) : null;
  const ads = adContext && data.items.length ? await sponsoredCards(adContext, locale, data.items.slice(0, 4).map((p) => p.id)).catch(() => []) : [];
  if (ads.length) after(() => recordImpressions(ads.map((a) => a.campaignId)));
  const merged = ads.length ? [ads[0], ...data.items.slice(0, 5).filter((p) => !ads.some((a) => a.id === p.id)), ...ads.slice(1), ...data.items.slice(5).filter((p) => !ads.some((a) => a.id === p.id))] : data.items;
  // Seller A/B tests (title/photo) are served on the first, server-rendered page.
  const ab = await applyExperiments(merged, await anonId(), locale).catch(() => ({ cards: merged, shown: [] }));
  if (ab.shown.length) after(() => recordExperimentImpressions(ab.shown));
  const initial = ab.cards;
  return (
    <div className="flex gap-6">
      <CatalogFilters facets={facets} mode="desktop" />
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <CatalogFilters facets={facets} mode="mobile" />
            <p className="text-sm text-muted">{t("productsCount", { count: data.total })}</p>
          </div>
          <SortSelect />
        </div>
        {header}
        {data.items.length ? (
          <InfiniteGrid initial={initial} total={data.total} query={apiQuery(base, searchParams)} pageSize={pageSize} />
        ) : (
          <EmptyState icon={<SearchX className="h-8 w-8" />} title={t("emptyTitle")} description={t("emptyText")} action={emptyExtra} className="card" />
        )}
      </div>
    </div>
  );
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== false && !(Array.isArray(v) && !v.length))) as Partial<T>;
}

export function Breadcrumbs({ items }: { items: Array<{ href?: string; label: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>/</span>}
            {it.href ? <BreadcrumbLink href={it.href}>{it.label}</BreadcrumbLink> : <span aria-current="page" className="text-fg">{it.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function BreadcrumbLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="hover:text-fg">
      {children}
    </Link>
  );
}
