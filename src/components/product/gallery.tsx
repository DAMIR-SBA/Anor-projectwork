"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Expand, Play, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type GalleryItem = { type: "IMAGE" | "VIDEO"; url: string; alt: string };

/** Product gallery: thumbnails, hover zoom (desktop), swipe (mobile), fullscreen lightbox, video. */
export function Gallery({ items, activeUrl }: { items: GalleryItem[]; activeUrl?: string | null }) {
  const t = useTranslations("product");
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [full, setFull] = useState(false);
  const touch = useRef<number | null>(null);
  const n = items.length;
  const cur = items[i] ?? items[0];

  // Selecting a variant jumps to its photo (state adjusted during render when the prop changes).
  const [seenUrl, setSeenUrl] = useState(activeUrl);
  if (activeUrl !== seenUrl) {
    setSeenUrl(activeUrl);
    const idx = activeUrl ? items.findIndex((m) => m.url === activeUrl) : -1;
    if (idx >= 0) setI(idx);
  }

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
      if (e.key === "ArrowRight") setI((x) => (x + 1) % n);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + n) % n);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [full, n]);

  if (!cur) return <div className="aspect-square rounded-[20px] bg-surface-2" />;

  const media = (big: boolean) =>
    cur.type === "VIDEO" ? (
      <video src={cur.url} controls playsInline className="h-full w-full rounded-[16px] bg-black object-contain" />
    ) : (
      <Image src={cur.url} alt={cur.alt} fill priority sizes={big ? "100vw" : "(max-width: 1024px) 100vw, 560px"} className="object-contain" />
    );

  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      <div className="scrollbar-none flex gap-2 overflow-x-auto md:max-h-[560px] md:flex-col md:overflow-y-auto">
        {items.map((m, idx) => (
          <button
            key={m.url + idx}
            type="button"
            onClick={() => setI(idx)}
            className={cn("relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] border-2 bg-surface-2 md:h-[72px] md:w-[72px]", idx === i ? "border-primary" : "border-transparent")}
            aria-label={m.type === "VIDEO" ? t("video") : `${idx + 1}`}
            aria-current={idx === i}
          >
            {m.type === "VIDEO" ? (
              <span className="flex h-full w-full items-center justify-center bg-[#1A1A1F] text-white">
                <Play className="h-6 w-6" fill="currentColor" />
              </span>
            ) : (
              <Image src={m.url} alt="" fill sizes="72px" className="object-cover" />
            )}
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-[20px] bg-surface-2"
        onMouseMove={(e) => {
          if (cur.type !== "IMAGE" || window.matchMedia("(pointer: coarse)").matches) return;
          const r = e.currentTarget.getBoundingClientRect();
          setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
        onMouseLeave={() => setZoom(null)}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 40) setI((x) => (x + (dx < 0 ? 1 : -1) + n) % n);
          touch.current = null;
        }}
      >
        {media(false)}
        {zoom && cur.type === "IMAGE" && (
          <div className="pointer-events-none absolute inset-0 hidden bg-no-repeat md:block" style={{ backgroundImage: `url(${cur.url})`, backgroundSize: "220%", backgroundPosition: `${zoom.x}% ${zoom.y}%`, backgroundColor: "var(--surface-2)" }} aria-hidden />
        )}
        {cur.type === "IMAGE" && (
          <button type="button" onClick={() => setFull(true)} className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#1A1A1F] shadow" aria-label={t("zoom")}>
            <Expand className="h-5 w-5" />
          </button>
        )}
        {n > 1 && (
          <span className="absolute bottom-3 left-3 rounded-full bg-black/50 px-2 py-0.5 text-xs font-semibold text-white md:hidden">
            {i + 1}/{n}
          </span>
        )}
      </div>
      </div>
      {full && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/95" role="dialog" aria-modal="true">
          <button type="button" onClick={() => setFull(false)} className="absolute right-4 top-4 text-white" aria-label="Close">
            <X className="h-8 w-8" />
          </button>
          <button type="button" onClick={() => setI((x) => (x - 1 + n) % n)} className="absolute left-4 text-white" aria-label="prev">
            <ChevronLeft className="h-10 w-10" />
          </button>
          <div className="relative h-[85vh] w-[90vw]">{media(true)}</div>
          <button type="button" onClick={() => setI((x) => (x + 1) % n)} className="absolute right-4 text-white" aria-label="next">
            <ChevronRight className="h-10 w-10" />
          </button>
        </div>
      )}
    </div>
  );
}
