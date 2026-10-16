"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Gift, PackageCheck, Printer, Timer, Truck, XCircle } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError, Input, Radio } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { advanceOrdersAction, cancelOrderSellerAction, deliverDbsAction } from "@/server/actions/seller-orders";
import type { listSellerOrders } from "@/server/services/seller/orders";
import { formatUZS } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";
import { cn } from "@/lib/cn";

type Row = Awaited<ReturnType<typeof listSellerOrders>>["items"][number];
const NEXT: Record<string, "CONFIRMED" | "PACKED" | "SHIPPED" | null> = { PLACED: "CONFIRMED", CONFIRMED: "PACKED", PACKED: "SHIPPED" };
const STATUS_TONE = { PLACED: "primary", CONFIRMED: "info", PACKED: "accent", SHIPPED: "info", DELIVERED: "success", CANCELLED: "neutral", RETURNED: "dark", PENDING_PAYMENT: "neutral" } as const;

/** Live SLA countdown for FBS handovers. */
export function SlaChip({ deadline }: { deadline: string }) {
  const t = useTranslations("sellerOrders");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (now === null) return null;
  const mins = Math.round((new Date(deadline).getTime() - now) / 60_000);
  const late = mins < 0;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold", late ? "bg-danger/10 text-danger" : mins < 180 ? "bg-accent/20 text-fg" : "bg-surface-3 text-muted")}>
      <Timer className="h-3.5 w-3.5" /> {late ? t("slaLate", { h: Math.ceil(-mins / 60) }) : t("slaLeft", { h: Math.floor(mins / 60), m: mins % 60 })}
    </span>
  );
}

