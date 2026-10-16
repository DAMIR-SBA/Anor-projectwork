import { getTranslations, setRequestLocale } from "next-intl/server";
import { Heart, Video } from "lucide-react";
import { requireShop } from "@/server/auth/guards";
import { db } from "@/server/db";
import { sellerVideos } from "@/server/services/videos";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { VideoForm, VideoRowActions } from "@/components/seller/content-tools";
import { fmtDay } from "@/lib/format-date";
import { locText } from "@/lib/localized";
import { videoSources } from "@/lib/media";

export default async function SellerVideosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/videos");
  const t = await getTranslations("sellerContent");
  const [videos, products] = await Promise.all([sellerVideos(shop.id), db.product.findMany({ where: { shopId: shop.id, status: "ACTIVE", deletedAt: null }, orderBy: { soldCount: "desc" }, take: 200, select: { id: true, titleUz: true, price: true } })]);
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title={t("videosTitle")} description={t("videosSubtitle")} />
      <Card className="p-5">
        <h2 className="mb-3 font-bold">{t("newVideo")}</h2>
        <VideoForm products={products.map((p) => ({ id: p.id, title: locText(p.titleUz, locale), price: p.price }))} />
      </Card>
      {videos.length === 0 ? (
        <EmptyState className="card" icon={<Video className="h-8 w-8" />} title={t("noVideos")} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {videos.map((v) => (
            <li key={v.id} className="card flex gap-3 p-3">
              <video poster={v.posterUrl ?? undefined} className="h-32 w-20 shrink-0 rounded-[10px] bg-[#1A1A1F] object-cover" muted preload="metadata">
                {videoSources(v.url).map((s) => (
                  <source key={s.src} src={s.src} type={s.type} />
                ))}
              </video>
              <div className="min-w-0 flex-1 space-y-1">
                {!v.isActive && <Badge>{t("hidden")}</Badge>}
                <p className="line-clamp-2 text-sm font-semibold">{locale === "ru" ? v.captionRu : locText(v.captionUz, locale)}</p>
                {v.product && <p className="line-clamp-1 text-xs text-muted">{locText(v.product.titleUz, locale)}</p>}
                <p className="flex items-center gap-2 text-xs text-muted">
                  {t("viewsN", { count: v.views })} · <Heart className="h-3 w-3" aria-hidden="true" /> {v.likes} · {fmtDay(v.createdAt.toISOString(), locale)}
                </p>
                <VideoRowActions id={v.id} active={v.isActive} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
