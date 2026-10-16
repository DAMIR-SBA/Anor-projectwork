"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export type Slide = { id: string; title: string; subtitle: string | null; href: string; image: string | null; bg: string };

/** Auto-advancing hero carousel with swipe, arrows, dots; pauses on hover/focus and for reduced motion. */
export function HeroCarousel({ slides, labels }: { slides: Slide[]; labels: { prev: string; next: string } }) {
  const [i, setI] = useState(0);
  const paused = useRef(false);
  const touch = useRef<number | null>(null);
  const n = slides.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);

  useEffect(() => {
    if (n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => !paused.current && go(1), 6000);
    return () => clearInterval(id);
  }, [n, go]);

  if (!n) return null;
  return (
    <section
      className="relative overflow-hidden rounded-[20px]"
      aria-roledescription="carousel"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((s, idx) => (
          <div key={s.id} role="group" aria-roledescription="slide" aria-label={`${idx + 1} / ${n}`} className="w-full shrink-0">
          <Link
            href={s.href}
            className="relative flex h-[200px] w-full items-center overflow-hidden px-6 text-white sm:h-[260px] md:h-[320px] md:px-12"
            style={{ background: s.bg }}
            tabIndex={idx === i ? 0 : -1}
          >
            <div className="relative z-10 max-w-[60%] md:max-w-[50%]">
              <h2 className="text-2xl font-extrabold leading-tight sm:text-3xl md:text-5xl">{s.title}</h2>
              {s.subtitle && <p className="mt-2 text-sm text-white/90 sm:text-base md:mt-3 md:text-lg">{s.subtitle}</p>}
            </div>
            {s.image && (
              <div className="absolute -right-6 bottom-0 top-0 aspect-square md:right-8">
                <Image src={s.image} alt="" fill sizes="(max-width: 768px) 60vw, 420px" className="rounded-full object-cover opacity-95 [mask-image:radial-gradient(circle,#000_60%,transparent_72%)]" priority={idx === 0} />
              </div>
            )}
            <span aria-hidden className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
            <span aria-hidden className="absolute bottom-6 left-1/3 h-6 w-6 rounded-full bg-accent/80" />
          </Link>
          </div>
        ))}
      </div>
      {n > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1A1A1F] shadow md:flex" aria-label={labels.prev}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => go(1)} className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1A1A1F] shadow md:flex" aria-label={labels.next}>
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((s, idx) => (
              <button key={s.id} type="button" onClick={() => setI(idx)} className={cn("h-2 rounded-full bg-white transition-all", idx === i ? "w-6" : "w-2 opacity-60")} aria-label={`${idx + 1}`} aria-current={idx === i} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