export function OrdersBoard({ rows }: { rows: Row[] }) {
  const t = useTranslations("sellerOrders");
  const to = useTranslations("orders");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cancel, setCancel] = useState<Row | null>(null);
  const [deliver, setDeliver] = useState<Row | null>(null);
  const [pending, start] = useTransition();

  const advance = (ids: string[], target: "CONFIRMED" | "PACKED" | "SHIPPED") =>
    start(async () => {
      const res = await advanceOrdersAction({ ids, to: target });
      if (!res.ok) return toast.error(res.error);
      const d = res.data as { done: number; failed: number };
      if (d.failed) toast.error(t("bulkFailed", { count: d.failed }));
      if (d.done) toast.success(t("bulkDone", { count: d.done }));
      setSel(new Set());
      router.refresh();
    });

  const selected = rows.filter((r) => sel.has(r.id));
  const sameNext = selected.length && selected.every((r) => NEXT[r.status] === NEXT[selected[0].status]) ? NEXT[selected[0].status] : null;

  return (
    <div>
      {sel.size > 0 && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-border bg-surface/95 p-2.5 text-sm shadow-sm backdrop-blur">
          <span className="font-bold">{t("selected", { count: sel.size })}</span>
          {sameNext && (
            <Button size="sm" className="h-8" loading={pending} onClick={() => advance([...sel], sameNext)}>
              {t(`actions.${sameNext}`)}
            </Button>
          )}
          <a href={`/seller/print/slips?ids=${[...sel].join(",")}`} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-border px-3 font-semibold hover:bg-surface-2">
            <Printer className="h-4 w-4" /> {t("printSlips")}
          </a>
        </div>
      )}
      <ul className="space-y-3">
        {rows.map((o) => {
          const next = NEXT[o.status];
          const fboLocked = o.fulfillment === "FBO" && next !== "CONFIRMED";
          return (
            <li key={o.id} className={cn("card p-4", sel.has(o.id) && "ring-2 ring-primary")}>
              <div className="flex flex-wrap items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={o.number}
                  className="mt-1 h-4 w-4 accent-[#C8102E]"
                  checked={sel.has(o.id)}
                  onChange={() =>
                    setSel((s) => {
                      const n = new Set(s);
                      if (n.has(o.id)) n.delete(o.id);
                      else n.add(o.id);
                      return n;
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/seller/orders/${o.id}`} className="font-bold hover:underline">
                      №{o.number}
                    </Link>
                    <Badge tone={STATUS_TONE[o.status]}>{to(`status.${o.status}`)}</Badge>
                    <Badge>{o.fulfillment}</Badge>
                    {o.isGift && <Gift className="h-4 w-4 text-primary" aria-label={to("gift")} />}
                    {o.slaDeadline && ["CONFIRMED", "PACKED"].includes(o.status) && o.fulfillment === "FBS" && <SlaChip deadline={o.slaDeadline} />}
                    <span className="ml-auto text-[13px] text-muted">{fmtDateTime(o.createdAt, locale)}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {o.buyer} · {t(`methods.${o.deliveryMethod}`)}
                    {o.pickupPoint && ` · ${o.pickupPoint}`} · {to(`paymentMethod.${o.paymentMethod}`)}
                    {o.tracking && ` · ${o.tracking}`}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {o.items.map((i) => (
                      <li key={i.id} className="flex items-center gap-2 rounded-[10px] bg-surface-2 py-1 pl-1 pr-2.5 text-[13px]">
                        <span className="relative h-9 w-9 overflow-hidden rounded-[8px] bg-surface-3">{i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="36px" className="object-cover" />}</span>
                        <span className="max-w-56 truncate">
                          {i.title}
                          {i.variantTitle ? ` · ${i.variantTitle}` : ""}
                        </span>
                        <b>×{i.quantity}</b>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="tabular text-lg font-extrabold">{formatUZS(o.total, locale)}</p>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {next && !fboLocked && (
                      <Button size="sm" className="h-8" disabled={pending} onClick={() => advance([o.id], next)} leftIcon={next === "SHIPPED" ? <Truck className="h-4 w-4" /> : next === "PACKED" ? <PackageCheck className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}>
                        {t(`actions.${next}`)}
                      </Button>
                    )}
                    {fboLocked && <span className="text-[12px] text-muted">{t("fboHint")}</span>}
                    {o.fulfillment === "DBS" && o.status === "SHIPPED" && (
                      <Button size="sm" variant="success" className="h-8" onClick={() => setDeliver(o)}>
                        {t("deliver")}
                      </Button>
                    )}
                    {["CONFIRMED", "PACKED", "SHIPPED"].includes(o.status) && (
                      <a href={`/seller/print/slips?ids=${o.id}`} target="_blank" rel="noopener" className="inline-flex h-8 items-center rounded-[10px] border border-border px-2.5 hover:bg-surface-2" aria-label={t("printSlip")} title={t("printSlip")}>
                        <Printer className="h-4 w-4" />
                      </a>
                    )}
                    {["PLACED", "CONFIRMED", "PACKED"].includes(o.status) && (
                      <button type="button" onClick={() => setCancel(o)} className="inline-flex h-8 items-center rounded-[10px] px-2.5 text-muted hover:bg-surface-2 hover:text-danger" aria-label={t("cancel")} title={t("cancel")}>
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <p className="card p-8 text-center text-muted">{t("empty")}</p>}
      {cancel && <CancelDialog order={cancel} onClose={() => setCancel(null)} />}
      {deliver && <DeliverDialog order={deliver} onClose={() => setDeliver(null)} />}
    </div>
  );
}

const REASONS = ["out_of_stock", "wrong_price", "cannot_ship", "buyer_request", "other"] as const;

export function CancelDialog({ order, onClose }: { order: { id: string; number: string }; onClose: () => void }) {
  const t = useTranslations("sellerOrders");
  const tc = useTranslations("common");
  const router = useRouter();
  const [reason, setReason] = useState<(typeof REASONS)[number]>("out_of_stock");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("cancelTitle", { number: order.number })}
      closeLabel={tc("close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("back")}
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await cancelOrderSellerAction({ orderId: order.id, reason });
                if (!res.ok) return setError(res.error);
                onClose();
                router.refresh();
              })
            }
          >
            {t("cancel")}
          </Button>
        </>
      }
    >
      <p className="mb-3 rounded-[10px] bg-accent/15 p-2.5 text-sm">{t("cancelWarning")}</p>
      <fieldset className="space-y-2">
        {REASONS.map((r) => (
          <Radio key={r} className="flex" name="cancel" checked={reason === r} onChange={() => setReason(r)} label={t(`cancelReasons.${r}`)} />
        ))}
      </fieldset>
      <FormError message={error} />
    </Dialog>
  );
}

export function DeliverDialog({ order, onClose }: { order: { id: string; number: string }; onClose: () => void }) {
  const t = useTranslations("sellerOrders");
  const tc = useTranslations("common");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("deliverTitle", { number: order.number })}
      closeLabel={tc("close")}
      footer={
        <Button
          variant="success"
          loading={pending}
          disabled={code.length !== 4}
          onClick={() =>
            start(async () => {
              const res = await deliverDbsAction({ orderId: order.id, code });
              if (!res.ok) return setError(res.fieldErrors?.code ?? res.error);
              onClose();
              router.refresh();
            })
          }
        >
          {t("confirmDelivery")}
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted">{t("deliverHint")}</p>
      <Input aria-label={t("code")} inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="text-center text-2xl tracking-[0.5em]" />
      <FormError message={error} />
    </Dialog>
  );
}
