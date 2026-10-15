"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

export type MediaItem = { url: string; type: "IMAGE" | "VIDEO" };

export function MediaThumb({ item, size = 72, onClick, label }: { item: MediaItem; size?: number; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="relative shrink-0 overflow-hidden rounded-[10px] bg-surface-2 outline-offset-2" style={{ width: size, height: size }} aria-label={label}>
      {item.type === "VIDEO" ? (
        <>
          <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
          <Play className="absolute inset-0 m-auto h-6 w-6 text-white drop-shadow" fill="currentColor" />
        </>
      ) : (
        <Image src={item.url} alt="" fill sizes={`${size}px`} className="object-cover" />
      )}
    </button>
  );
}

/** Full-screen viewer for review photos/videos with arrow-key navigation. */
export function MediaLightbox({ items, index, onClose }: { items: MediaItem[]; index: number | null; onClose: () => void }) {
  const t = useTranslations("reviews");
  const tc = useTranslations("common");
  // Mounted only while open, so the starting index is read once.
  const [cur, setCur] = useState(index ?? 0);
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setCur((c) => (c + 1) % items.length);
      if (e.key === "ArrowLeft") setCur((c) => (c - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length]);
  const item = items[cur];
  return (
    <Dialog open={index !== null && !!item} onClose={onClose} title={t("photoN", { n: cur + 1 })} closeLabel={tc("close")} className="max-w-3xl">
      {item && (
        <div className="relative">
          <div className="relative aspect-square w-full overflow-hidden rounded-[12px] bg-surface-2 sm:aspect-[4/3]">
            {item.type === "VIDEO" ? <video src={item.url} className="h-full w-full object-contain" controls autoPlay /> : <Image src={item.url} alt={t("photoN", { n: cur + 1 })} fill sizes="(max-width: 768px) 100vw, 720px" className="object-contain" />}
          </div>
          {items.length > 1 && (
            <>
              <button type="button" onClick={() => setCur((c) => (c - 1 + items.length) % items.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-surface/90 p-2 shadow" aria-label={tc("back")}>
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setCur((c) => (c + 1) % items.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-surface/90 p-2 shadow" aria-label={tc("next")}>
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="mt-3 flex justify-center gap-1.5">
                {items.map((m, i) => (
                  <span key={m.url + i} className={cn("h-1.5 w-1.5 rounded-full", i === cur ? "bg-primary" : "bg-border")} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
