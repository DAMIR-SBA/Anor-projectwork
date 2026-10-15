import dynamicImport from "next/dynamic";
import { getTranslations } from "next-intl/server";
import { MapPin, Package, Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { Badge, EmptyState } from "@/components/ui/display";
import { CourierTake } from "@/components/courier/courier-actions";
import { formatUZS } from "@/lib/money";

const RouteMap = dynamicImport(() => import("@/components/courier/route-map").then((m) => m.RouteMap));

export default async function CourierHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const staff = await requireStaff("courier.deliver");
  const t = await getTranslations("courier");
  const [mine, pool] = await Promise.all([
    db.shipment.findMany({ where: { courierId: staff.user.id, status: { in: ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"] } }, include: { order: true }, orderBy: [{ order: { slotStart: "asc" } }, { createdAt: "asc" }] }),
    db.shipment.findMany({ where: { courierId: null, status: "IN_TRANSIT", type: { in: ["COURIER", "EXPRESS"] } }, include: { order: true }, orderBy: { createdAt: "asc" }, take: 10 }),
  ]);
  const stops = mine.map((s) => ({ id: s.id, ...(s.order.address as { lat?: number; lng?: number; street?: string }) })).filter((s) => s.lat && s.lng) as Array<{ id: string; lat: number; lng: number; street?: string }>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">
        {t("today")} · {t("stops", { count: mine.length })}
      </h1>
      {stops.length > 0 && <RouteMap stops={stops} />}
      {mine.length === 0 && <EmptyState className="card" icon={<Package className="h-8 w-8" />} title={t("empty")} />}
      <ol className="space-y-3">
        {mine.map((s, i) => {
          const a = s.order.address as Record<string, string> | null;
          return (
            <li key={s.id}>
              <Link href={`/courier/${s.id}`} className="card flex gap-3 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-bold">№{s.order.number}</p>
                  <p className="flex items-start gap-1 text-muted">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a?.city}, {a?.street} {a?.house}
                  </p>
                  <p className="flex items-center gap-1 text-muted">
                    <Phone className="h-3.5 w-3.5" /> {s.order.recipientPhone ?? a?.phone}
                  </p>
                  {s.order.paymentMethod === "COD" && <Badge tone="accent">{t("collectCash", { amount: formatUZS(s.order.total, locale) })}</Badge>}
                </div>
                {s.type === "EXPRESS" && <Badge tone="primary">EXPRESS</Badge>}
              </Link>
            </li>
          );
        })}
      </ol>
      {pool.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">{t("takeNext")}</h2>
          {pool.map((s) => {
            const a = s.order.address as Record<string, string> | null;
            return (
              <div key={s.id} className="card flex items-center justify-between gap-3 p-3 text-sm">
                <span>
                  №{s.order.number} · {a?.city}, {a?.street}
                </span>
                <CourierTake shipmentId={s.id} />
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
