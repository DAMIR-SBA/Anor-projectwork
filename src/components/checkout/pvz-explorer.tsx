"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Clock, LocateFixed, MapPin, Shirt } from "lucide-react";
import { cn } from "@/lib/cn";

const MapView = dynamic(() => import("@/components/map/map-view").then((m) => m.MapView), { ssr: false, loading: () => <div className="skeleton h-80 w-full" /> });

export type Pvz = { id: string; name: string; city: string; district: string; address: string; lat: number; lng: number; hours: Record<string, string>; storageDays: number; hasFitting: boolean };

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function PvzExplorer({ points, selectedId, onSelect, compact }: { points: Pvz[]; selectedId?: string | null; onSelect?: (p: Pvz) => void; compact?: boolean }) {
  const t = useTranslations("pvz");
  const cities = useMemo(() => [...new Set(points.map((p) => p.city))], [points]);
  const [city, setCity] = useState<string>("");
  const [me, setMe] = useState<[number, number] | null>(null);
  const [active, setActive] = useState<string | null>(selectedId ?? null);
  const [focus, setFocus] = useState<[number, number] | null>(null);

  const list = useMemo(() => {
    let l = points.filter((p) => !city || p.city === city);
    if (me) l = [...l].sort((a, b) => haversineKm(me, [a.lat, a.lng]) - haversineKm(me, [b.lat, b.lng]));
    return l;
  }, [points, city, me]);

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const here: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMe(here);
        setCity("");
        setFocus(here);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000 },
    );

  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  return (
    <div className={cn("grid gap-4", !compact && "lg:grid-cols-[380px_minmax(0,1fr)]")}>
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex gap-2">
          <select value={city} onChange={(e) => setCity(e.target.value)} className="h-10 flex-1 rounded-[12px] border border-border bg-surface px-3 text-sm font-semibold" aria-label={t("city")}>
            <option value="">{t("allCities")}</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button type="button" onClick={locate} className="flex h-10 items-center gap-1.5 rounded-[12px] bg-surface-3 px-3 text-sm font-bold">
            <LocateFixed className="h-4 w-4" /> {t("nearest")}
          </button>
        </div>
        <ul className={cn("space-y-2 overflow-y-auto pr-1", compact ? "max-h-72" : "max-h-[520px]")}>
          {list.map((p) => {
            const sel = (selectedId ?? active) === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActive(p.id);
                    setFocus([p.lat, p.lng]);
                    onSelect?.(p);
                  }}
                  className={cn("w-full rounded-[14px] border-2 bg-surface p-3 text-left transition-colors", sel ? "border-primary" : "border-transparent hover:border-border")}
                  aria-pressed={sel}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold">{p.name}</p>
                    {me && <span className="shrink-0 text-xs font-semibold text-muted">{t("distance", { km: haversineKm(me, [p.lat, p.lng]).toFixed(1) })}</span>}
                    {sel && onSelect && <Check className="h-5 w-5 shrink-0 text-primary" />}
                  </div>
                  <p className="mt-0.5 flex items-start gap-1 text-sm text-muted">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {p.city}, {p.address}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {t("days.mon")}–{t("days.fri")} {p.hours.mon} · {t("days.sun")} {p.hours.sun}
                    </span>
                    {p.hasFitting && (
                      <span className="flex items-center gap-1">
                        <Shirt className="h-3.5 w-3.5" /> {t("fitting")}
                      </span>
                    )}
                    <span>{t("storage", { days: p.storageDays })}</span>
                  </p>
                  {sel && !compact && (
                    <ul className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px]">
                      {days.map((d) => (
                        <li key={d} className="rounded bg-surface-2 py-1">
                          <b className="block">{t(`days.${d}`)}</b>
                          {p.hours[d]?.replace("-", "–")}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <MapView
        markers={list.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, label: p.name, active: (selectedId ?? active) === p.id }))}
        center={focus}
        onMarkerClick={(id) => {
          const p = points.find((x) => x.id === id);
          if (!p) return;
          setActive(id);
          onSelect?.(p);
        }}
        className={cn("w-full overflow-hidden rounded-[16px]", compact ? "h-64" : "h-[420px] lg:h-[580px]")}
      />
    </div>
  );
}
