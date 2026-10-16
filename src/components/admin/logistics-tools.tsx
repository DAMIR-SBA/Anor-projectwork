"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { advanceSupplyAction, assignCourierAction, savePickupPointAction, saveWarehouseAction } from "@/server/actions/admin-operations";
import { REGIONS } from "@/lib/delivery";

/** Count received units per line, then mark the supply as received. */
export function SupplyReceive({ supplyId, items }: { supplyId: string; items: Array<{ id: string; sku: string; title: string; quantity: number }> }) {
  const t = useTranslations("adminLogistics");
  const router = useRouter();
  const toast = useToast();
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, String(i.quantity)])));
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-2 space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await advanceSupplyAction({ id: supplyId, counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v) || 0])) });
          if (!res.ok) return toast.error(res.error);
          toast.success(t("received"));
          router.refresh();
        });
      }}
    >
      {items.map((i) => (
        <label key={i.id} className="flex items-center gap-2 text-[13px]">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-mono">{i.sku}</span> {i.title} · {t("expected", { n: i.quantity })}
          </span>
          <input aria-label={t("counted", { sku: i.sku })} inputMode="numeric" value={counts[i.id]} onChange={(e) => setCounts((c) => ({ ...c, [i.id]: e.target.value.replace(/\D/g, "") }))} className="h-8 w-20 rounded-[8px] border border-border bg-surface px-2 text-sm" />
        </label>
      ))}
      <Button type="submit" size="sm" loading={pending}>
        {t("receive")}
      </Button>
    </form>
  );
}

export function CourierAssign({ shipmentId, couriers, current }: { shipmentId: string; couriers: Array<{ id: string; name: string; load: number }>; current: string | null }) {
  const t = useTranslations("adminLogistics");
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label={t("assign")}
      disabled={pending}
      value={current ?? ""}
      className="h-9 w-48 text-sm"
      onChange={(e) =>
        start(async () => {
          const res = await assignCourierAction({ shipmentId, courierId: e.target.value || null });
          if (!res.ok) return toast.error(res.error);
          toast.success(t("assigned"));
          router.refresh();
        })
      }
    >
      <option value="">{t("unassigned")}</option>
      {couriers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.load})
        </option>
      ))}
    </Select>
  );
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Point = { id?: string; code: string; name: string; region: string; city: string; district: string; address: string; lat: number; lng: number; hours: Record<string, string>; phone: string | null; storageDays: number; hasFitting: boolean; isActive: boolean };

