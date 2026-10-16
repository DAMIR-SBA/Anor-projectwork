import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { db } from "@/server/db";
import { Link } from "@/i18n/navigation";
import { CatalogListing, type SearchParams } from "@/components/catalog/listing";
import { loc, locText } from "@/lib/localized";

export async function generateMetadata() {
  const t = await getTranslations("home");
  return { title: t("madeInUz"), description: t("madeInUzText") };
}

export default async function MadeInUzPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const stories = await db.story.findMany({ where: { kind: "ARTISAN" }, include: { shop: true }, take: 3, orderBy: { createdAt: "desc" } });
  return (
    <div className="container-page py-5">
      <header className="mb-5 overflow-hidden rounded-[20px] bg-[#0E6E6E] p-6 text-white md:p-10">
        <p className="text-sm font-bold uppercase tracking-widest text-accent">🇺🇿 Made in Uzbekistan</p>
        <h1 className="mt-2 text-3xl font-extrabold md:text-5xl">{t("madeInUz")}</h1>
        <p className="mt-2 max-w-xl text-white/90">{t("madeInUzText")}</p>
      </header>
      {stories.length > 0 && (
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          {stories.map((s) => (
            <Link key={s.id} href={`/shop/${s.shop.slug}`} className="card flex gap-3 overflow-hidden p-3 hover:shadow-[var(--shadow-lift)]">
              <Image src={s.mediaUrl} alt="" width={96} height={96} className="h-24 w-24 shrink-0 rounded-[12px] object-cover" />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-[#0E6E6E]">{locText(s.shop.name, locale)}</p>
                <h2 className="font-bold leading-tight">{loc(s, "title", locale)}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{loc(s, "body", locale)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      <CatalogListing base={{ madeInUz: true }} searchParams={await searchParams} />
    </div>
  );
}
