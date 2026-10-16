"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, Flame, Plus, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Radio, Select, Switch } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { deletePromotionAction, joinCampaignAction, leaveCampaignAction, savePromotionAction, togglePromotionAction } from "@/server/actions/seller-promotions";
import type { promotionsOverview } from "@/server/services/seller/promotions";
import { formatUZS } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";

type Data = Awaited<ReturnType<typeof promotionsOverview>>;
type CampaignRow = Data["campaigns"][number];
type ProductOpt = Data["products"][number];

export function CampaignCard({ campaign: c, products }: { campaign: CampaignRow; products: ProductOpt[] }) {
  const t = useTranslations("sellerPromotions");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const free = products.filter((p) => !c.joined.some((j) => j.productId === p.id));
  const [productId, setProductId] = useState(free[0]?.id ?? "");
  const product = products.find((p) => p.id === productId);
  const maxPrice = product ? Math.floor(product.reference * (1 - c.minDiscount / 100)) : 0;
  const [salePrice, setSalePrice] = useState("");
  const [stockLimit, setStockLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const live = c.live;
  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-primary/10 text-primary">
          <Flame className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{c.name}</h3>
            <Badge tone={live ? "success" : "info"}>{live ? t("live") : t("upcoming")}</Badge>
            <Badge tone="accent">{t("minDiscount", { n: c.minDiscount })}</Badge>
          </div>
          {c.description && <p className="mt-0.5 text-sm text-muted">{c.description}</p>}
          <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
            <CalendarClock className="h-3.5 w-3.5" /> {fmtDay(c.startsAt, locale)} — {fmtDay(c.endsAt, locale)}
          </p>
        </div>
      </div>
      {c.joined.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2">{t("product")}</th>
                <th className="py-1.5 pr-2 text-right">{t("price")}</th>
                <th className="py-1.5 pr-2 text-right">{t("salePrice")}</th>
                <th className="py-1.5 pr-2 text-right">{t("sold")}</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {c.joined.map((j) => (
                <tr key={j.productId}>
                  <td className="max-w-64 truncate py-2 pr-2">{j.title}</td>
                  <td className="tabular py-2 pr-2 text-right text-muted line-through">{formatUZS(j.price, locale)}</td>
                  <td className="tabular py-2 pr-2 text-right font-bold">
                    {formatUZS(j.salePrice, locale)} <span className="text-[12px] font-semibold text-primary">−{Math.round((1 - j.salePrice / j.price) * 100)}%</span>
                  </td>
                  <td className="tabular py-2 pr-2 text-right">
                    {j.sold}
                    {j.stockLimit ? ` / ${j.stockLimit}` : ""}
                  </td>
                  <td className="py-2 text-right">
                    {!live && (
                      <button
                        type="button"
                        className="p-1 text-muted hover:text-danger"
                        aria-label={t("leave")}
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const res = await leaveCampaignAction({ campaignId: c.id, productId: j.productId });
                            if (!res.ok) return toast.error(res.error);
                            router.refresh();
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {free.length > 0 && (
        <form
          className="mt-3 grid gap-2 rounded-[14px] bg-surface-2 p-3 sm:grid-cols-[minmax(0,1fr)_150px_120px_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const res = await joinCampaignAction({ campaignId: c.id, items: [{ productId, salePrice: Number(salePrice), stockLimit: stockLimit ? Number(stockLimit) : null }] });
              if (!res.ok) return setError(res.fieldErrors?.salePrice ?? res.error);
              toast.success(t("joined"));
              setSalePrice("");
              setStockLimit("");
              setProductId(free.find((p) => p.id !== productId)?.id ?? "");
              router.refresh();
            });
          }}
        >
          <Field label={t("product")} htmlFor={`cp-${c.id}`}>
            <Select id={`cp-${c.id}`} value={productId} onChange={(e) => setProductId(e.target.value)} className="text-sm">
              {free.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} — {formatUZS(p.price, locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("salePrice")} htmlFor={`sp-${c.id}`} hint={product ? t("maxHint", { max: formatUZS(maxPrice, locale) }) : undefined}>
            <Input id={`sp-${c.id}`} inputMode="numeric" value={salePrice} onChange={(e) => setSalePrice(e.target.value.replace(/\D/g, ""))} placeholder={String(maxPrice)} />
          </Field>
          <Field label={t("stockLimit")} htmlFor={`sl-${c.id}`}>
            <Input id={`sl-${c.id}`} inputMode="numeric" value={stockLimit} onChange={(e) => setStockLimit(e.target.value.replace(/\D/g, ""))} placeholder="∞" />
          </Field>
          <Button type="submit" loading={pending} disabled={!productId || !salePrice} leftIcon={<Plus className="h-4 w-4" />}>
            {t("join")}
          </Button>
          <div className="sm:col-span-4">
            <FormError message={error} />
            <p className="text-[12px] text-muted">{t("honestHint")}</p>
          </div>
        </form>
      )}
    </li>
  );
}

const TYPES = ["MULTI_BUY", "BUNDLE", "BUY_TOGETHER"] as const;

export function PromotionForm({ products }: { products: ProductOpt[] }) {
  const t = useTranslations("sellerPromotions");
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<(typeof TYPES)[number]>("MULTI_BUY");
  const [nameUz, setNameUz] = useState("");
  const [nameRu, setNameRu] = useState("");
  const [discount, setDiscount] = useState("10");
  const [minQty, setMinQty] = useState("2");
  const [ids, setIds] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = products.filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await savePromotionAction({ type, nameUz, nameRu, discountPercent: Number(discount), minQty: Number(minQty), productIds: ids, startsAt: startsAt ? new Date(startsAt) : null, endsAt: endsAt ? new Date(endsAt) : null });
          if (!res.ok) return setError(res.error);
          toast.success(t("saved"));
          setNameUz("");
          setNameRu("");
          setIds([]);
          router.refresh();
        });
      }}
    >
      <h2 className="font-bold">{t("newPromotion")}</h2>
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-semibold">{t("type")}</legend>
        {TYPES.map((ty) => (
          <Radio key={ty} className="flex" name="promo-type" checked={type === ty} onChange={() => setType(ty)} label={<span><b>{t(`types.${ty}`)}</b> — <span className="text-muted">{t(`typeHint.${ty}`)}</span></span>} />
        ))}
      </fieldset>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("nameUz")} htmlFor="pr-uz" required>
          <Input id="pr-uz" value={nameUz} onChange={(e) => setNameUz(e.target.value)} maxLength={80} />
        </Field>
        <Field label={t("nameRu")} htmlFor="pr-ru">
          <Input id="pr-ru" value={nameRu} onChange={(e) => setNameRu(e.target.value)} maxLength={80} />
        </Field>
        <Field label={t("discount")} htmlFor="pr-d" hint="3–70%">
          <Input id="pr-d" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/\D/g, ""))} />
        </Field>
        {type === "MULTI_BUY" && (
          <Field label={t("minQty")} htmlFor="pr-q">
            <Input id="pr-q" inputMode="numeric" value={minQty} onChange={(e) => setMinQty(e.target.value.replace(/\D/g, ""))} />
          </Field>
        )}
        <Field label={t("startsAt")} htmlFor="pr-s">
          <Input id="pr-s" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label={t("endsAt")} htmlFor="pr-e">
          <Input id="pr-e" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">{t("products", { count: ids.length })}</legend>
        <Input aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-[12px] border border-border p-2">
          {shown.map((p) => (
            <Checkbox key={p.id} className="flex" checked={ids.includes(p.id)} onChange={(e) => setIds((x) => (e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id)))} label={p.title} />
          ))}
        </div>
      </fieldset>
      <FormError message={error} />
      <Button type="submit" loading={pending} disabled={nameUz.trim().length < 3 || !ids.length}>
        {t("create")}
      </Button>
    </form>
  );
}

