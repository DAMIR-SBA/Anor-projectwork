"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Heart, Pause, Play, Share2, ShoppingCart, Volume2, VolumeX } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useShopState } from "@/components/providers/shop-state";
import { useToast } from "@/components/ui/toast";
import { addToCartAction } from "@/server/actions/cart";
import { likeVideoAction, viewVideoAction } from "@/server/actions/content";
import { compactCount as compact, formatUZS, groupDigits } from "@/lib/money";
import { cn } from "@/lib/cn";
import { videoSources } from "@/lib/media";
import type { FeedVideo } from "@/server/services/videos";

/** Vertical, full-height, snap-scrolling feed. The video in view plays (muted); the rest pause. */
export function VideoFeed({ videos }: { videos: FeedVideo[] }) {
  const t = useTranslations("videos");
  const scroller = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [videos.length]);

  const go = (dir: 1 | -1) => {
    const root = scroller.current;
    const next = root?.querySelector<HTMLElement>(`[data-index="${Math.min(videos.length - 1, Math.max(0, active + dir))}"]`);
    next?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div
        ref={scroller}
        className="h-[calc(100dvh-300px)] min-h-[440px] snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-[20px] bg-[#1A1A1F] [scrollbar-width:none] md:h-[calc(100dvh-230px)]"
        tabIndex={0}
        aria-label={t("feed")}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "PageDown") {
            e.preventDefault();
            go(1);
          }
          if (e.key === "ArrowUp" || e.key === "PageUp") {
            e.preventDefault();
            go(-1);
          }
        }}
      >
        {videos.map((v, i) => (
          <VideoCard key={v.id} video={v} index={i} active={i === active} near={Math.abs(i - active) <= 1} muted={muted} onMute={() => setMuted((m) => !m)} />
        ))}
      </div>
      <div className="absolute -right-14 top-1/2 hidden -translate-y-1/2 flex-col gap-2 md:flex">
        <button type="button" onClick={() => go(-1)} disabled={active === 0} className="grid h-11 w-11 place-items-center rounded-full bg-surface shadow disabled:opacity-40" aria-label={t("previous")}>
          <ChevronUp className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => go(1)} disabled={active >= videos.length - 1} className="grid h-11 w-11 place-items-center rounded-full bg-surface shadow disabled:opacity-40" aria-label={t("next")}>
          <ChevronDown className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function VideoCard({ video, index, active, near, muted, onMute }: { video: FeedVideo; index: number; active: boolean; near: boolean; muted: boolean; onMute: () => void }) {
  const t = useTranslations("videos");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const { signedIn } = useShopState();
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [like, setLike] = useState({ liked: video.liked, likes: video.likes });
  const [pending, start] = useTransition();
  const viewed = useRef(false);

  // Play the card in view (unless the viewer paused it or prefers reduced motion); count a view after 2 s.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) {
      el.pause();
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!paused && !reduced) el.play().catch(() => {});
    const timer = setTimeout(() => {
      if (viewed.current) return;
      viewed.current = true;
      void viewVideoAction({ videoId: video.id });
    }, 2000);
    return () => clearTimeout(timer);
  }, [active, paused, near, video.id]);

  const toggleLike = () => {
    if (!signedIn) return router.push(`/auth/login?next=/videos?v=${video.id}`);
    start(async () => {
      const r = await likeVideoAction({ videoId: video.id });
      if (r.ok) setLike(r.data as { liked: boolean; likes: number });
      else toast.error(r.error);
    });
  };
  const share = async () => {
    const url = `${window.location.origin}/videos?v=${video.id}`;
    if (navigator.share) await navigator.share({ title: video.caption, url }).catch(() => {});
    else {
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success(t("linkCopied"));
    }
  };
  const addToCart = () =>
    start(async () => {
      if (!video.product?.variantId) return router.push(`/p/${video.product?.slug}`);
      const r = await addToCartAction({ variantId: video.product.variantId, quantity: 1 });
      if (r.ok) toast.success(t("added"), video.product.title);
      else toast.error(r.error);
    });

  return (
    <section data-index={index} className="relative h-full snap-start snap-always overflow-hidden" aria-label={video.caption}>
      {/* Remounts when it comes near the viewport so the sources load then, not all at once. */}
      <video
        key={near ? "near" : "far"}
        ref={ref}
        poster={video.posterUrl ?? undefined}
        className="h-full w-full object-cover"
        loop
        muted={muted}
        playsInline
        preload={near ? "auto" : "none"}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          if (el.paused) {
            void el.play();
            setPaused(false);
          } else {
            el.pause();
            setPaused(true);
          }
        }}
      >
        {near && videoSources(video.url).map((s) => <source key={s.src} src={s.src} type={s.type} />)}
      </video>
      {paused && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-black/45 text-white">
            <Play className="h-8 w-8" />
          </span>
        </span>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" />

      <div className="absolute right-3 bottom-36 flex flex-col items-center gap-4 text-white">
        <button type="button" onClick={toggleLike} disabled={pending} className="flex flex-col items-center gap-0.5 text-xs font-bold" aria-pressed={like.liked} aria-label={t("like")}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black/35">
            <Heart className={cn("h-6 w-6", like.liked && "fill-[#C8102E] text-[#C8102E]")} />
          </span>
          {compact(like.likes, locale)}
        </button>
        <button type="button" onClick={share} className="flex flex-col items-center gap-0.5 text-xs font-bold" aria-label={t("share")}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black/35">
            <Share2 className="h-5 w-5" />
          </span>
          {t("share")}
        </button>
        <button type="button" onClick={onMute} className="grid h-11 w-11 place-items-center rounded-full bg-black/35" aria-label={muted ? t("unmute") : t("mute")}>
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            if (el.paused) {
              void el.play();
              setPaused(false);
            } else {
              el.pause();
              setPaused(true);
            }
          }}
          className="grid h-11 w-11 place-items-center rounded-full bg-black/35"
          aria-label={paused ? t("play") : t("pause")}
        >
          {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 space-y-2 p-3 text-white">
        <Link href={`/shop/${video.shop.slug}`} className="flex w-fit items-center gap-2 text-sm font-bold">
          <span className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-white text-xs font-extrabold text-[#C8102E]">
            {video.shop.logoUrl ? <Image src={video.shop.logoUrl} alt="" fill sizes="32px" className="object-cover" /> : video.shop.name.slice(0, 1)}
          </span>
          {video.shop.name}
        </Link>
        <p className="line-clamp-2 pr-16 text-[15px] leading-snug">{video.caption}</p>
        <p className="text-xs text-white/70">{t("views", { count: video.views, n: groupDigits(video.views) })}</p>
        {video.product && (
          <div className="flex items-center gap-2 rounded-[14px] bg-white p-2 text-fg dark:bg-[#26262C] dark:text-white">
            <Link href={`/p/${video.product.slug}`} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">
              {video.product.image && <Image src={video.product.image} alt="" fill sizes="48px" className="object-cover" />}
            </Link>
            <Link href={`/p/${video.product.slug}`} className="min-w-0 flex-1">
              <span className="line-clamp-1 text-sm font-semibold">{video.product.title}</span>
              <span className="text-sm font-extrabold">{formatUZS(video.product.price, locale)}</span>
            </Link>
            <button type="button" onClick={addToCart} disabled={pending || !video.product.inStock} className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#C8102E] text-white disabled:opacity-50" aria-label={t("addToCart")}>
              <ShoppingCart className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
