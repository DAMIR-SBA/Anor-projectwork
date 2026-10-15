"use client";

import dynamic from "next/dynamic";
import { useActionState, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { saveAddressAction } from "@/server/actions/checkout";
import { REGIONS } from "@/lib/delivery";
import { latinToCyrillic } from "@/lib/translit";

const MapView = dynamic(() => import("@/components/map/map-view").then((m) => m.MapView), { ssr: false, loading: () => <div className="skeleton h-56 w-full" /> });

export type AddressData = { id: string; label: string | null; recipient: string; phone: string; region: string; city: string; district: string | null; street: string; house: string | null; apartment: string | null; entrance: string | null; floor: string | null; comment: string | null; lat: number | null; lng: number | null; isDefault: boolean };

export function AddressForm({ initial, onSaved, defaults }: { initial?: AddressData | null; onSaved?: (id: string) => void; defaults?: { recipient?: string | null; phone?: string | null } }) {
  const t = useTranslations("addresses");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [state, action, pending] = useActionState(saveAddressAction, null);
  const [pos, setPos] = useState<[number, number] | null>(initial?.lat && initial?.lng ? [initial.lat, initial.lng] : null);
  const fe = (f: string) => (state && !state.ok ? state.fieldErrors?.[f] : undefined);

  useEffect(() => {
    if (state?.ok) onSaved?.((state.data as { id: string }).id);
  }, [state, onSaved]);

  const regionName = (r: (typeof REGIONS)[number]) => (locale === "ru" ? r.ru : locale === "uz-Cyrl" ? latinToCyrillic(r.uz) : r.uz);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {pos && (
        <>
          <input type="hidden" name="lat" value={pos[0]} />
          <input type="hidden" name="lng" value={pos[1]} />
        </>
      )}
      <FormError message={state && !state.ok && !state.fieldErrors ? state.error : null} />
      <div className="space-y-2 sm:col-span-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{t("map")}</span>
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-semibold text-brand-ink"
            onClick={() => navigator.geolocation?.getCurrentPosition((p) => setPos([p.coords.latitude, p.coords.longitude]))}
          >
            <LocateFixed className="h-4 w-4" /> {t("locateMe")}
          </button>
        </div>
        <MapView picked={pos} center={pos} onPick={(lat, lng) => setPos([lat, lng])} fitMarkers={false} zoom={13} className="h-56 w-full overflow-hidden rounded-[14px]" />
      </div>
      <Field label={t("recipient")} htmlFor="a-recipient" error={fe("recipient")}>
        <Input id="a-recipient" name="recipient" defaultValue={initial?.recipient ?? defaults?.recipient ?? ""} required autoComplete="name" />
      </Field>
      <Field label={t("phone")} htmlFor="a-phone" error={fe("phone")}>
        <Input id="a-phone" name="phone" type="tel" defaultValue={initial?.phone ?? defaults?.phone ?? ""} placeholder="+998 90 123 45 67" required autoComplete="tel" />
      </Field>
      <Field label={t("region")} htmlFor="a-region" error={fe("region")}>
        <Select id="a-region" name="region" defaultValue={initial?.region ?? "toshkent_sh"}>
          {REGIONS.map((r) => (
            <option key={r.key} value={r.key}>
              {regionName(r)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("city")} htmlFor="a-city" error={fe("city")}>
        <Input id="a-city" name="city" defaultValue={initial?.city ?? "Toshkent"} required />
      </Field>
      <Field label={t("street")} htmlFor="a-street" error={fe("street")} className="sm:col-span-2">
        <Input id="a-street" name="street" defaultValue={initial?.street ?? ""} required autoComplete="street-address" />
      </Field>
      <div className="grid grid-cols-4 gap-2 sm:col-span-2">
        <Field label={t("house")} htmlFor="a-house">
          <Input id="a-house" name="house" defaultValue={initial?.house ?? ""} />
        </Field>
        <Field label={t("apartment")} htmlFor="a-apt">
          <Input id="a-apt" name="apartment" defaultValue={initial?.apartment ?? ""} />
        </Field>
        <Field label={t("entrance")} htmlFor="a-ent">
          <Input id="a-ent" name="entrance" defaultValue={initial?.entrance ?? ""} />
        </Field>
        <Field label={t("floor")} htmlFor="a-floor">
          <Input id="a-floor" name="floor" defaultValue={initial?.floor ?? ""} />
        </Field>
      </div>
      <Field label={t("comment")} htmlFor="a-comment" className="sm:col-span-2">
        <Textarea id="a-comment" name="comment" rows={2} defaultValue={initial?.comment ?? ""} maxLength={300} />
      </Field>
      <Field label={t("label")} htmlFor="a-label">
        <Input id="a-label" name="label" defaultValue={initial?.label ?? ""} maxLength={40} />
      </Field>
      <div className="flex items-end pb-2">
        <Checkbox name="isDefault" defaultChecked={initial?.isDefault} label={t("default")} />
      </div>
      <Button type="submit" loading={pending} className="sm:col-span-2">
        {tc("save")}
      </Button>
    </form>
  );
}
