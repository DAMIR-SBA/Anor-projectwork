import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Check, MapPin, Phone, Truck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireShop } from "@/server/auth/guards";
import { sellerOrderDetail } from "@/server/services/seller/orders";
import { Badge, Card, PageHeader } from "@/components/ui/display";
import { SellerOrderActions } from "@/components/seller/order-actions";
import { SlaChip } from "@/components/seller/orders-board";
import { formatUZS } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";
import { TIMELINE } from "@/lib/order-status";
import { cn } from "@/lib/cn";

export default async function SellerOrderPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop(`/seller/orders/${id}`);
  const t = await getTranslations("sellerOrders");
  const to = await getTranslations("orders");
  const o = await sellerOrderDetail(shop.id, id);
  if (!o) notFound();
  const fmt = (v: number) => formatUZS(v, locale);
  const reached = new Map(o.events.map((e) => [e.status, e.createdAt]));
  const commission = o.items.reduce((s, i) => s + i.commissionAmount, 0);
  const net = o.subtotal - o.discountTotal - commission - o.logisticsFee;
  return (
    <div className="space-y-5">
      <Link href="/seller/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {t("title")}
      </Link>
      <PageHeader
        title={`№${o.number}`}
        description={`${fmtDateTime(o.createdAt, locale)} · ${o.fulfillment} · ${t(`methods.${o.deliveryMethod}`)}`}
        actions={<SellerOrderActions order={{ id: o.id, number: o.number, status: o.status, fulfillment: o.fulfillment }} />}
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone={o.status === "CANCELLED" ? "neutral" : o.status === "DELIVERED" ? "success" : "primary"}>{to(`status.${o.status}`)}</Badge>
              {o.slaDeadline && o.fulfillment === "FBS" && ["CONFIRMED", "PACKED"].includes(o.status) && <SlaChip deadline={o.slaDeadline.toISOString()} />}
              {o.cancelReason && <span className="text-sm text-muted">{o.cancelReason}</span>}
            </div>
            {o.status !== "CANCELLED" && (
              <ol className="grid grid-cols-5 gap-1 text-center text-[12px]">
                {TIMELINE.map((s) => {
                  const at = reached.get(s);
                  return (
                    <li key={s}>
                      <span className={cn("mx-auto flex h-8 w-8 items-center justify-center rounded-full", at ? "bg-primary text-white" : "bg-surface-3 text-muted")}>{at ? <Check className="h-4 w-4" /> : null}</span>
                      <span className="mt-1 block font-semibold">{to(`status.${s}`)}</span>
                      {at && <span className="block text-muted">{fmtDateTime(at, locale)}</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{to("items")}</h2>
            <ul className="divide-y divide-border">
              {o.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-3">
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="56px" className="object-cover" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{i.title}</p>
                    <p className="text-sm text-muted">
                      {i.variantTitle ? `${i.variantTitle} · ` : ""}
                      {fmt(i.unitPrice)} × {i.quantity}
                    </p>
                  </div>
                  <span className="tabular font-bold">{fmt(i.unitPrice * i.quantity)}</span>
                </li>
              ))}
            </ul>
          </Card>
          {o.returns.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-2 font-bold">{t("returns")}</h2>
              <ul className="space-y-1 text-sm">
                {o.returns.map((r) => (
                  <li key={r.id}>
                    <Link href="/seller/returns" className="font-semibold text-primary hover:underline">
                      {r.number}
                    </Link>{" "}
                    · {r.status} · ×{r.quantity}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="font-bold">{t("money")}</h2>
            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt className="text-muted">{to("subtotal")}</dt>
                <dd className="tabular">{fmt(o.subtotal)}</dd>
              </div>
              {o.discountTotal > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">{to("discount")}</dt>
                  <dd className="tabular">−{fmt(o.discountTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">{t("commission")}</dt>
                <dd className="tabular">−{fmt(commission)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{t("logisticsFee")}</dt>
                <dd className="tabular">−{fmt(o.logisticsFee)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1 text-base font-extrabold">
                <dt>{t("toPayout")}</dt>
                <dd className="tabular">{fmt(net)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">{to(`paymentMethod.${o.paymentMethod}`)}</p>
          </Card>
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="flex items-center gap-2 font-bold">
              <Truck className="h-4 w-4 text-primary" /> {to("delivery")}
            </h2>
            <p>
              {t("recipient")}: <b>{o.buyerName}</b>
            </p>
            {o.pickupPoint && (
              <p className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" /> {o.pickupPoint.name}
              </p>
            )}
            {o.address ? (
              <>
                <p className="flex items-start gap-1.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" /> {o.address}
                </p>
                {o.contactPhone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-4 w-4 text-muted" /> {o.contactPhone}
                  </p>
                )}
                {o.addressNote && <p className="text-muted">{o.addressNote}</p>}
              </>
            ) : (
              <p className="text-muted">{t("addressHidden")}</p>
            )}
            {o.shipments[0] && (
              <p className="text-muted">
                {t("tracking")}: <span className="font-mono">{o.shipments[0].trackingNumber}</span>
              </p>
            )}
            {o.isGift && <p className="rounded-[10px] bg-primary/5 p-2">{to("gift")}{o.giftMessage ? ` — “${o.giftMessage}”` : ""}</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
