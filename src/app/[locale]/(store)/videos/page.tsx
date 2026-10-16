import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Radio, Video } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { videoFeed } from "@/server/services/videos";
import { liveList } from "@/server/services/live";
import { EmptyState } from "@/components/ui/display";
import { VideoFeed } from "@/components/content/video-feed";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "videos" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function VideosPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ v?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("videos");
  const user = await getCurrentUser();
  const [videos, streams] = await Promise.all([videoFeed(locale, user?.id ?? null, { startId: (await searchParams).v }), liveList(locale)]);
  const onAir = streams.find((s) => s.status === "LIVE");
  return (
    <div className="container-page py-4">
      <div className="mx-auto mb-3 flex max-w-[440px] items-center gap-2">
        <h1 className="flex flex-1 items-center gap-2 text-xl font-extrabold">
          <Video className="h-5 w-5 text-primary" aria-hidden="true" /> {t("title")}
        </h1>
        <Link href="/live" className="flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1.5 text-sm font-bold">
          <Radio className="h-4 w-4 text-primary" aria-hidden="true" /> {t("liveTab")}
          {onAir && <span className="h-2 w-2 animate-pulse rounded-full bg-[#C8102E]" aria-label={t("onAir")} />}
        </Link>
      </div>
      {onAir && (
        <Link href={`/live/${onAir.id}`} className="mx-auto mb-3 flex max-w-[440px] items-center gap-2 rounded-[14px] bg-[#C8102E] px-4 py-2.5 text-sm font-bold text-white">
          <span className="rounded bg-white px-1.5 text-[11px] font-extrabold text-[#C8102E]">LIVE</span>
          <span className="line-clamp-1 flex-1">
            {onAir.shop.name}: {onAir.title}
          </span>
          {t("watch")} →
        </Link>
      )}
      {videos.length ? <VideoFeed videos={videos} /> : <EmptyState className="card mx-auto max-w-[440px]" icon={<Video className="h-8 w-8" />} title={t("empty")} />}
    </div>
  );
}
