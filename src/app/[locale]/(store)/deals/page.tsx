import { getTranslations, setRequestLocale } from "next-intl/server";
import { Zap } from "lucide-react";
import { db } from "@/server/db";
import { Link } from "@/i18n/navigation";
import { Countdown } from "@/components/ui/interactive";
import { CatalogListing, type SearchParams } from "@/components/catalog/listing";
import { loc } from "@/lib/localized";

export async function generateMetadata() {
  const t = await getTranslations("nav");
  return { title: t("deals") };
}

export default async function DealsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("nav");
  const now = new Date();
  const campaigns = await db.campaign.findMany({ where: { status: { in: ["ACTIVE", "SCHEDULED"] }, endsAt: { gt: now } }, orderBy: { startsAt: "asc" }, take: 6 });
  const sp = await searchParams;
  return (
    <div className="container-page py-5">
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">{t("deals")}</h1>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((c) => {
          const live = c.startsAt <= now;
          return (
            <Link key={c.id} href={`/campaign/${c.slug}`} className="relative overflow-hidden rounded-[18px] p-5 text-white" style={{ background: c.themeColor }}>
              <p className="flex w-fit items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-[#1A1A1F]">
                <Zap className="h-3.5 w-3.5" /> {c.type.replace("_", " ")}
              </p>
              <h2 className="mt-1 text-xl font-extrabold">{loc(c, "name", locale)}</h2>
              <p className="mt-3 text-sm font-semibold text-white/90">
                {live ? <Countdown to={c.endsAt.toISOString()} labels={{ d: "d" }} /> : c.startsAt.toLocaleDateString(locale === "ru" ? "ru-RU" : "uz-UZ", { timeZone: "Asia/Tashkent", day: "numeric", month: "long" })}
              </p>
              <span aria-hidden className="absolute -bottom-8 -right-8 h-28 w-28 rounded-full bg-white/10" />
            </Link>
          );
        })}
      </div>
      <CatalogListing base={{ sort: "discount" }} searchParams={sp} />
    </div>
  );
}
