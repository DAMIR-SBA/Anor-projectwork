import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarClock, Eye, Radio } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { liveList } from "@/server/services/live";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { fmtDateTime } from "@/lib/format-date";
import { cn } from "@/lib/cn";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "live" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function LivePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("live");
  const streams = await liveList(locale);
  return (
    <div className="container-page py-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {streams.length === 0 ? (
        <EmptyState className="card" icon={<Radio className="h-8 w-8" />} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {streams.map((s, i) => (
            <li key={s.id}>
              <Link href={`/live/${s.id}`} className={cn("card block overflow-hidden transition-shadow hover:shadow-md", s.status === "ENDED" && "opacity-75")}>
                <span className="relative block aspect-[16/10] bg-surface-2">
                  {s.posterUrl && <Image src={s.posterUrl} alt="" fill loading={i < 3 ? "eager" : "lazy"} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />}
                  <span className="absolute left-3 top-3 flex items-center gap-1.5">
                    {s.status === "LIVE" ? (
                      <>
                        <span className="rounded bg-[#C8102E] px-2 py-0.5 text-xs font-extrabold text-white">LIVE</span>
                        <span className="flex items-center gap-1 rounded bg-black/55 px-2 py-0.5 text-xs font-bold text-white">
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {s.viewers}
                        </span>
                      </>
                    ) : s.status === "SCHEDULED" ? (
                      <span className="flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> {fmtDateTime(s.startsAt, locale)}
                      </span>
                    ) : (
                      <span className="rounded bg-black/60 px-2 py-0.5 text-xs font-bold text-white">{t("ended")}</span>
                    )}
                  </span>
                </span>
                <span className="block space-y-0.5 p-4">
                  <span className="line-clamp-2 block font-bold">{s.title}</span>
                  <span className="block text-sm text-muted">
                    {s.shop.name} · {t("productsN", { count: s.products })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
