import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { categoryBySlug } from "@/server/services/catalog";
import { Breadcrumbs, CatalogListing, type SearchParams } from "@/components/catalog/listing";
import { JsonLd, breadcrumbLd } from "@/components/seo/json-ld";
import { loc } from "@/lib/localized";

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const cat = await categoryBySlug(slug);
  if (!cat) return {};
  const name = loc(cat, "name", locale);
  return { title: name, description: `${name} — ANOR`, alternates: { canonical: `/c/${slug}` }, openGraph: { title: name } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const cat = await categoryBySlug(slug);
  if (!cat || !cat.isActive) notFound();
  const t = await getTranslations("catalog");
  const tn = await getTranslations("nav");
  const base = process.env.APP_URL ?? "";
  const crumbs = [{ href: "/", label: tn("home") }, { href: "/catalog", label: t("title") }, ...cat.path.map((p, i) => ({ href: i < cat.path.length - 1 ? `/c/${p.slug}` : undefined, label: loc(p, "name", locale) }))];
  return (
    <div className="container-page py-5">
      <JsonLd data={breadcrumbLd(crumbs.map((c) => ({ name: c.label, url: `${base}${c.href ?? `/c/${slug}`}` })))} />
      <Breadcrumbs items={crumbs} />
      <h1 className="mb-3 text-2xl font-extrabold tracking-tight md:text-3xl">{loc(cat, "name", locale)}</h1>
      {cat.children.length > 0 && (
        <nav aria-label={t("subcategories")} className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {cat.children.map((c) => (
            <Link key={c.id} href={`/c/${c.slug}`} className="shrink-0 rounded-full bg-surface px-4 py-2 text-sm font-semibold shadow-[var(--shadow-soft)] hover:text-primary">
              {loc(c, "name", locale)}
            </Link>
          ))}
        </nav>
      )}
      <CatalogListing base={{ category: slug }} searchParams={await searchParams} />
    </div>
  );
}
