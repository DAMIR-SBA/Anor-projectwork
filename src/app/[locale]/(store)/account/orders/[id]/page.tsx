import Image from "next/image";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Check, FileText, Gift, MapPin, MessageCircle, Star, Store, Truck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { Card, PageHeader } from "@/components/ui/display";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { OrderActions } from "@/components/orders/order-actions";
import { ShopReviewForm } from "@/components/reviews/shop-review-form";
import { formatUZS } from "@/lib/money";
import { TIMELINE, canRequestReturn, canTransition } from "@/lib/order-status";
import { cn } from "@/lib/cn";

export default async function OrderPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/account/orders/${id}`);
  const t = await getTranslations("orders");
  const tr = await getTranslations("reviews.shop");
  const format = await getFormatter();
  const order = await db.order.findFirst({
    where: { id, userId: user.id },
    include: { items: { include: { product: { select: { slug: true } } } }, events: { orderBy: { createdAt: "asc" } }, shop: true, pickupPoint: true, shipments: true, receipt: true, reviews: { select: { productId: true } }, shopReview: { select: { id: true } }, group: { include: { payments: true } } },
  });
  if (!order) notFound();
  const fmt = (v: number) => formatUZS(v, locale);
  const reached = new Map(order.events.map((e) => [e.status, e.createdAt]));
  const cancelled = order.status === "CANCELLED" || order.status === "RETURNED";
  const atPvz = order.deliveryMethod === "PICKUP" && order.status === "SHIPPED" && order.pickupExpiresAt;
  const qr = order.pickupCode && !["DELIVERED", "CANCELLED", "RETURNED"].includes(order.status) ? await QRCode.toDataURL(`ANOR:PICKUP:${order.number}:${order.pickupCode}`, { margin: 1, width: 220 }) : null;
  const addr = order.address as Record<string, string> | null;

  return (
    <div className="space-y-5">
      <PageHeader title={t("number", { number: order.number })} description={format.dateTime(order.createdAt, "long")} actions={<OrderStatusBadge status={order.status} />} />

      <Card className="p-5">
        <h2 className="mb-4 font-bold">{t("timeline")}</h2>
        {cancelled ? (
          <ol className="space-y-2">
            {order.events.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm">
                <span className="font-semibold">{t(`status.${e.status}`)}</span>
                <span className="text-muted">{format.dateTime(e.createdAt, "long")}</span>
              </li>
            ))}
          </ol>
        ) : (
          <ol className="grid grid-cols-5 gap-1" aria-label={t("timeline")}>
            {TIMELINE.map((s, i) => {
              const at = reached.get(s);
              const done = !!at;
              return (
                <li key={s} className="flex flex-col items-center text-center">
                  <div className="flex w-full items-center">
                    <span className={cn("h-1 flex-1 rounded-full", i === 0 ? "opacity-0" : done ? "bg-success" : "bg-surface-3")} />
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", done ? "bg-success text-white" : "bg-surface-3 text-muted")} aria-current={order.status === s ? "step" : undefined}>
                      {done ? <Check className="h-4 w-4" /> : i + 1}
                    </span>
                    <span className={cn("h-1 flex-1 rounded-full", i === TIMELINE.length - 1 ? "opacity-0" : reached.get(TIMELINE[i + 1]) ? "bg-success" : "bg-surface-3")} />
                  </div>
                  <span className={cn("mt-2 text-xs font-semibold sm:text-sm", !done && "text-muted")}>{t(`status.${s}`)}</span>
                  {at && <span className="text-[11px] text-muted">{format.dateTime(at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                </li>
              );
            })}
          </ol>
        )}
        {order.estimatedDeliveryAt && !cancelled && order.status !== "DELIVERED" && <p className="mt-4 text-sm font-semibold text-brand-ink">{t("eta", { date: format.dateTime(order.estimatedDeliveryAt, { day: "numeric", month: "long" }) })}</p>}
        {order.shipments[0] && <p className="mt-1 text-sm text-muted">{t("tracking", { code: order.shipments[0].trackingNumber })}</p>}
      </Card>

      {qr && (
        <Card className="flex flex-wrap items-center gap-5 p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR" width={140} height={140} className="rounded-[12px] bg-white p-1" />
          <div>
            <p className="text-sm text-muted">{t("pickupCode")}</p>
            <p className="tabular text-4xl font-extrabold tracking-[0.3em]">{order.pickupCode}</p>
            <p className="mt-1 text-sm text-muted">{t("pickupCodeHint")}</p>
            {atPvz && <p className="mt-2 text-sm font-semibold text-brand-ink">{t("storageUntil", { date: format.dateTime(order.pickupExpiresAt!, { day: "numeric", month: "long" }) })}</p>}
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">{t("items")}</h2>
            <Link href={`/shop/${order.shop.slug}`} className="text-sm font-semibold text-brand-ink">
              {order.shop.name}
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {order.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3">
                <Link href={`/p/${i.product.slug}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] bg-surface-2">
                  {i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="64px" className="object-cover" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/p/${i.product.slug}`} className="line-clamp-2 font-semibold hover:text-primary">
                    {i.title}
                  </Link>
                  <p className="text-sm text-muted">
                    {i.variantTitle ? `${i.variantTitle} · ` : ""}
                    {i.quantity} × {fmt(i.unitPrice)}
                  </p>
                  {order.status === "DELIVERED" && !order.reviews.some((r) => r.productId === i.productId) && (
                    <Link href={`/account/reviews/new?order=${order.id}&product=${i.productId}`} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink">
                      <Star className="h-4 w-4" /> {t("review")}
                    </Link>
                  )}
                </div>
                <span className="tabular font-bold">{fmt(i.unitPrice * i.quantity - i.discount)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-5">
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="flex items-center gap-2 font-bold">
              <Truck className="h-4 w-4 text-primary" /> {t("delivery")}
            </h2>
            {order.pickupPoint ? (
              <p className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" /> {t("pickupAt", { name: `${order.pickupPoint.name}, ${order.pickupPoint.address}` })}
              </p>
            ) : (
              addr && (
                <p>
                  {addr.recipient}, {addr.phone}
                  <br />
                  <span className="text-muted">
                    {addr.city}, {addr.street} {addr.house}
                  </span>
                </p>
              )
            )}
            {order.isGift && (
              <p className="flex items-start gap-1.5 rounded-[10px] bg-primary-50 p-2 dark:bg-primary/10">
                <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  {t("gift")}
                  {order.recipientName && <> · {t("giftFor", { name: order.recipientName })}</>}
                  {order.hidePrice && <span className="block text-xs text-muted">{t("priceHidden")}</span>}
                  {order.giftMessage && <span className="block italic">“{order.giftMessage}”</span>}
                </span>
              </p>
            )}
          </Card>
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="font-bold">{t("payment")}</h2>
            <p>{t(`paymentMethod.${order.paymentMethod}`)}</p>
            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt className="text-muted">{t("subtotal")}</dt>
                <dd className="tabular">{fmt(order.subtotal)}</dd>
              </div>
              {order.discountTotal > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">{t("discount")}</dt>
                  <dd className="tabular text-brand-ink">−{fmt(order.discountTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">{t("deliveryFee")}</dt>
                <dd className="tabular">{fmt(order.deliveryFee)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1 text-base font-extrabold">
                <dt>{t("total")}</dt>
                <dd className="tabular">{fmt(order.total)}</dd>
              </div>
              {order.cashbackAmount > 0 && (
                <div className="flex justify-between text-success">
                  <dt>{t("cashback")}</dt>
                  <dd className="tabular">+{order.cashbackAmount.toLocaleString("ru-RU")}</dd>
                </div>
              )}
            </dl>
            {order.receipt && (
              <a href={`/api/orders/${order.id}/receipt?locale=${locale}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 font-semibold text-brand-ink">
                <FileText className="h-4 w-4" /> {t("receipt")}
              </a>
            )}
          </Card>
          {order.status === "DELIVERED" && (
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 font-bold">
                <Store className="h-4 w-4 text-primary" /> {tr("title")}
              </h2>
              <ShopReviewForm orderId={order.id} done={!!order.shopReview} />
            </Card>
          )}
          <Link href={`/chat/new?shop=${order.shopId}&order=${order.id}`} className="flex h-11 items-center justify-center gap-2 rounded-[12px] bg-surface font-bold shadow-[var(--shadow-soft)]">
            <MessageCircle className="h-4 w-4" /> {t("writeSeller")}
          </Link>
        </div>
      </div>

      <OrderActions
        orderId={order.id}
        canCancel={canTransition(order.status, "CANCELLED", "buyer")}
        returnable={canRequestReturn(order.status, order.deliveredAt)}
        demo={env().DEMO_MODE && !["DELIVERED", "CANCELLED", "RETURNED", "PENDING_PAYMENT"].includes(order.status)}
        items={order.items.map((i) => ({ id: i.id, title: i.title, quantity: i.quantity }))}
      />
    </div>
  );
}