export function PickupPointEditor({ point }: { point?: Point }) {
  const t = useTranslations("adminLogistics");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const blank: Point = { code: "", name: "", region: "toshkent_sh", city: "Toshkent", district: "", address: "", lat: 41.31, lng: 69.28, hours: Object.fromEntries(DAYS.map((d) => [d, d === "sun" ? "10:00-18:00" : "09:00-21:00"])), phone: "", storageDays: 5, hasFitting: true, isActive: true };
  const [f, setF] = useState<Point>(point ?? blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      {point ? (
        <button type="button" className="rounded-[8px] p-1.5 text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("edit")} onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
          {t("addPoint")}
        </Button>
      )}
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={point ? t("editPoint", { code: point.code }) : t("addPoint")}
          closeLabel={tc("close")}
          className="sm:max-w-2xl"
          footer={
            <Button
              loading={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  setErrors({});
                  const res = await savePickupPointAction({ ...f, id: point?.id, phone: f.phone || null });
                  if (!res.ok) {
                    setErrors(res.fieldErrors ?? {});
                    return setError(res.error);
                  }
                  toast.success(t("saved"));
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {t("save")}
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("code")} htmlFor="pp-code" error={errors.code} hint="TAS-012">
              <Input id="pp-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label={t("name")} htmlFor="pp-name" error={errors.name}>
              <Input id="pp-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label={t("region")} htmlFor="pp-region">
              <Select id="pp-region" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
                {REGIONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {locale === "ru" ? r.ru : r.uz}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("city")} htmlFor="pp-city" error={errors.city}>
              <Input id="pp-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
            </Field>
            <Field label={t("district")} htmlFor="pp-district" error={errors.district}>
              <Input id="pp-district" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} />
            </Field>
            <Field label={t("address")} htmlFor="pp-address" error={errors.address}>
              <Input id="pp-address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            </Field>
            <Field label={t("lat")} htmlFor="pp-lat" error={errors.lat}>
              <Input id="pp-lat" inputMode="decimal" value={String(f.lat)} onChange={(e) => setF({ ...f, lat: Number(e.target.value) || 0 })} />
            </Field>
            <Field label={t("lng")} htmlFor="pp-lng" error={errors.lng}>
              <Input id="pp-lng" inputMode="decimal" value={String(f.lng)} onChange={(e) => setF({ ...f, lng: Number(e.target.value) || 0 })} />
            </Field>
            <Field label={t("phone")} htmlFor="pp-phone">
              <Input id="pp-phone" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
            <Field label={t("storageDays")} htmlFor="pp-days" error={errors.storageDays}>
              <Input id="pp-days" inputMode="numeric" value={String(f.storageDays)} onChange={(e) => setF({ ...f, storageDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
          </div>
          <fieldset className="mt-3">
            <legend className="mb-1 text-sm font-semibold">{t("hours")}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DAYS.map((d) => (
                <label key={d} className="text-[13px]">
                  <span className="text-muted">{t(`days.${d}`)}</span>
                  <input value={f.hours[d] ?? ""} onChange={(e) => setF({ ...f, hours: { ...f.hours, [d]: e.target.value } })} placeholder="09:00-21:00" className="mt-0.5 h-9 w-full rounded-[8px] border border-border bg-surface px-2 text-sm" />
                </label>
              ))}
            </div>
            <p className="mt-1 text-[12px] text-muted">{t("hoursHint")}</p>
          </fieldset>
          <div className="mt-3 flex flex-wrap gap-4">
            <Checkbox checked={f.hasFitting} onChange={(e) => setF({ ...f, hasFitting: e.target.checked })} label={t("fitting")} />
            <Checkbox checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} label={t("active")} />
          </div>
          <FormError message={error} />
        </Dialog>
      )}
    </>
  );
}

type Wh = { id?: string; code: string; name: string; region: string; city: string; address: string; isActive: boolean };

export function WarehouseEditor({ warehouse }: { warehouse?: Wh }) {
  const t = useTranslations("adminLogistics");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Wh>(warehouse ?? { code: "", name: "", region: "toshkent_sh", city: "Toshkent", address: "", isActive: true });
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <>
      {warehouse ? (
        <button type="button" className="rounded-[8px] p-1.5 text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("edit")} onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
          {t("addWarehouse")}
        </Button>
      )}
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={warehouse ? warehouse.code : t("addWarehouse")}
          closeLabel={tc("close")}
          footer={
            <Button
              loading={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  setErrors({});
                  const res = await saveWarehouseAction({ ...f, id: warehouse?.id });
                  if (!res.ok) {
                    setErrors(res.fieldErrors ?? {});
                    return setError(res.error);
                  }
                  toast.success(t("saved"));
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {t("save")}
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("code")} htmlFor="wh-code" error={errors.code} hint="TAS-FC2">
              <Input id="wh-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label={t("name")} htmlFor="wh-name" error={errors.name}>
              <Input id="wh-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label={t("region")} htmlFor="wh-region">
              <Select id="wh-region" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
                {REGIONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {locale === "ru" ? r.ru : r.uz}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("city")} htmlFor="wh-city" error={errors.city}>
              <Input id="wh-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
            </Field>
            <Field label={t("address")} htmlFor="wh-address" error={errors.address} className="sm:col-span-2">
              <Input id="wh-address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            </Field>
          </div>
          <div className="mt-3">
            <Checkbox checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} label={t("whActiveHint")} />
          </div>
          <FormError message={error} />
        </Dialog>
      )}
    </>
  );
}
