import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/server/auth/session";
import { liveStreamView } from "@/server/services/live";
import { LiveRoom } from "@/components/content/live-room";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  const s = await liveStreamView(id, locale);
  const t = await getTranslations({ locale, namespace: "live" });
  if (!s) return { title: t("title") };
  return { title: `${s.title} — ${s.shop.name}`, description: t("subtitle"), openGraph: { images: s.posterUrl ? [s.posterUrl] : undefined } };
}

export default async function LiveStreamPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  const stream = await liveStreamView(id, locale, user?.id ?? null);
  if (!stream) notFound();
  const { shop, ...rest } = stream;
  return (
    <div className="container-page py-5">
      <LiveRoom stream={{ ...rest, shop: { name: shop.name, slug: shop.slug, logoUrl: shop.logoUrl } }} me={user ? { id: user.id } : null} />
    </div>
  );
}
