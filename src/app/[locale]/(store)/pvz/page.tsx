import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/server/db";
import { PvzExplorer } from "@/components/checkout/pvz-explorer";
import { PageHeader } from "@/components/ui/display";

export async function generateMetadata() {
  const t = await getTranslations("pvz");
  return { title: t("title"), description: t("subtitle") };
}

export default async function PvzPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pvz");
  const points = await db.pickupPoint.findMany({ where: { isActive: true }, orderBy: [{ city: "asc" }, { name: "asc" }] });
  return (
    <div className="container-page py-5">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <PvzExplorer points={points.map((p) => ({ id: p.id, name: p.name, city: p.city, district: p.district, address: p.address, lat: p.lat, lng: p.lng, hours: p.hours as Record<string, string>, storageDays: p.storageDays, hasFitting: p.hasFitting }))} />
    </div>
  );
}
