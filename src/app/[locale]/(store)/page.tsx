import { Fragment } from "react";
import { after } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Truck, CalendarClock, Undo2, MapPin, Zap, Timer } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getHomeData } from "@/server/services/home";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { Stories } from "@/components/home/stories";
import { ProductRail, SectionTitle, ProductGrid } from "@/components/product/product-grid";
import { ProductCard } from "@/components/product/product-card";
import { CategoryIcon } from "@/components/catalog/category-icon";
import { Countdown } from "@/components/ui/interactive";
import { loc, locText } from "@/lib/localized";
import { HOME_LAYOUTS } from "@/lib/flags";
import { flagsFor, trackExposures } from "@/server/services/flags";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const tp = await getTranslations("product");
  const [d, { visitor, flags }] = await Promise.all([getHomeData(locale), flagsFor({ "home.layout": false, "home.stories": true, "home.made_in_uz": true })]);
  // A/B: block order comes from the visitor's `home.layout` arm; outside the test it's classic.
  const layout = flags["home.layout"].on ? flags["home.layout"].variant : null;
  const order = HOME_LAYOUTS[layout ?? "classic"] ?? HOME_LAYOUTS.classic;
  after(() => trackExposures(visitor, [{ key: "home.layout", variant: layout }]));

  const perks = [
    { icon: Truck, text: t("perks.delivery") },
    { icon: CalendarClock, text: t("perks.nasiya") },
    { icon: Undo2, text: t("perks.returns") },
    { icon: MapPin, text: t("perks.pickup") },
  ];

  const blocks: Record<string, React.ReactNode> = {
    categories: (
      <section>
        <SectionTitle title={t("categories")} href="/catalog" more={t("seeAll")} />
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-11">
          {d.categories.map((c) => (
            <li key={c.id}>
              <Link
                href={`/c/${c.slug}`}
                className="flex flex-col items-center gap-2 rounded-[14px] bg-surface px-1 py-3 text-center text-xs font-semibold leading-tight hover:shadow-[var(--shadow-soft)] sm:text-[13px]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary dark:bg-primary/15">
                  <CategoryIcon name={c.icon} className="h-6 w-6" />
                </span>
                <span className="line-clamp-2">{loc(c, "name", locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ),
    deal: d.deal && d.deal.cards.length > 0 && (
      <section className="rounded-[20px] bg-gradient-to-br from-primary to-primary-dark p-3 text-white md:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="flex items-center gap-2 text-xl font-extrabold md:text-2xl">
            <Timer className="h-6 w-6 text-accent" /> {t("dealOfDay")}
          </h2>
          <p className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-bold">
            {t("endsIn")} <Countdown to={d.deal.campaign.endsAt.toISOString()} className="text-accent" />
          </p>
        </div>
        <ProductGrid items={d.deal.cards} className="text-fg lg:grid-cols-3 xl:grid-cols-6" />
      </section>
    ),
    flash: d.flash && d.flash.cards.length > 0 && (
      <section>
        <SectionTitle
          title={
            <span className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-accent" /> {loc(d.flash.campaign, "name", locale)}
            </span>
          }
          href={`/campaign/${d.flash.campaign.slug}`}
          more={t("seeAll")}
        />
        <ProductGrid items={d.flash.cards} />
      </section>
    ),
    popular: <ProductRail items={d.popular} title={t("popular")} href="/catalog?sort=popular" more={t("seeAll")} />,
    strip: d.strip && (
      <Link href={d.strip.href} className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] px-6 py-5 text-white" style={{ background: d.strip.bgColor }}>
        <div>
          <p className="text-xl font-extrabold">{loc(d.strip, "title", locale)}</p>
          <p className="text-sm text-white/80">{loc(d.strip, "subtitle", locale)}</p>
        </div>
        <span className="rounded-[12px] bg-accent px-4 py-2 text-sm font-bold text-[#1A1A1F]">ANOR Plus →</span>
      </Link>
    ),
    fresh: <ProductRail items={d.fresh} title={t("newArrivals")} href="/catalog?sort=new" more={t("seeAll")} />,
    madeInUz: (
      <section className="rounded-[20px] bg-[#0E6E6E] p-4 text-white md:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-extrabold md:text-2xl">🇺🇿 {t("madeInUz")}</h2>
            <p className="text-sm text-white/80">{t("madeInUzText")}</p>
          </div>
          <Link href="/made-in-uzbekistan" className="text-sm font-bold text-accent">
            {t("seeAll")} →
          </Link>
        </div>
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 text-fg sm:gap-3 md:mx-0 md:px-0">
          {d.madeInUz.map((p) => (
            <div key={p.id} className="w-[46%] shrink-0 sm:w-[31%] lg:w-[23.5%] xl:w-[18.8%]">
              <ProductCard p={p} />
            </div>
          ))}
        </div>
      </section>
    ),
    recommended: (
      <section>
        <SectionTitle title={t("recommended")} />
        <ProductGrid items={d.recommended} />
      </section>
    ),
    recent: <ProductRail items={d.recent} title={t("recentlyViewed")} />,
  };

  return (
    <div className="container-page space-y-4 py-4 md:space-y-6 md:py-6">
      <HeroCarousel
        slides={d.banners.map((b) => ({ id: b.id, title: loc(b, "title", locale), subtitle: loc(b, "subtitle", locale) || null, href: b.href, image: b.imageUrl, bg: b.bgColor }))}
        labels={{ prev: tc("prev"), next: tc("next") }}
      />

      <ul className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        {perks.map((p) => (
          <li key={p.text} className="flex items-center gap-3 rounded-[14px] bg-surface p-3 text-sm font-semibold">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary dark:bg-primary/15">
              <p.icon className="h-5 w-5" />
            </span>
            {p.text}
          </li>
        ))}
      </ul>

      {flags["home.stories"].on && (
        <Stories
          stories={d.stories.map((s) => ({
            id: s.id,
            shopName: locText(s.shop.name, locale),
            shopSlug: s.shop.slug,
            logo: s.shop.logoUrl,
            title: loc(s, "title", locale),
            body: loc(s, "body", locale) || null,
            media: s.mediaUrl,
            productSlugs: s.productIds,
            artisan: s.kind === "ARTISAN",
          }))}
          labels={{ title: t("sellerStories"), shop: tp("goToShop"), close: tc("close") }}
        />
      )}

      {order.map((key) => (key === "madeInUz" && !flags["home.made_in_uz"].on ? null : <Fragment key={key}>{blocks[key]}</Fragment>))}
    </div>
  );
}
