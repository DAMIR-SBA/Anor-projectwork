"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bell, BellRing, GitCompare, Heart, Minus, Plus, Share2, ShoppingCart, TrendingDown, Zap } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useShopState } from "@/components/providers/shop-state";
import { useToast } from "@/components/ui/toast";
import { Countdown } from "@/components/ui/interactive";
import { Button } from "@/components/ui/button";
import { addToCartAction, subscribeAlertAction } from "@/server/actions/cart";
import { trackShareAction } from "@/server/actions/rewards";
import { formatUZS } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";
import { cn } from "@/lib/cn";
import type { Plan } from "@/lib/installment";
import { InstallmentWidget } from "./installment-widget";
import { QuoteRequestButton } from "@/components/b2b/b2b-tools";

export type BuyVariant = { id: string; title: string; price: number; oldPrice: number | null; stock: number; image: string | null };

type Props = {
  product: { id: string; slug: string; title: string; isPreorder: boolean; preorderDate: string | null; nasiyaEligible: boolean; lowest90: number | null; wholesale: Array<{ minQty: number; price: number }> | null };
  variants: BuyVariant[];
  plans: Plan[];
  campaign: { salePrice: number; endsAt: string; name: string } | null;
  alerts: { priceDrop: boolean; backInStock: boolean };
  /** B2B: verified companies can request a quote; others are pointed to the business account. */
  business: "verified" | "none" | "guest";
  onVariantImage?: (url: string | null) => void;
};

