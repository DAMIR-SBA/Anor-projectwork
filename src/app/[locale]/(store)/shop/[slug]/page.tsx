import { notFound } from "next/navigation";
import Image from "next/image";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { BadgeCheck, MapPin, Star, Clock, Package } from "lucide-react";
import { db } from "@/server/db";
import { CatalogListing, type SearchParams } from "@/components/catalog/listing";
import { Badge } from "@/components/ui/display";
import { loc, locText } from "@/lib/localized";

type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props) {
  const { slug, locale } = await params;
  const shop = await db.shop.findUnique({ where: { slug } });
  return shop ? { title: shop.name, description: loc(shop, "description", locale).slice(0, 160) } : {};
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const shop = await db.shop.findUnique({ where: { slug }, include: { _count: { select: { products: { where: { status: "ACTIVE" } } } } } });
  if (!shop || shop.status !== "APPROVED") notFound();
  const t = await getTranslations("product");
  const format = await getFormatter();
  return (
    <div className="container-page py-5">
      <header className="card mb-5 overflow-hidden">
        {shop.bannerUrl && (
          <div className="relative h-28 md:h-40">
            <Image src={shop.bannerUrl} alt="" fill className="object-cover" sizes="100vw" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4 p-5">
          {shop.logoUrl && <Image src={shop.logoUrl} alt="" width={72} height={72} className="-mt-12 h-[72px] w-[72px] rounded-2xl border-4 border-surface object-cover" />}
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-extrabold">
              {locText(shop.name, locale)} {shop.isOfficial && <BadgeCheck className="h-6 w-6 text-info" aria-label={t("official")} />}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 text-accent" fill="currentColor" strokeWidth={0} /> <b className="text-fg">{shop.rating.toFixed(1)}</b> ({shop.reviewCount})
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {shop.city}
              </span>
              <span className="flex items-center gap-1">
                <Package className="h-4 w-4" /> {t("productsInShop", { count: shop._count.products })}
              </span>
              {shop.responseTimeMins && (
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" /> ~{shop.responseTimeMins} min
                </span>
              )}
              <span>{format.dateTime(shop.createdAt, { year: "numeric", month: "long" })}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {shop.isOfficial && <Badge tone="info">{t("official")}</Badge>}
            <Badge tone="success">
              {t("fulfillmentScore")}: {Math.round(shop.fulfillmentScore)}%
            </Badge>
          </div>
        </div>
        {loc(shop, "description", locale) && <p className="border-t border-border px-5 py-4 text-[15px] text-muted">{loc(shop, "description", locale)}</p>}
      </header>
      <CatalogListing base={{ shopSlug: slug }} searchParams={await searchParams} />
    </div>
  );
}