export function PromotionList({ rows }: { rows: Data["promotions"] }) {
  const t = useTranslations("sellerPromotions");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.error(res.error ?? "");
      router.refresh();
    });
  return (
    <ul className="space-y-3">
      {rows.map((p) => (
        <li key={p.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">{p.name}</p>
            <Badge tone="primary">−{p.discountPercent}%</Badge>
            <Badge>{t(`types.${p.type}`)}</Badge>
            {p.live ? <Badge tone="success">{t("live")}</Badge> : p.isActive ? <Badge tone="info">{t("scheduled")}</Badge> : <Badge>{t("paused")}</Badge>}
            <Switch className="ml-auto" checked={p.isActive} aria-label={t("active")} disabled={pending} onChange={(e) => run(() => togglePromotionAction({ id: p.id, isActive: e.target.checked }))} />
            <button type="button" className="p-1 text-muted hover:text-danger" aria-label={t("delete")} disabled={pending} onClick={() => window.confirm(t("deleteConfirm")) && run(() => deletePromotionAction({ id: p.id }))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {p.type === "MULTI_BUY" ? t("rule.MULTI_BUY", { n: p.minQty, d: p.discountPercent }) : t("rule.BUNDLE", { d: p.discountPercent })}
            {(p.startsAt || p.endsAt) && ` · ${p.startsAt ? fmtDay(p.startsAt, locale) : "…"} — ${p.endsAt ? fmtDay(p.endsAt, locale) : "…"}`}
          </p>
          <p className="mt-1 line-clamp-2 text-[13px]">{p.products.join(" · ")}</p>
        </li>
      ))}
      {rows.length === 0 && <li className="card p-6 text-center text-sm text-muted">{t("noPromotions")}</li>}
    </ul>
  );
}
