"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapMarker = { id: string; lat: number; lng: number; label: string; active?: boolean };

const TILE = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "&copy; OpenStreetMap contributors";
const DEFAULT: [number, number] = [Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT || 41.3111), Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG || 69.2797)];

function pin(active: boolean) {
  const fill = active ? "#C8102E" : "#1A1A1F";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 39s13-13.2 13-24A13 13 0 0 0 2 15c0 10.8 13 24 13 24z" fill="${fill}" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="#F5B301"/></svg>`;
}

/**
 * Leaflet map (client-only). Markers for pickup points; with `onPick` the user can click /
 * drag to choose a location (address picker). Tiles come from NEXT_PUBLIC_MAP_TILE_URL.
 */
export function MapView({ markers = [], center, zoom = 12, onMarkerClick, onPick, picked, className, fitMarkers = true }: { markers?: MapMarker[]; center?: [number, number] | null; zoom?: number; onMarkerClick?: (id: string) => void; onPick?: (lat: number, lng: number) => void; picked?: [number, number] | null; className?: string; fitMarkers?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const cb = useRef({ onMarkerClick, onPick });
  cb.current = { onMarkerClick, onPick };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !el.current || map.current) return;
      L.current = leaflet;
      map.current = leaflet.map(el.current, { zoomControl: true, attributionControl: true }).setView(center ?? picked ?? DEFAULT, zoom);
      leaflet.tileLayer(TILE, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map.current);
      layer.current = leaflet.layerGroup().addTo(map.current);
      map.current.on("click", (e) => cb.current.onPick?.(e.latlng.lat, e.latlng.lng));
      draw();
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = () => {
    const leaflet = L.current;
    if (!leaflet || !map.current || !layer.current) return;
    layer.current.clearLayers();
    for (const m of markers) {
      const icon = leaflet.divIcon({ html: pin(!!m.active), className: "", iconSize: [30, 40], iconAnchor: [15, 39] });
      leaflet
        .marker([m.lat, m.lng], { icon, title: m.label, keyboard: true })
        .on("click", () => cb.current.onMarkerClick?.(m.id))
        .bindTooltip(m.label)
        .addTo(layer.current);
    }
    if (picked) {
      const icon = leaflet.divIcon({ html: pin(true), className: "", iconSize: [30, 40], iconAnchor: [15, 39] });
      const marker = leaflet.marker(picked, { icon, draggable: true }).addTo(layer.current);
      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        cb.current.onPick?.(ll.lat, ll.lng);
      });
    }
    if (fitMarkers && markers.length > 1 && !center) map.current.fitBounds(leaflet.latLngBounds(markers.map((m) => [m.lat, m.lng])), { padding: [30, 30], maxZoom: 13 });
  };

  useEffect(draw);
  useEffect(() => {
    if (center && map.current) map.current.setView(center, Math.max(map.current.getZoom(), 13));
  }, [center]);

  return <div ref={el} className={className ?? "h-80 w-full overflow-hidden rounded-[16px]"} role="application" aria-label="Map" />;
}
