"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Plus, Trash2, Truck } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cancelSupplyAction, createSupplyAction, demoAdvanceSupplyAction, setStockAction } from "@/server/actions/seller-stock";
import type { listSupplies, stockOverview } from "@/server/services/seller/stock";
import { fmtDay, fmtDateTime } from "@/lib/format-date";
import { cn } from "@/lib/cn";

type Overview = Awaited<ReturnType<typeof stockOverview>>;
type Supply = Awaited<ReturnType<typeof listSupplies>>[number];

function StockCell({ variantId, warehouseId, quantity, lowStockAt }: { variantId: string; warehouseId: string; quantity: number; lowStockAt: number }) {
  const t = useTranslations("sellerStock");
  const toast = useToast();
  const [value, setValue] = useState(String(quantity));
  const [saved, setSaved] = useState(String(quantity));
  const [pending, start] = useTransition();
  const dirty = value !== saved;
  return (
    <div className="flex items-center gap-1">
      <Input aria-label={t("quantity")} value={value} inputMode="numeric" onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} className={cn("h-8 w-20 text-sm", Number(value) <= lowStockAt && "border-accent")} />
      {dirty && (
        <Button
          size="icon"
          className="h-8 w-8"
          loading={pending}
          aria-label={t("save")}
          onClick={() =>
            start(async () => {
              const res = await setStockAction({ variantId, warehouseId, quantity: Number(value) || 0 });
              if (!res.ok) return toast.error(res.error);
              setSaved(value);
            })
          }
        >
          <Check className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function StockTable({ data }: { data: Overview }) {
  const t = useTranslations("sellerStock");
  const own = data.warehouses.filter((w) => w.type === "SELLER");
  const platform = data.warehouses.filter((w) => w.type === "PLATFORM");
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-2.5">{t("product")}</th>
            {own.map((w) => (
              <th key={w.id} className="px-3 py-2.5">
                {t("ownWarehouse")}
              </th>
            ))}
            {platform.map((w) => (
              <th key={w.id} className="px-3 py-2.5">
                {w.code}
              </th>
            ))}
            <th className="px-3 py-2.5 text-right">{t("total")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.rows.map((r) => (
            <tr key={r.variantId}>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[8px] bg-surface-2">{r.image && <Image src={r.image} alt="" fill sizes="40px" className="object-cover" />}</span>
                  <div className="min-w-0">
                    <p className="line-clamp-1 font-semibold">{r.title}</p>
                    <p className="text-xs text-muted">
                      {r.sku}
                      {r.barcode ? ` · ${r.barcode}` : ""} · {r.fulfillment}
                    </p>
                  </div>
                </div>
              </td>
              {own.map((w) => (
                <td key={w.id} className="px-3 py-2">
                  {r.fulfillment === "FBO" ? <span className="text-muted">—</span> : <StockCell variantId={r.variantId} warehouseId={w.id} quantity={r.byWarehouse[w.id]?.quantity ?? 0} lowStockAt={r.byWarehouse[w.id]?.lowStockAt ?? 3} />}
                </td>
              ))}
              {platform.map((w) => (
                <td key={w.id} className="tabular px-3 py-2">
                  {r.byWarehouse[w.id]?.quantity ?? 0}
                  {r.byWarehouse[w.id]?.reserved ? <span className="text-xs text-muted"> ({t("reserved", { n: r.byWarehouse[w.id].reserved })})</span> : null}
                </td>
              ))}
              <td className={cn("tabular px-3 py-2 text-right font-bold", r.total === 0 ? "text-danger" : r.total <= 3 && "text-accent-ink")}>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.rows.length === 0 && <p className="p-8 text-center text-muted">{t("empty")}</p>}
    </div>
  );
}

const SUPPLY_TONE = { CREATED: "neutral", ACCEPTED: "info", RECEIVED: "accent", IN_STOCK: "success", CANCELLED: "dark" } as const;

export function SuppliesList({ rows, demo }: { rows: Supply[]; demo: boolean }) {
  const t = useTranslations("sellerStock");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.error(res.error ?? "");
      router.refresh();
    });
  return (
    <ul className="space-y-3">
      {rows.map((s) => (
        <li key={s.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">{s.number}</p>
            <Badge tone={SUPPLY_TONE[s.status]}>{t(`supplyStatus.${s.status}`)}</Badge>
            <span className="text-sm text-muted">
              → {s.warehouse}
              {s.plannedAt && ` · ${fmtDay(s.plannedAt, locale)}`}
            </span>
            <span className="ml-auto text-sm">
              {t("units", { count: s.units })}
              {s.received ? ` · ${t("receivedN", { count: s.received })}` : ""}
            </span>
          </div>
          <ol className="mt-3 flex items-center gap-1 text-[12px]">
            {(["CREATED", "ACCEPTED", "RECEIVED", "IN_STOCK"] as const).map((st, i, arr) => {
              const reached = s.status !== "CANCELLED" && arr.indexOf(s.status as (typeof arr)[number]) >= i;
              return (
                <li key={st} className="flex flex-1 items-center gap-1">
                  <span className={cn("h-1.5 flex-1 rounded-full", reached ? "bg-primary" : "bg-surface-3")} />
                  <span className={cn("shrink-0", reached ? "font-semibold" : "text-muted")}>{t(`supplyStatus.${st}`)}</span>
                </li>
              );
            })}
          </ol>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted">{t("items")}</summary>
            <ul className="mt-1 space-y-0.5">
              {s.items.map((i) => (
                <li key={i.sku}>
                  <span className="font-mono text-xs">{i.sku}</span> {i.title} × {i.quantity}
                  {i.receivedQty !== null && <span className="text-success"> ✓ {i.receivedQty}</span>}
                </li>
              ))}
            </ul>
          </details>
          <div className="mt-3 flex flex-wrap gap-2">
            {s.status === "CREATED" && (
              <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => act(() => cancelSupplyAction({ id: s.id }))}>
                {t("cancelSupply")}
              </Button>
            )}
            {demo && ["CREATED", "ACCEPTED", "RECEIVED"].includes(s.status) && (
              <Button size="sm" variant="accent" disabled={pending} onClick={() => act(() => demoAdvanceSupplyAction({ id: s.id }))}>
                {t("demoAdvance")}
              </Button>
            )}
          </div>
          <p className="mt-1 text-[12px] text-muted">{fmtDateTime(s.createdAt, locale)}</p>
        </li>
      ))}
      {rows.length === 0 && <li className="card p-8 text-center text-muted">{t("noSupplies")}</li>}
    </ul>
  );
}

export function SupplyForm({ warehouses, variants }: { warehouses: Array<{ id: string; name: string }>; variants: Array<{ id: string; label: string }> }) {
  const t = useTranslations("sellerStock");
  const router = useRouter();
  const toast = useToast();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [plannedAt, setPlannedAt] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Array<{ variantId: string; quantity: string }>>([{ variantId: variants[0]?.id ?? "", quantity: "10" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card space-y-4 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Truck className="h-5 w-5 text-primary" /> {t("newSupply")}
      </h2>
      <p className="text-sm text-muted">{t("supplyHint")}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("warehouse")} htmlFor="sup-wh">
          <Select id="sup-wh" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("plannedAt")} htmlFor="sup-date">
          <Input id="sup-date" type="date" value={plannedAt} onChange={(e) => setPlannedAt(e.target.value)} />
        </Field>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <Select aria-label={t("product")} value={it.variantId} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, variantId: e.target.value } : y)))} className="flex-1 text-sm">
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
            <Input aria-label={t("quantity")} value={it.quantity} inputMode="numeric" onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, quantity: e.target.value.replace(/\D/g, "") } : y)))} className="w-24" />
            <button type="button" onClick={() => setItems((x) => x.filter((_, j) => j !== i))} disabled={items.length === 1} className="p-2 text-muted hover:text-danger disabled:opacity-30" aria-label={t("remove")}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button size="sm" variant="ghost" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setItems((x) => [...x, { variantId: variants[0]?.id ?? "", quantity: "10" }])}>
          {t("addLine")}
        </Button>
      </div>
      <Field label={t("note")} htmlFor="sup-note">
        <Textarea id="sup-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormError message={error} />
      <Button
        loading={pending}
        disabled={!plannedAt || !variants.length}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await createSupplyAction({ warehouseId, plannedAt: new Date(plannedAt), note, items: items.map((i) => ({ variantId: i.variantId, quantity: Number(i.quantity) || 0 })) });
            if (!res.ok) return setError(res.error);
            toast.success(t("supplyCreated", { number: String((res.data as { number: string }).number) }));
            setItems([{ variantId: variants[0]?.id ?? "", quantity: "10" }]);
            router.refresh();
          })
        }
      >
        {t("createSupply")}
      </Button>
    </div>
  );
}