export function BuyBox({ product, variants, plans, campaign, alerts, business, onVariantImage }: Props) {
  const t = useTranslations("product");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const { isLiked, toggleLike, compare, toggleCompare, signedIn } = useShopState();
  const [vid, setVid] = useState(variants.find((v) => v.stock > 0)?.id ?? variants[0]?.id);
  const [qty, setQty] = useState(1);
  const [pending, start] = useTransition();
  const [alertState, setAlertState] = useState(alerts);
  const v = variants.find((x) => x.id === vid) ?? variants[0];

  const price = campaign ? Math.min(campaign.salePrice, v.price) : v.price;
  const oldPrice = campaign ? Math.max(v.oldPrice ?? v.price, v.price) : v.oldPrice;
  const discount = oldPrice && oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
  const available = v.stock > 0 || product.isPreorder;
  const max = product.isPreorder ? 99 : Math.max(1, v.stock);

  const add = (thenCheckout: boolean) =>
    start(async () => {
      const r = await addToCartAction({ variantId: v.id, quantity: qty });
      if (!r.ok) return void toast.error(r.error);
      if (thenCheckout) router.push("/cart");
      else toast.success(t("added"), t("goToCart"));
    });

  const alert = (type: "PRICE_DROP" | "BACK_IN_STOCK") => {
    if (!signedIn) return router.push(`/auth/login?next=/p/${product.slug}`);
    start(async () => {
      const r = await subscribeAlertAction({ productId: product.id, variantId: v.id, type, targetPrice: type === "PRICE_DROP" ? price : undefined });
      if (!r.ok) return void toast.error(r.error);
      const sub = (r.data as { subscribed: boolean }).subscribed;
      setAlertState((s) => (type === "PRICE_DROP" ? { ...s, priceDrop: sub } : { ...s, backInStock: sub }));
      if (sub) toast.success(type === "PRICE_DROP" ? t("priceDropSubscribed") : t("notifySubscribed"));
    });
  };

  const share = async () => {
    const url = window.location.href;
    void trackShareAction({});
    try {
      const tg = window.Telegram?.WebApp;
      if (tg?.openTelegramLink) tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(product.title)}`);
      else if (navigator.share) await navigator.share({ title: product.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t("linkCopied"));
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="space-y-4">
      {campaign && (
        <div className="flex items-center justify-between rounded-[14px] bg-gradient-to-r from-primary to-primary-dark px-4 py-2.5 text-white">
          <span className="flex items-center gap-1.5 text-sm font-bold">
            <Zap className="h-4 w-4 text-accent" /> {campaign.name}
          </span>
          <Countdown to={campaign.endsAt} className="text-sm font-extrabold text-accent" labels={{ d: "d" }} />
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <span className={cn("tabular text-[32px] font-extrabold leading-none tracking-tight", discount > 0 && "text-brand-ink")}>{formatUZS(price, locale)}</span>
          {oldPrice && oldPrice > price && <s className="tabular pb-0.5 text-lg text-muted">{formatUZS(oldPrice, locale)}</s>}
          {discount > 0 && <span className="mb-1 rounded-full bg-primary px-2 py-0.5 text-sm font-extrabold text-white">−{discount}%</span>}
        </div>
        {product.lowest90 && price <= product.lowest90 && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-1 text-xs font-bold text-success">
            <TrendingDown className="h-3.5 w-3.5" /> {t("lowest90")}
          </p>
        )}
      </div>

      {variants.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">
            {t("variant")}: <span className="text-muted">{v.title}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => {
                  setVid(x.id);
                  setQty(1);
                  onVariantImage?.(x.image);
                }}
                aria-pressed={x.id === v.id}
                className={cn(
                  "flex items-center gap-2 rounded-[12px] border-2 px-2.5 py-1.5 text-sm font-semibold transition-colors",
                  x.id === v.id ? "border-primary bg-primary-50 dark:bg-primary/15" : "border-border bg-surface hover:border-muted",
                  x.stock <= 0 && !product.isPreorder && "opacity-50 line-through",
                )}
              >
                {x.image && variants.some((o) => o.image !== x.image) && <Image src={x.image} alt="" width={28} height={28} className="h-7 w-7 rounded-md object-cover" />}
                {x.title}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {product.wholesale && product.wholesale.length > 0 ? (
        <div className="space-y-2 rounded-[12px] bg-surface-2 p-3 text-sm">
          <div>
            <p className="mb-1 font-bold">{t("wholesale")}</p>
            <ul className="space-y-0.5 text-muted">
              {product.wholesale.map((w) => (
                <li key={w.minQty}>{t("wholesaleFrom", { qty: w.minQty, price: formatUZS(w.price, locale) })}</li>
              ))}
            </ul>
            {business !== "verified" && <p className="mt-1 text-xs text-muted">{t("wholesaleBusinessOnly")}</p>}
          </div>
          <QuoteRequestButton productId={product.id} productSlug={product.slug} variants={variants.map((x) => ({ id: x.id, title: x.title, price: x.price }))} variantId={v.id} business={business} />
        </div>
      ) : (
        business === "verified" && <QuoteRequestButton productId={product.id} productSlug={product.slug} variants={variants.map((x) => ({ id: x.id, title: x.title, price: x.price }))} variantId={v.id} business={business} />
      )}

      <p className={cn("text-sm font-semibold", v.stock > 0 && v.stock <= 5 ? "text-danger" : "text-success")}>
        {product.isPreorder && product.preorderDate
          ? t("preorderShips", { date: fmtDay(product.preorderDate, locale) })
          : v.stock <= 0
            ? t("outOfStock")
            : v.stock <= 5
              ? t("lowStock", { count: v.stock })
              : t("inStock", { count: v.stock })}
      </p>

      {available ? (
        <div className="flex gap-2">
          <div className="flex h-12 items-center rounded-[12px] border border-border bg-surface">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-full w-11 items-center justify-center" aria-label={tc("prev")}>
              <Minus className="h-4 w-4" />
            </button>
            <span className="tabular w-8 text-center font-bold" aria-live="polite">
              {qty}
            </span>
            <button type="button" onClick={() => setQty((q) => Math.min(max, q + 1))} className="flex h-full w-11 items-center justify-center" aria-label={tc("next")}>
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <Button size="lg" className="flex-1" loading={pending} onClick={() => add(false)} leftIcon={<ShoppingCart className="h-5 w-5" />}>
            {product.isPreorder ? t("preorder") : t("addToCart")}
          </Button>
        </div>
      ) : (
        <Button size="lg" variant="outline" className="w-full" onClick={() => alert("BACK_IN_STOCK")} leftIcon={alertState.backInStock ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}>
          {alertState.backInStock ? t("notifySubscribed") : t("notifyMe")}
        </Button>
      )}
      {available && (
        <Button size="lg" variant="accent" className="w-full" disabled={pending} onClick={() => add(true)}>
          {t("buyNow")}
        </Button>
      )}

      <InstallmentWidget price={price} plans={plans} eligible={product.nasiyaEligible} />

      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => toggleLike(product.id)} className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-2 text-sm font-semibold hover:bg-surface-3" aria-pressed={isLiked(product.id)}>
          <Heart className={cn("h-4.5 w-4.5", isLiked(product.id) && "fill-primary text-primary")} /> {isLiked(product.id) ? t("wishlistRemove") : t("wishlistAdd")}
        </button>
        <button type="button" onClick={() => toggleCompare(product.id)} className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-2 text-sm font-semibold hover:bg-surface-3" aria-pressed={compare.includes(product.id)}>
          <GitCompare className="h-4.5 w-4.5" /> {compare.includes(product.id) ? t("inCompare") : t("compare")}
        </button>
        <button type="button" onClick={() => alert("PRICE_DROP")} className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-2 text-sm font-semibold hover:bg-surface-3" aria-pressed={alertState.priceDrop}>
          <TrendingDown className="h-4.5 w-4.5" /> {alertState.priceDrop ? t("priceDropSubscribed") : t("priceDropAlert")}
        </button>
        <button type="button" onClick={share} className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-2 text-sm font-semibold hover:bg-surface-3">
          <Share2 className="h-4.5 w-4.5" /> {t("share")}
        </button>
      </div>
      {compare.length > 1 && (
        <Link href="/compare" className="block text-sm font-bold text-brand-ink">
          → {compare.length}
        </Link>
      )}
    </div>
  );
}
