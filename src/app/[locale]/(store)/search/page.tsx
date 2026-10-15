import { getTranslations, setRequestLocale } from "next-intl/server";
import { after } from "next/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { anonId } from "@/server/services/home";
import { listProducts, suggestCorrection } from "@/server/services/catalog";
import { CatalogListing, filtersFromParams, type SearchParams } from "@/components/catalog/listing";
import { normalizeSearch } from "@/lib/search-text";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations("catalog");
  const q = String((await searchParams).q ?? "");
  return { title: t("searchTitle", { q }), robots: { index: false } };
}

export default async function SearchPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const q = String(sp.q ?? "").slice(0, 100);
  const t = await getTranslations("catalog");
  const quick = await listProducts({ ...filtersFromParams(sp), q, pageSize: 1 }, locale);
  const correction = quick.total === 0 ? await suggestCorrection(q) : null;
  const user = await getCurrentUser();
  const aid = await anonId();
  // Search history + trending queries are logged after the response is sent.
  after(async () => {
    const nq = normalizeSearch(q);
    if (nq.length >= 2) await db.searchQuery.create({ data: { query: nq, resultsCount: quick.total, userId: user?.id, anonId: user ? null : aid } });
  });
  return (
    <div className="container-page py-5">
      <h1 className="mb-3 text-2xl font-extrabold tracking-tight">{t("searchTitle", { q })}</h1>
      {correction && (
        <p className="mb-4 text-[15px]">
          {t.rich("didYouMean", {
            term: () => (
              <Link href={`/search?q=${encodeURIComponent(correction)}`} className="font-bold text-brand-ink underline">
                {correction}
              </Link>
            ),
          })}
        </p>
      )}
      <CatalogListing base={{ q }} searchParams={sp} />
    </div>
  );
}
