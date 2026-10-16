import { getTranslations, setRequestLocale } from "next-intl/server";
import { Radio } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { db } from "@/server/db";
import { sellerStreams } from "@/server/services/live";
import { Badge, Card, EmptyState, PageHeader, type BadgeTone } from "@/components/ui/display";
import { LiveScheduleForm } from "@/components/seller/content-tools";
import { fmtDateTime } from "@/lib/format-date";
import { loc, locText } from "@/lib/localized";
import { tashkentInputValue } from "@/lib/dates";

const TONE: Record<string, BadgeTone> = { LIVE: "primary", SCHEDULED: "info", ENDED: "neutral" };

export default async function SellerLivePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/live");
  const t = await getTranslations("sellerContent");
  const [streams, products] = await Promise.all([sellerStreams(shop.id), db.product.findMany({ where: { shopId: shop.id, status: "ACTIVE", deletedAt: null }, orderBy: { soldCount: "desc" }, take: 200, select: { id: true, titleUz: true, price: true } })]);
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title={t("liveTitle")} description={t("liveSubtitle")} />
      {streams.length === 0 ? (
        <EmptyState className="card" icon={<Radio className="h-8 w-8" />} title={t("noStreams")} />
      ) : (
        <ul className="space-y-2">
          {streams.map((s) => (
            <li key={s.id}>
              <Link href={`/seller/live/${s.id}`} className="card flex flex-wrap items-center gap-3 p-4 hover:shadow-md">
                <Badge tone={TONE[s.status]}>{t(`status.${s.status}`)}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 font-semibold">{loc(s, "title", locale)}</span>
                  <span className="text-xs text-muted">
                    {fmtDateTime(s.startsAt.toISOString(), locale)} · {t("pinnedN", { count: s.pinnedProductIds.length })} · {t("peak", { count: s.peakViewers })} · {t("messagesN", { count: s._count.messages })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Card className="p-5">
        <h2 className="mb-3 font-bold">{t("scheduleTitle")}</h2>
        <LiveScheduleForm products={products.map((p) => ({ id: p.id, title: locText(p.titleUz, locale), price: p.price }))} defaultStart={tashkentInputValue(30)} />
      </Card>
    </div>
  );
}
