import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MapPin, Navigation, Phone } from "lucide-react";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { Badge, Card } from "@/components/ui/display";
import { CourierDeliver } from "@/components/courier/courier-actions";
import { formatUZS } from "@/lib/money";

export default async function CourierShipment({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const staff = await requireStaff("courier.deliver");
  const t = await getTranslations("courier");
  const s = await db.shipment.findFirst({ where: { id, courierId: staff.user.id }, include: { order: { include: { items: true } } } });
  if (!s) notFound();
  const a = (s.order.address ?? {}) as Record<string, string | number>;
  const phone = String(s.order.recipientPhone ?? a.phone ?? "");
  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4 text-sm">
        <p className="text-lg font-extrabold">№{s.order.number}</p>
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-4 w-4 text-primary" /> {a.city}, {a.street} {a.house} {a.apartment ? `, ${a.apartment}` : ""} {a.entrance ? `· ${a.entrance}-kirish` : ""} {a.floor ? `· ${a.floor}-qavat` : ""}
        </p>
        {a.comment && <p className="rounded-[10px] bg-surface-2 p-2 italic">{String(a.comment)}</p>}
        <div className="flex gap-2 pt-1">
          <a href={`tel:${phone}`} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[12px] bg-surface-3 font-bold">
            <Phone className="h-4 w-4" /> {t("call")}
          </a>
          {a.lat && a.lng && (
            <a href={`https://www.openstreetmap.org/directions?to=${a.lat},${a.lng}`} target="_blank" rel="noopener noreferrer" className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[12px] bg-surface-3 font-bold">
              <Navigation className="h-4 w-4" /> {t("openMap")}
            </a>
          )}
        </div>
        {s.order.paymentMethod === "COD" && <Badge tone="accent">{t("collectCash", { amount: formatUZS(s.order.total, locale) })}</Badge>}
        <ul className="border-t border-border pt-2">
          {s.order.items.map((i) => (
            <li key={i.id}>
              {i.title} × {i.quantity}
            </li>
          ))}
        </ul>
      </Card>
      <CourierDeliver shipmentId={s.id} />
    </div>
  );
}
