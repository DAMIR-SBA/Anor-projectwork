"use client";

import Image from "next/image";
import { useOptimistic, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Heart, Minus, Plus, ShoppingBag, TicketPercent, Trash2, Users, X } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { CopyButton } from "@/components/ui/interactive";
import { useToast } from "@/components/ui/toast";
import { applyCouponAction, createGroupCartAction, moveToWishlistAction, removeCartItemsAction, toggleCartItemsAction, updateCartItemAction } from "@/server/actions/cart";
import { formatUZS, groupDigits } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { CartItemView, CartView as CartData } from "@/lib/types";

type Op = { type: "qty"; itemId: string; quantity: number } | { type: "remove"; itemIds: string[] } | { type: "select"; itemIds: string[]; selected: boolean };

function applyOp(cart: CartData, op: Op): CartData {
  const mapItems = (fn: (i: CartItemView) => CartItemView | null) => ({
    ...cart,
    groups: cart.groups.map((g) => ({ ...g, items: g.items.map(fn).filter(Boolean) as CartItemView[] })).filter((g) => g.items.length),
  });
  if (op.type === "qty") return mapItems((i) => (i.id === op.itemId ? (op.quantity <= 0 ? null : { ...i, quantity: op.quantity, lineTotal: i.price * op.quantity }) : i));
  if (op.type === "remove") return mapItems((i) => (op.itemIds.includes(i.id) ? null : i));
  return mapItems((i) => (op.itemIds.includes(i.id) ? { ...i, selected: op.selected } : i));
}

