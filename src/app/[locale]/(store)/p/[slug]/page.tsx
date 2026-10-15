import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import Image from "next/image";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { BadgeCheck, MessageCircle, Package, ShieldCheck, Star, Store, Truck, Zap, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { anonId } from "@/server/services/home";
import { alsoBought, cardsByIds, categoryBySlug, getPlans, getProduct, priceHistory, recentlyViewedIds, recordView, similarProducts } from "@/server/services/catalog";
import { ProductHero } from "@/components/product/product-hero";
import { PriceHistory } from "@/components/product/price-history";
import { SizeGuide } from "@/components/product/size-guide";
import { ProductRail } from "@/components/product/product-grid";
import { Breadcrumbs } from "@/components/catalog/listing";
import { Stars } from "@/components/product/rating";
import { Badge, Card } from "@/components/ui/display";
import { JsonLd, breadcrumbLd } from "@/components/seo/json-ld";
import { ProductReviewsSection } from "@/components/reviews/product-section";
import { loc, locText } from "@/lib/localized";
import { formatUZS } from "@/lib/money";
import { estimateDelivery, deliveryDays, FREE_DELIVERY_THRESHOLD } from "@/lib/delivery";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await getProduct(slug);
  if (!p) return {};
  const title = loc(p, "title", locale);
  const description = loc(p, "description", locale).slice(0, 160);
  const image = p.media.find((m) => m.type === "IMAGE")?.url;
  return {
    title,
    description,
    alternates: { canonical: `/p/${slug}`, languages: { uz: `/p/${slug}`, "uz-Cyrl": `/oz/p/${slug}`, ru: `/ru/p/${slug}` } },
    openGraph: { title, description, type: "website", images: [`/p/${slug}/opengraph-image`, ...(image ? [image] : [])] },
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const p = await getProduct(slug);
  if (!p) notFound();
  const t = await getTranslations("product");
  const tn = await getTranslations("nav");
  const tcat = await getTranslations("catalog");
  const format = await getFormatter();
  const user = await getCurrentUser();
  const aid = await anonId();
  after(() => recordView(p.id, user?.id ?? null, aid));

  const defaultVariant = p.variants[0];
  const [plans, cat, history, similar, also, recentIds, alerts] = await Promise.all([
    getPlans(),
    categoryBySlug(p.category.slug),
    priceHistory(defaultVariant.id),
    similarProducts(p, locale),
    alsoBought(p.id, p.shopId, locale),
    recentlyViewedIds(user?.id ?? null, aid, p.id, 10),
    user ? db.productAlert.findMany({ where: { userId: user.id, productId: p.id, notifiedAt: null }, select: { type: true } }) : [],
  ]);
  const recent = await cardsByIds(recentIds, locale);

  const title = loc(p, "title", locale);
  const campaign = p.campaignItems[0];
  const specs = (p.specs as Array<{ keyUz: string; keyRu: string; value: string }> | null) ?? [];
  const nasiyaEligible = p.nasiyaEligible ?? p.category.nasiyaEligible;
  // Size guide from the product's category or its nearest ancestor that defines one.
  const pathCats = cat ? await db.category.findMany({ where: { slug: { in: cat.path.map((c) => c.slug) } }, select: { slug: true, sizeGuide: true } }) : [];
  const sizeGuide = ([...(cat?.path ?? [])].reverse().map((c) => pathCats.find((x) => x.slug === c.slug)?.sizeGuide).find(Boolean) ?? null) as { headers: string[]; rows: string[][] } | null;

  // Delivery ETA for Tashkent by default (region is chosen at checkout).
  const region = "toshkent_sh";
  const etaLabel = (method: "COURIER" | "PICKUP" | "EXPRESS") => {
    const days = deliveryDays(p.fulfillment, region, method);
    if (days === 0) return t("deliveryToday");
    if (days === 1) return t("deliveryTomorrow");
    return format.dateTime(estimateDelivery(p.fulfillment, region, method), { day: "numeric", month: "long" });
  };

  const base = process.env.APP_URL ?? "";
  const crumbs = [{ href: "/", label: tn("home") }, ...(cat?.path ?? []).map((c) => ({ href: `/c/${c.slug}`, label: loc(c, "name", locale) })), { label: title }];
  const price = campaign ? Math.min(campaign.salePrice, p.price) : p.price;
  const inStock = p.variants.some((v) => v.stock > 0);

  return (
    <div className="container-page py-5">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: title,
          description: loc(p, "description", locale),
          image: p.media.filter((m) => m.type === "IMAGE").map((m) => `${base}${m.url}`),
          sku: defaultVariant.sku,
          brand: p.brand ? { "@type": "Brand", name: p.brand.name } : undefined,
          aggregateRating: p.reviewCount ? { "@type": "AggregateRating", ratingValue: p.rating.toFixed(1), reviewCount: p.reviewCount } : undefined,
          offers: {
            "@type": "Offer",
            priceCurrency: "UZS",
            price,
            availability: inStock ? "https://schema.org/InStock" : p.isPreorder ? "https://schema.org/PreOrder" : "https://schema.org/OutOfStock",
            url: `${base}/p/${p.slug}`,
            seller: { "@type": "Organization", name: p.shop.name },
            itemCondition: p.condition === "NEW" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
          },
        }}
      />
      <JsonLd data={breadcrumbLd(crumbs.map((c) => ({ name: c.label, url: `${base}${c.href ?? `/p/${slug}`}` })))} />
      <Breadcrumbs items={crumbs} />

      <ProductHero
        gallery={p.media.map((m) => ({ type: m.type, url: m.url, alt: title }))}
        title={
          <div>
            {p.brand && (
              <Link href={`/brand/${p.brand.slug}`} className="text-sm font-bold text-brand-ink hover:underline">
                {p.brand.name}
              </Link>
            )}
            <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight md:text-[28px]">{title}</h1>
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {p.reviewCount > 0 && (
              <a href="#reviews" className="flex items-center gap-1.5 font-semibold">
                <Stars value={p.rating} /> {p.rating.toFixed(1)} <span className="font-normal text-muted">({p.reviewCount})</span>
              </a>
            )}
            <span className="text-muted">{t("sold", { count: p.soldCount })}</span>
            <div className="flex flex-wrap gap-1.5">
              {p.isHalal && <Badge tone="success">{t("halal")}</Badge>}
              {p.madeInUz && <Badge tone="info">🇺🇿 {t("madeInUz")}</Badge>}
              {p.condition !== "NEW" && (
                <Badge tone="dark">
                  {t("condition")}: {t(`condition${p.condition}` as "conditionUSED_A")}
                </Badge>
              )}
              {p.fulfillment === "FBO" && (
                <Badge tone="primary">
                  <Zap className="h-3 w-3" /> {t("fast")}
                </Badge>
              )}
            </div>
          </div>
        }
        buy={{
          product: {
            id: p.id,
            slug: p.slug,
            title,
            isPreorder: p.isPreorder,
            preorderDate: p.preorderDate?.toISOString() ?? null,
            nasiyaEligible,
            lowest90: p.lowest90,
            wholesale: (p.wholesaleTiers as Array<{ minQty: number; price: number }> | null) ?? null,
          },
          variants: p.variants.map((v) => ({ id: v.id, title: locale === "ru" ? v.titleRu || title : locText(v.titleUz, locale) || title, price: v.price, oldPrice: v.oldPrice, stock: v.stock, image: v.imageUrl })),
          plans,
          campaign: campaign ? { salePrice: campaign.salePrice, endsAt: campaign.campaign.endsAt.toISOString(), name: loc(campaign.campaign, "name", locale) } : null,
          alerts: { priceDrop: alerts.some((a) => a.type === "PRICE_DROP"), backInStock: alerts.some((a) => a.type === "BACK_IN_STOCK") },
        }}
        aside={
          <div className="space-y-4">
            {sizeGuide && <SizeGuide guide={sizeGuide} />}
            <Card className="space-y-3 p-4">
              <h2 className="flex items-center gap-2 font-bold">
                <Truck className="h-5 w-5 text-primary" /> {t("deliveryTitle")}
              </h2>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between gap-2">
                  <span className="text-muted">{t("courier")}</span>
                  <span className="font-semibold">{etaLabel("COURIER")}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="flex items-center gap-1 text-muted">
                    <MapPin className="h-3.5 w-3.5" /> <Link href="/pvz">{t("pickupPoint")}</Link>
                  </span>
                  <span className="font-semibold">{etaLabel("PICKUP")}</span>
                </li>
                {p.fulfillment === "FBO" && (
                  <li className="flex justify-between gap-2">
                    <span className="text-muted">{t("express")}</span>
                    <span className="font-semibold">{t("deliveryToday")}</span>
                  </li>
                )}
              </ul>
              <p className="text-xs text-muted">
                {t("freeFrom", { amount: formatUZS(FREE_DELIVERY_THRESHOLD, locale) })} · {t(`fulfillment${p.fulfillment}`)}
              </p>
            </Card>
            <Card className="p-4">
              <Link href={`/shop/${p.shop.slug}`} className="flex items-center gap-3">
                {p.shop.logoUrl ? <Image src={p.shop.logoUrl} alt="" width={48} height={48} className="h-12 w-12 rounded-[12px] object-cover" /> : <Store className="h-12 w-12" />}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-bold">
                    {locText(p.shop.name, locale)} {p.shop.isOfficial && <BadgeCheck className="h-4 w-4 text-info" aria-label={t("official")} />}
                  </p>
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <span className="flex items-center gap-0.5">
                      <Star className="h-3.5 w-3.5 text-accent" fill="currentColor" strokeWidth={0} /> {p.shop.rating.toFixed(1)}
                    </span>
                    · {t("fulfillmentScore")} {Math.round(p.shop.fulfillmentScore)}%
                  </p>
                </div>
              </Link>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href={`/shop/${p.shop.slug}`} className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-surface-3 text-sm font-bold">
                  <Package className="h-4 w-4" /> {t("goToShop")}
                </Link>
                <Link href={`/chat/new?shop=${p.shop.id}&product=${p.id}`} className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-surface-3 text-sm font-bold">
                  <MessageCircle className="h-4 w-4" /> {t("askSeller")}
                </Link>
              </div>
            </Card>
            <p className="flex items-start gap-2 text-sm text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {t("warrantyText")}
            </p>
          </div>
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-xl font-extrabold">{t("description")}</h2>
            <p className="whitespace-pre-line text-[15px] leading-relaxed">{loc(p, "description", locale)}</p>
          </Card>
          {specs.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-xl font-extrabold">{t("specs")}</h2>
              <dl className="divide-y divide-border">
                {specs.map((s) => (
                  <div key={s.keyUz} className="grid grid-cols-2 gap-4 py-2.5 text-[15px]">
                    <dt className="text-muted">{locale === "ru" ? s.keyRu : locText(s.keyUz, locale)}</dt>
                    <dd className="font-medium">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
          <ProductReviewsSection productId={p.id} productSlug={p.slug} />
        </div>
        <div>
          {history.length > 1 && (
            <Card className="p-5">
              <h2 className="mb-1 text-lg font-extrabold">{t("priceHistory")}</h2>
              <p className="mb-3 text-sm text-muted">
                {t("lowest90")}: <b className="text-fg">{formatUZS(Math.min(...history.map((h) => h.price)), locale)}</b>
              </p>
              <PriceHistory points={history.map((h) => ({ price: h.price, at: h.recordedAt.toISOString() }))} />
            </Card>
          )}
        </div>
      </div>

      <ProductRail items={also} title={t("alsoBought")} />
      <ProductRail items={similar} title={t("similar")} href={`/c/${p.category.slug}`} more={tcat("title")} />
      <ProductRail items={recent} title={(await getTranslations("home"))("recentlyViewed")} />
    </div>
  );
}
