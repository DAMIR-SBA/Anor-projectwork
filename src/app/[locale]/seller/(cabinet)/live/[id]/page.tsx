import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { db } from "@/server/db";
import { liveStreamView } from "@/server/services/live";
import { Card, PageHeader } from "@/components/ui/display";
import { HostControls } from "@/components/seller/content-tools";
import { LiveRoom } from "@/components/content/live-room";

export default async function SellerLiveConsole({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { shop, user } = await requireShop(`/seller/live/${id}`);
  const t = await getTranslations("sellerContent");
  const own = await db.liveStream.findFirst({ where: { id, shopId: shop.id }, select: { id: true } });
  if (!own) notFound();
  const stream = await liveStreamView(id, locale, user.id);
  if (!stream) notFound();
  const { shop: s, ...rest } = stream;
  return (
    <div className="space-y-5">
      <PageHeader
        title={stream.title}
        description={t("consoleHint")}
        actions={
          <Link href={`/live/${id}`} target="_blank" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            {t("viewerPage")} <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />
      <Card className="p-4">
        <HostControls streamId={id} status={stream.status} products={stream.products.map((p) => ({ id: p.id, title: p.title, price: p.price }))} />
      </Card>
      <LiveRoom stream={{ ...rest, shop: { name: s.name, slug: s.slug, logoUrl: s.logoUrl } }} me={{ id: user.id }} host />
    </div>
  );
}
