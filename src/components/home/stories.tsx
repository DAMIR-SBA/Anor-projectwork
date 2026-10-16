"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export type StoryData = { id: string; shopName: string; shopSlug: string; logo: string | null; title: string; body: string | null; media: string; productSlugs: string[]; artisan: boolean };

/** Instagram-like seller stories: avatars row + full-screen viewer with progress bars. */
export function Stories({ stories, labels }: { stories: StoryData[]; labels: { title: string; shop: string; close: string; prev: string; next: string } }) {
  const [open, setOpen] = useState<number | null>(null);
  // Progress belongs to one story; a different story simply starts from 0.
  const [tick, setTick] = useState({ index: -1, value: 0 });
  const progress = tick.index === open ? tick.value : 0;

  useEffect(() => {
    if (open == null) return;
    const started = Date.now();
    const id = setInterval(() => {
      const p = (Date.now() - started) / 6000;
      if (p >= 1) {
        setOpen((o) => (o != null && o + 1 < stories.length ? o + 1 : null));
      } else setTick({ index: open, value: p });
    }, 50);
    return () => clearInterval(id);
  }, [open, stories.length]);

  if (!stories.length) return null;
  const s = open != null ? stories[open] : null;
  return (
    <section className="py-2" aria-label={labels.title}>
      <div className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {stories.map((st, i) => (
          <button key={st.id} type="button" onClick={() => setOpen(i)} className="flex w-[76px] shrink-0 flex-col items-center gap-1.5">
            <span className={cn("rounded-full p-[3px]", st.artisan ? "bg-gradient-to-tr from-accent to-[#0E8C8C]" : "bg-gradient-to-tr from-accent to-primary")}>
              <span className="block rounded-full border-[3px] border-surface-2">
                <Image src={st.media} alt="" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
              </span>
            </span>
            <span className="line-clamp-2 text-center text-xs font-medium leading-tight">{st.title}</span>
          </button>
        ))}
      </div>
      {s && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90" role="dialog" aria-modal="true" aria-label={s.title}>
          <div className="relative h-full max-h-[760px] w-full max-w-[430px] overflow-hidden bg-[#111] md:rounded-[20px]">
            <div className="absolute inset-x-3 top-3 z-10 flex gap-1">
              {stories.map((x, i) => (
                <span key={x.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                  <span className="block h-full bg-white" style={{ width: i < open! ? "100%" : i === open ? `${progress * 100}%` : "0%" }} />
                </span>
              ))}
            </div>
            <div className="absolute inset-x-3 top-7 z-10 flex items-center justify-between text-white">
              <Link href={`/shop/${s.shopSlug}`} className="flex items-center gap-2 text-sm font-bold" onClick={() => setOpen(null)}>
                {s.logo && <Image src={s.logo} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />}
                {s.shopName}
              </Link>
              <button type="button" onClick={() => setOpen(null)} aria-label={labels.close}>
                <X className="h-6 w-6" />
              </button>
            </div>
            <Image src={s.media} alt="" fill sizes="430px" className="object-cover" />
            <button type="button" className="absolute inset-y-0 left-0 w-1/3" aria-label={labels.prev} onClick={() => setOpen((o) => (o! > 0 ? o! - 1 : o))} />
            <button type="button" className="absolute inset-y-0 right-0 w-1/3" aria-label={labels.next} onClick={() => setOpen((o) => (o! + 1 < stories.length ? o! + 1 : null))} />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-5 pt-20 text-white">
              <h3 className="text-xl font-extrabold">{s.title}</h3>
              {s.body && <p className="mt-1 text-sm text-white/90">{s.body}</p>}
              {s.productSlugs[0] && (
                <Link href={`/p/${s.productSlugs[0]}`} onClick={() => setOpen(null)} className="mt-4 inline-flex rounded-[12px] bg-white px-4 py-2 text-sm font-bold text-[#1A1A1F]">
                  {labels.shop} →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
