import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { adminOrderDetail } from "@/server/services/admin/operations";
import { orderStatusAction } from "@/server/actions/admin-operations";
import { Badge, Card, KeyValue, PageHeader } from "@/components/ui/display";
import { ActionButton } from "@/components/admin/ui";
import { ORDER_TONE, RETURN_TONE } from "@/components/admin/tones";
import { TRANSITIONS } from "@/lib/order-status";
import { formatUZS } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";

export default async function AdminOrderPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("orders.view");
  const t = await getTranslations("adminOrders");
  const to = await getTranslations("orders");
  const o = await adminOrderDetail(id);
  if (!o) notFound();
  const fmt = (v: number) => formatUZS(v, locale);
  const addr = o.address as { recipient?: string; phone?: string; city?: string; street?: string; house?: string; apartment?: string; note?: string } | null;
  const next = TRANSITIONS[o.status].filter((s): s is Exclude<typeof s, "PLACED" | "PENDING_PAYMENT"> => s !== "PLACED" && s !== "PENDING_PAYMENT");
  const payments = o.group.payments;
  return (
    <div className="space-y-5">
      <Link href="/admin/orders" className="text-sm font-semibold text-primary hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            №{o.number} <Badge tone={ORDER_TONE[o.status]}>{to(`status.${o.status}`)}</Badge>
          </span>
        }
        description={`${fmtDateTime(o.createdAt.toISOString(), locale)} · ${o.fulfillment} · ${t(`methods.${o.deliveryMethod}`)} · ${to(`paymentMethod.${o.paymentMethod}`)}`}
        actions={
          staff.permissions.has("orders.manage") &&
          next.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {next.map((s) => (
                <ActionButton key={s} action={orderStatusAction} input={{ id: o.id, to: s }} variant={s === "CANCELLED" || s === "RETURNED" ? "danger" : "secondary"} label={t("moveTo", { status: to(`status.${s}`) })} reason={{ title: t("overrideTitle", { status: to(`status.${s}`) }), hint: s === "CANCELLED" ? t("cancelHint") : t("overrideHint") }} />
              ))}
            </div>
          )
        }
      />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("items")}</h2>
            <ul className="divide-y divide-border">
              {o.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="48px" className="object-cover" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{i.title}</span>
                    {i.variantTitle && <span className="text-muted"> · {i.variantTitle}</span>}
                    <span className="block text-[12px] text-muted">{t("commissionLine", { rate: `${(i.commissionRate * 100).toFixed(1)}%`, amount: fmt(i.commissionAmount) })}</span>
                  </span>
                  <span className="tabular">
                    {i.quantity} × {fmt(i.unitPrice)}
                  </span>
                </li>
              ))}
            </ul>
            <KeyValue
              className="mt-3 border-t border-border pt-3"
              items={[
                [t("subtotal"), fmt(o.subtotal)],
                [t("discount"), o.discountTotal ? `−${fmt(o.discountTotal)}` : "—"],
                [t("deliveryFee"), fmt(o.deliveryFee)],
                [t("total"), <b key="t">{fmt(o.total)}</b>],
                [t("commission"), fmt(o.commissionTotal)],
                [t("logisticsFee"), fmt(o.logisticsFee)],
              ]}
            />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("timeline")}</h2>
            <ol className="space-y-2 text-sm">
              {o.events.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-2">
                  <span className="text-muted">{fmtDateTime(e.createdAt.toISOString(), locale)}</span>
                  <b>{to(`status.${e.status}`)}</b>
                  {e.note && <span className="text-muted">— {e.note}</span>}
                </li>
              ))}
            </ol>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("payments")}</h2>
            <ul className="space-y-2 text-sm">
              {payments.map((p) => (
                <li key={p.id}>
                  <b>{to(`paymentMethod.${p.method}`)}</b> · {fmt(p.amount)} · {p.status} · {p.purpose}
                  {p.refunds.map((r) => (
                    <span key={r.id} className="block pl-3 text-[13px] text-muted">
                      ↩ {fmt(r.amount)} · {r.method} · {r.status} {r.reason ? `· ${r.reason}` : ""}
                    </span>
                  ))}
                </li>
              ))}
              {!payments.length && <li className="text-muted">—</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("parties")}</h2>
            <KeyValue
              items={[
                [t("buyer"), `${o.user.name ?? o.user.login} · ${o.user.phone ?? "—"}`],
                [t("shop"), <Link key="s" href={`/admin/moderation/shops/${o.shop.id}`} className="underline">{o.shop.name}</Link>],
                [t("recipient"), `${o.recipientName ?? addr?.recipient ?? "—"} · ${o.recipientPhone ?? addr?.phone ?? "—"}`],
                [t("address"), o.pickupPoint ? `${o.pickupPoint.name}, ${o.pickupPoint.address}` : addr ? [addr.city, addr.street, addr.house, addr.apartment].filter(Boolean).join(", ") : "—"],
                [t("region"), o.region],
                [t("sla"), o.slaDeadline ? fmtDateTime(o.slaDeadline.toISOString(), locale) : "—"],
                [t("eta"), o.estimatedDeliveryAt ? fmtDateTime(o.estimatedDeliveryAt.toISOString(), locale) : "—"],
                [t("code"), o.pickupCode ?? "—"],
              ]}
            />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("shipments")}</h2>
            <ul className="space-y-2 text-sm">
              {o.shipments.map((s) => (
                <li key={s.id}>
                  <b className="font-mono">{s.trackingNumber}</b> · {s.status}
                  <span className="block text-[13px] text-muted">
                    {s.courier ? t("courier", { name: s.courier.name ?? s.courier.login }) : t("noCourier")}
                    {s.failedReason && ` · ${s.failedReason}`}
                  </span>
                </li>
              ))}
              {!o.shipments.length && <li className="text-muted">—</li>}
            </ul>
          </Card>
          {(o.returns.length > 0 || o.penalties.length > 0) && (
            <Card className="p-5">
              <h2 className="mb-3 font-bold">{t("returnsPenalties")}</h2>
              <ul className="space-y-1.5 text-sm">
                {o.returns.map((r) => (
                  <li key={r.id}>
                    <Badge tone={RETURN_TONE[r.status]}>{r.status}</Badge> {r.number} · {fmt(r.amount)}
                  </li>
                ))}
                {o.penalties.map((p) => (
                  <li key={p.id} className="text-danger">
                    {p.type} · −{fmt(p.amount)}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
