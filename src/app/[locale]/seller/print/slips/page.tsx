import QRCode from "qrcode";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireShop } from "@/server/auth/guards";
import { db } from "@/server/db";
import { AnorLogo } from "@/components/brand/AnorLogo";
import { PrintButton } from "@/components/seller/print-button";
import { fmtDateTime } from "@/lib/format-date";

export const metadata = { robots: { index: false } };

/** Printable packing slips (one per page, 100×150 mm label size). */
export default async function SlipsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ ids?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/orders");
  const t = await getTranslations("sellerOrders.slip");
  const ids = ((await searchParams).ids ?? "").split(",").filter(Boolean).slice(0, 100);
  const orders = await db.order.findMany({ where: { id: { in: ids }, shopId: shop.id, status: { in: ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"] } }, include: { items: true, shipments: true, pickupPoint: true, user: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  const qrs = await Promise.all(orders.map((o) => QRCode.toDataURL(`ANOR:SHIP:${o.shipments[0]?.trackingNumber ?? o.number}`, { margin: 0, width: 160 })));
  return (
    <div className="min-h-dvh bg-surface-2 p-4 print:bg-white print:p-0">
      <style>{`@page { size: 100mm 150mm; margin: 4mm; } @media print { .slip { break-after: page; box-shadow: none !important; border: 0 !important; } }`}</style>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="font-bold">{t("title", { count: orders.length })}</p>
        <PrintButton label={t("print")} />
      </div>
      <div className="flex flex-wrap gap-4">
        {orders.map((o, k) => (
          <article key={o.id} className="slip flex w-[100mm] flex-col gap-2 rounded-[8px] border border-black/20 bg-white p-4 text-[12px] leading-snug text-black shadow-sm">
            <div className="flex items-center justify-between">
              <AnorLogo height={20} />
              <span className="rounded border border-black px-1.5 font-bold">{o.fulfillment}</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[18px] font-extrabold">№{o.number}</p>
                <p>{fmtDateTime(o.createdAt, locale)}</p>
                <p className="mt-1 font-mono text-[13px] font-bold">{o.shipments[0]?.trackingNumber ?? "—"}</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrs[k]} alt={o.shipments[0]?.trackingNumber ?? o.number} width={88} height={88} />
            </div>
            <div className="border-y border-dashed border-black/40 py-1.5">
              <p>
                {t("to")}: <b>{o.recipientName ?? o.user.name ?? "—"}</b>
              </p>
              <p>{o.pickupPoint ? `${t("pvz")}: ${o.pickupPoint.name}` : `${t("courier")} · ${o.region}`}</p>
              <p>
                {t("from")}: {shop.name}
              </p>
            </div>
            <table className="w-full">
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-0.5 pr-2">
                      {i.title}
                      {i.variantTitle ? ` (${i.variantTitle})` : ""}
                    </td>
                    <td className="text-right font-bold">×{i.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {o.isGift && <p className="font-bold">🎁 {t("gift")}</p>}
            <p className="mt-auto text-[10px] text-black/60">{t("footer")}</p>
          </article>
        ))}
      </div>
      {!orders.length && <p className="text-muted">{t("none")}</p>}
    </div>
  );
}
