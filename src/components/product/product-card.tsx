"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Heart, ShoppingCart, Check, Zap, Clock } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useShopState } from "@/components/providers/shop-state";
import { useToast } from "@/components/ui/toast";
import { Countdown } from "@/components/ui/interactive";
import { addToCartAction } from "@/server/actions/cart";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { ProductCardData } from "@/lib/types";
import { RatingInline } from "./rating";

export function ProductCard({ p, priority, sponsored }: { p: ProductCardData; priority?: boolean; sponsored?: boolean }) {
  const t = useTranslations("product");
  const tc = useTranslations("catalog");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const { isLiked, toggleLike } = useShopState();
  const liked = isLiked(p.id);
  const [added, setAdded] = useState(false);
  const [pending, start] = useTransition();

  const add = () => {
    if (!p.variantId) return;
    if (p.variantCount > 1) return router.push(`/p/${p.slug}`);
    // Optimistic "added" state; reverted if the server rejects.
    setAdded(true);
    start(async () => {
      const r = await addToCartAction({ variantId: p.variantId!, quantity: 1 });
      if (!r.ok) {
        setAdded(false);
        toast.error(r.error);
      }
    });
  };

  return (
    <article className="group relative flex flex-col rounded-[16px] bg-surface p-2 transition-shadow hover:shadow-[var(--shadow-lift)] sm:p-2.5">
      <div className="relative aspect-[3/4] overflow-hidden rounded-[12px] bg-surface-2">
        <Link href={`/p/${p.slug}`} aria-label={p.title} className="absolute inset-0">
          {p.image && (
            <Image src={p.image} alt={p.title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px" className={cn("object-cover transition-opacity duration-300", p.hoverImage && "group-hover:opacity-0")} priority={priority} />
          )}
          {p.hoverImage && <Image src={p.hoverImage} alt="" fill sizes="240px" className="object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100" />}
        </Link>
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
          {p.discountPct > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-extrabold text-white">−{p.discountPct}%</span>}
          {p.badges.flash && (
            <span className="flex items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-[#1A1A1F]">
              <Zap className="h-3 w-3" /> {t("flash")}
            </span>
          )}
          {p.badges.used && <span className="rounded-full bg-[#1A1A1F] px-2 py-0.5 text-xs font-bold text-white">{t("used")}</span>}
          {p.badges.preorder && <span className="rounded-full bg-info px-2 py-0.5 text-xs font-bold text-white">{t("preorder")}</span>}
        </div>
        <button
          type="button"
          onClick={() => toggleLike(p.id)}
          aria-pressed={liked}
          aria-label={liked ? t("wishlistRemove") : t("wishlistAdd")}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#1A1A1F] shadow-sm backdrop-blur transition-transform hover:scale-110 active:scale-95"
        >
          <Heart className={cn("h-5 w-5", liked && "fill-primary text-primary")} />
        </button>
        <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1">
          {p.badges.madeInUz && <span className="rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-bold text-[#0E6E6E]">🇺🇿 UZ</span>}
          {p.badges.halal && <span className="rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-bold text-success">{t("halal")}</span>}
          {p.badges.fast && <span className="rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-bold text-[#8E0B22]">⚡ {t("fast")}</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-1 pb-1 pt-2.5">
        {sponsored && <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{tc("sponsored")}</span>}
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className={cn("tabular text-[17px] font-extrabold leading-tight tracking-tight", p.oldPrice && "text-brand-ink")}>{formatUZS(p.price, locale)}</span>
          {p.oldPrice && <s className="tabular text-xs text-muted">{formatUZS(p.oldPrice, locale)}</s>}
        </div>
        {p.monthly && (
          <span className="w-fit rounded-md bg-accent-50 px-1.5 py-0.5 text-xs font-bold text-[#7a5600] dark:bg-accent/15 dark:text-accent">
            {t("monthly", { amount: formatUZS(p.monthly.amount, locale), months: p.monthly.months })}
          </span>
        )}
        <Link href={`/p/${p.slug}`} className="line-clamp-2 text-sm leading-snug text-fg hover:text-primary">
          {p.title}
        </Link>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <RatingInline rating={p.rating} count={p.reviewCount} />
          {p.dealEndsAt && (
            <span className="flex items-center gap-1 text-xs font-semibold text-brand-ink">
              <Clock className="h-3.5 w-3.5" />
              <Countdown to={p.dealEndsAt} />
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={add}
          disabled={!p.inStock && !p.badges.preorder}
          className={cn(
            "mt-1.5 flex h-9 items-center justify-center gap-1.5 rounded-[10px] text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            added ? "bg-success text-white" : "bg-primary text-white hover:bg-primary-dark",
          )}
          aria-busy={pending}
        >
          {added ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
          {!p.inStock && !p.badges.preorder ? t("outOfStock") : added ? t("inCart") : p.badges.preorder ? t("preorder") : t("addToCart")}
        </button>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-[16px] bg-surface p-2.5">
      <div className="skeleton aspect-[3/4] w-full" />
      <div className="skeleton mt-3 h-5 w-2/3" />
      <div className="skeleton mt-2 h-4 w-full" />
      <div className="skeleton mt-1.5 h-4 w-4/5" />
      <div className="skeleton mt-3 h-9 w-full" />
    </div>
  );
}
