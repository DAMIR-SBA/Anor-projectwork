import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { BadgeCheck } from "lucide-react";
import { db } from "@/server/db";
import { CatalogListing, type SearchParams } from "@/components/catalog/listing";
import { loc } from "@/lib/localized";

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props) {
  const brand = await db.brand.findUnique({ where: { slug: (await params).slug } });
  return brand ? { title: brand.name } : {};
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const brand = await db.brand.findUnique({ where: { slug } });
  if (!brand) notFound();
  return (
    <div className="container-page py-5">
      <header className="card mb-5 flex items-center gap-4 p-5">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-2xl font-extrabold">{brand.name[0]}</span>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            {brand.name} {brand.isOfficial && <BadgeCheck className="h-6 w-6 text-info" aria-label="Official" />}
          </h1>
          {loc(brand, "description", locale) && <p className="text-muted">{loc(brand, "description", locale)}</p>}
        </div>
      </header>
      <CatalogListing base={{ brandSlug: slug }} searchParams={await searchParams} />
    </div>
  );
}
