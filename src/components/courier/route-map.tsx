"use client";

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@/components/map/map-view").then((m) => m.MapView), { ssr: false, loading: () => <div className="skeleton h-56 w-full" /> });

export function RouteMap({ stops }: { stops: Array<{ id: string; lat: number; lng: number; street?: string }> }) {
  return <MapView markers={stops.map((s, i) => ({ id: s.id, lat: s.lat, lng: s.lng, label: `${i + 1}. ${s.street ?? ""}`, active: i === 0 }))} className="h-56 w-full overflow-hidden rounded-[16px]" />;
}