export function CartView({ initial, signedIn, isOwner = true, appUrl }: { initial: CartData; signedIn: boolean; isOwner?: boolean; appUrl: string }) {
  const t = useTranslations("cart");
  const tp = useTranslations("product");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [cart, setCart] = useState(initial);
  const [optimistic, addOptimistic] = useOptimistic(cart, applyOp);
  const [, start] = useTransition();
  const [coupon, setCoupon] = useState(initial.couponCode ?? "");
  const [couponPending, startCoupon] = useTransition();
  const [groupLink, setGroupLink] = useState<string | null>(initial.shareCode ? `${appUrl}/cart/group/${initial.shareCode}` : null);

  const run = (op: Op, call: () => Promise<{ ok: boolean; data?: unknown; error?: string }>) =>
    start(async () => {
      addOptimistic(op);
      const r = await call();
      if (r.ok && r.data) setCart(r.data as CartData);
      else if (!r.ok) toast.error(r.error ?? "");
      router.refresh();
    });

  const all = optimistic.groups.flatMap((g) => g.items);
  const allSelected = all.length > 0 && all.every((i) => i.selected);
  const selectedIds = all.filter((i) => i.selected).map((i) => i.id);
  const fmt = (v: number) => formatUZS(v, locale);
  const tot = cart.totals;

  if (!all.length && !optimistic.unavailable.length) {
    return (
      <EmptyState
        className="card"
        icon={<ShoppingBag className="h-8 w-8" />}
        title={t("empty")}
        description={t("emptyText")}
        action={
          <Link href="/catalog" className="inline-flex h-11 items-center rounded-[12px] bg-primary px-5 font-bold text-white">
            {t("toCatalog")}
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2.5 font-semibold">
            <input type="checkbox" className="h-5 w-5 accent-[#C8102E]" checked={allSelected} onChange={(e) => run({ type: "select", itemIds: all.map((i) => i.id), selected: e.target.checked }, () => toggleCartItemsAction({ cartId: cart.id, itemIds: all.map((i) => i.id), selected: e.target.checked }))} />
            {t("selectAll")}
          </label>
          {selectedIds.length > 0 && (
            <button type="button" className="flex items-center gap-1.5 text-sm font-semibold text-danger" onClick={() => run({ type: "remove", itemIds: selectedIds }, () => removeCartItemsAction({ cartId: cart.id, itemIds: selectedIds }))}>
              <Trash2 className="h-4 w-4" /> {t("deleteSelected")}
            </button>
          )}
        </div>
        {optimistic.groups.map((g) => (
          <section key={g.shopId} className="card overflow-hidden">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <Link href={`/shop/${g.shopSlug}`} className="font-bold hover:text-primary">
                {g.shopName}
              </Link>
              <span className="text-xs font-semibold text-muted">{tp(`fulfillment${g.fulfillment}`)}</span>
            </header>
            <ul className="divide-y divide-border">
              {g.items.map((it) => (
                <li key={it.id} className="flex gap-3 p-4">
                  <input
                    type="checkbox"
                    className="mt-8 h-5 w-5 shrink-0 accent-[#C8102E]"
                    checked={it.selected}
                    aria-label={it.title}
                    onChange={(e) => run({ type: "select", itemIds: [it.id], selected: e.target.checked }, () => toggleCartItemsAction({ cartId: cart.id, itemIds: [it.id], selected: e.target.checked }))}
                  />
                  <Link href={`/p/${it.slug}`} className="relative h-24 w-20 shrink-0 overflow-hidden rounded-[12px] bg-surface-2 sm:h-28 sm:w-24">
                    {it.image && <Image src={it.image} alt="" fill sizes="96px" className="object-cover" />}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link href={`/p/${it.slug}`} className="line-clamp-2 font-semibold leading-snug hover:text-primary">
                      {it.title}
                    </Link>
                    {it.variantTitle && <p className="text-sm text-muted">{it.variantTitle}</p>}
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {it.isPreorder && <span className="rounded bg-info/15 px-1.5 py-0.5 font-bold text-info">{t("preorder")}</span>}
                      {it.wholesale && <span className="rounded bg-success/15 px-1.5 py-0.5 font-bold text-success">{t("wholesaleApplied")}</span>}
                      {it.addedBy && <span className="text-muted">{t("addedBy", { name: it.addedBy })}</span>}
                    </div>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex h-9 items-center rounded-[10px] border border-border">
                        <button type="button" className="flex h-full w-9 items-center justify-center" aria-label={t("minusOne")} onClick={() => run({ type: "qty", itemId: it.id, quantity: it.quantity - 1 }, () => updateCartItemAction({ cartId: cart.id, itemId: it.id, quantity: it.quantity - 1 }))}>
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="tabular w-8 text-center font-bold">{it.quantity}</span>
                        <button type="button" disabled={it.quantity >= it.stock} className="flex h-full w-9 items-center justify-center disabled:opacity-40" aria-label={t("plusOne")} onClick={() => run({ type: "qty", itemId: it.id, quantity: it.quantity + 1 }, () => updateCartItemAction({ cartId: cart.id, itemId: it.id, quantity: it.quantity + 1 }))}>
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="text-right">
                        <p className="tabular font-extrabold">{fmt(it.lineTotal)}</p>
                        {(it.oldPrice || it.promoDiscount > 0) && <s className="tabular text-xs text-muted">{fmt((it.oldPrice ?? it.price) * it.quantity)}</s>}
                      </div>
                    </div>
                    <div className="flex gap-3 text-sm">
                      {signedIn && (
                        <button type="button" className="flex items-center gap-1 text-muted hover:text-fg" onClick={() => run({ type: "remove", itemIds: [it.id] }, () => moveToWishlistAction({ cartId: cart.id, itemId: it.id }))}>
                          <Heart className="h-4 w-4" /> {t("moveToWishlist")}
                        </button>
                      )}
                      <button type="button" className="flex items-center gap-1 text-muted hover:text-danger" onClick={() => run({ type: "remove", itemIds: [it.id] }, () => removeCartItemsAction({ cartId: cart.id, itemIds: [it.id] }))}>
                        <Trash2 className="h-4 w-4" /> {t("remove")}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {optimistic.unavailable.length > 0 && (
          <section className="card p-4 opacity-70">
            <h2 className="mb-2 font-bold">{t("unavailable")}</h2>
            <ul className="space-y-2">
              {optimistic.unavailable.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{it.title}</span>
                  <button type="button" onClick={() => run({ type: "remove", itemIds: [it.id] }, () => removeCartItemsAction({ cartId: cart.id, itemIds: [it.id] }))} aria-label={t("remove")}>
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {signedIn && cart.kind === "PERSONAL" && (
          <section className="card flex flex-wrap items-center gap-3 p-4">
            <Users className="h-8 w-8 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{t("groupCart")}</p>
              <p className="text-sm text-muted">{t("groupCartText")}</p>
              {groupLink && (
                <div className="mt-2 flex items-center gap-2 rounded-[10px] bg-surface-2 px-3 py-1.5 text-sm">
                  <span className="truncate">{groupLink}</span> <CopyButton value={groupLink} />
                </div>
              )}
            </div>
            {!groupLink && (
              <Button
                variant="outline"
                onClick={() =>
                  start(async () => {
                    const r = await createGroupCartAction({});
                    if (r.ok) setGroupLink(`${appUrl}/cart/group/${(r.data as { code: string }).code}`);
                  })
                }
              >
                {t("createGroup")}
              </Button>
            )}
          </section>
        )}
      </div>

      <aside className="lg:sticky lg:top-36 lg:self-start">
        <div className="card space-y-4 p-5">
          <h2 className="text-xl font-extrabold">{t("summary")}</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              startCoupon(async () => {
                const r = await applyCouponAction({ cartId: cart.id, code: coupon });
                if (r.ok) setCart(r.data as CartData);
                else toast.error(r.fieldErrors?.code ?? r.error);
              });
            }}
          >
            <label className="relative flex-1">
              <TicketPercent className="absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
              <span className="sr-only">{t("coupon")}</span>
              <input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder={t("couponPlaceholder")} className="h-11 w-full rounded-[12px] border border-border bg-surface pl-9 pr-3 text-sm font-semibold uppercase tracking-wide" />
            </label>
            <Button type="submit" variant="secondary" loading={couponPending}>
              OK
            </Button>
          </form>
          {cart.couponCode && (
            <p className={cn("flex items-center justify-between rounded-[10px] px-3 py-2 text-sm font-semibold", tot.couponError ? "bg-danger/10 text-danger" : "bg-success/10 text-success")}>
              {tot.couponError ? t(`couponErrors.${tot.couponError}`) : t("couponApplied", { code: cart.couponCode })}
              <button
                type="button"
                aria-label={t("remove")}
                onClick={() =>
                  startCoupon(async () => {
                    const r = await applyCouponAction({ cartId: cart.id, code: "" });
                    if (r.ok) {
                      setCart(r.data as CartData);
                      setCoupon("");
                    }
                  })
                }
              >
                <X className="h-4 w-4" />
              </button>
            </p>
          )}
          <dl className="space-y-2 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-muted">{t("items", { count: tot.itemsCount })}</dt>
              <dd className="tabular">{fmt(tot.listTotal)}</dd>
            </div>
            {tot.productDiscount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">{t("discount")}</dt>
                <dd className="tabular text-brand-ink">−{fmt(tot.productDiscount)}</dd>
              </div>
            )}
            {tot.promoDiscount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">{t("promo")}</dt>
                <dd className="tabular text-brand-ink">−{fmt(tot.promoDiscount)}</dd>
              </div>
            )}
            {tot.couponDiscount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">{t("coupon")}</dt>
                <dd className="tabular text-brand-ink">−{fmt(tot.couponDiscount)}</dd>
              </div>
            )}
            {tot.freeDelivery && <p className="text-sm font-semibold text-success">{t("freeDelivery")}</p>}
          </dl>
          <div className="flex items-end justify-between border-t border-border pt-3">
            <span className="text-lg font-bold">{t("total")}</span>
            <span className="tabular text-2xl font-extrabold">{fmt(tot.total)}</span>
          </div>
          {tot.monthly && <p className="text-right text-sm font-semibold text-[#7a5600] dark:text-accent">{tp("monthly", { amount: fmt(tot.monthly.amount), months: tot.monthly.months })}</p>}
          {tot.cashback > 0 && <p className="text-sm text-success">{t("cashback", { amount: groupDigits(tot.cashback) })}</p>}
          {isOwner ? (
            <Button
              size="lg"
              className="w-full"
              disabled={!selectedIds.length}
              onClick={() => router.push(signedIn ? `/checkout${cart.kind === "GROUP" ? `?cart=${cart.id}` : ""}` : "/auth/login?next=/checkout")}
            >
              {t("checkout")}
            </Button>
          ) : (
            <p className="text-center text-sm text-muted">{t("groupOwnerCheckout")}</p>
          )}
          {!signedIn && <p className="text-center text-xs text-muted">{t("loginToSave")}</p>}
        </div>
      </aside>
    </div>
  );
}
