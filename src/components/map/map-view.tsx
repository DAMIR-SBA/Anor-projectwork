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

type DrawInput = { markers: MapMarker[]; picked?: [number, number] | null; fitMarkers: boolean; center?: [number, number] | null };
type Callbacks = { onMarkerClick?: (id: string) => void; onPick?: (lat: number, lng: number) => void };

/** Redraw markers (and the draggable picked pin) on the layer. */
function drawMarkers(leaflet: typeof import("leaflet"), map: LeafletMap, layer: LayerGroup, o: DrawInput, cb: { current: Callbacks }) {
  layer.clearLayers();
  for (const m of o.markers) {
    const icon = leaflet.divIcon({ html: pin(!!m.active), className: "", iconSize: [30, 40], iconAnchor: [15, 39] });
    leaflet
      .marker([m.lat, m.lng], { icon, title: m.label, keyboard: true })
      .on("click", () => cb.current.onMarkerClick?.(m.id))
      .bindTooltip(m.label)
      .addTo(layer);
  }
  if (o.picked) {
    const icon = leaflet.divIcon({ html: pin(true), className: "", iconSize: [30, 40], iconAnchor: [15, 39] });
    const marker = leaflet.marker(o.picked, { icon, draggable: true }).addTo(layer);
    marker.on("dragend", () => {
      const ll = marker.getLatLng();
      cb.current.onPick?.(ll.lat, ll.lng);
    });
  }
  if (o.fitMarkers && o.markers.length > 1 && !o.center) map.fitBounds(leaflet.latLngBounds(o.markers.map((m) => [m.lat, m.lng])), { padding: [30, 30], maxZoom: 13 });
}

/**
 * Leaflet map (client-only). Markers for pickup points; with `onPick` the user can click /
 * drag to choose a location (address picker). Tiles come from NEXT_PUBLIC_MAP_TILE_URL.
 */
export function MapView({ markers = [], center, zoom = 12, onMarkerClick, onPick, picked, className, fitMarkers = true, label = "Map" }: { markers?: MapMarker[]; center?: [number, number] | null; zoom?: number; onMarkerClick?: (id: string) => void; onPick?: (lat: number, lng: number) => void; picked?: [number, number] | null; className?: string; fitMarkers?: boolean; label?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const cb = useRef<Callbacks>({ onMarkerClick, onPick });
  const latest = useRef<DrawInput>({ markers, picked, fitMarkers, center });
  const initial = useRef({ center, picked, zoom });

  // Callbacks and inputs change every render; the map reads the latest through refs.
  useEffect(() => {
    cb.current = { onMarkerClick, onPick };
    latest.current = { markers, picked, fitMarkers, center };
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !el.current || map.current) return;
      L.current = leaflet;
      const start = initial.current;
      map.current = leaflet.map(el.current, { zoomControl: true, attributionControl: true }).setView(start.center ?? start.picked ?? DEFAULT, start.zoom);
      leaflet.tileLayer(TILE, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map.current);
      layer.current = leaflet.layerGroup().addTo(map.current);
      map.current.on("click", (e) => cb.current.onPick?.(e.latlng.lat, e.latlng.lng));
      drawMarkers(leaflet, map.current, layer.current, latest.current, cb);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (L.current && map.current && layer.current) drawMarkers(L.current, map.current, layer.current, { markers, picked, fitMarkers, center }, cb);
  }, [markers, picked, fitMarkers, center]);
  useEffect(() => {
    if (center && map.current) map.current.setView(center, Math.max(map.current.getZoom(), 13));
  }, [center]);

  return <div ref={el} className={className ?? "h-80 w-full overflow-hidden rounded-[16px]"} role="application" aria-label={label} />;
}
