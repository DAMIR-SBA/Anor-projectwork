"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Eye, EyeOff, Play, Square, Trash2, Zap } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { ImageUploader } from "@/components/ui/uploader";
import { useToast } from "@/components/ui/toast";
import { createVideoAction, deleteVideoAction, liveControlAction, scheduleLiveAction, toggleVideoAction } from "@/server/actions/content";
import { formatUZS } from "@/lib/money";
import { LIVE_PRICE_MINUTES, LIVE_PRICE_MIN_SHARE, MAX_PINNED } from "@/lib/live";
import { cn } from "@/lib/cn";

type Product = { id: string; title: string; price: number };

// ── Videos ───────────────────────────────────────────────────────────────

export function VideoForm({ products }: { products: Product[] }) {
  const t = useTranslations("sellerContent");
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ url: [] as string[], poster: [] as string[], captionUz: "", captionRu: "", productId: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          setErrors({});
          const res = await createVideoAction({ url: f.url[0] ?? "", posterUrl: f.poster[0] ?? null, captionUz: f.captionUz, captionRu: f.captionRu, productId: f.productId || null });
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            return setError(res.error);
          }
          toast.success(t("videoPublished"));
          setF({ url: [], poster: [], captionUz: "", captionRu: "", productId: "" });
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("videoFile")} hint={t("videoFileHint")} error={errors.url}>
          <ImageUploader kind="video" folder="products" accept="video/mp4,video/webm" max={1} value={f.url} onChange={(url) => setF((prev) => ({ ...prev, url }))} />
        </Field>
        <Field label={t("poster")} hint={t("posterHint")}>
          <ImageUploader folder="products" max={1} value={f.poster} onChange={(poster) => setF((prev) => ({ ...prev, poster }))} />
        </Field>
        <Field label={t("captionUz")} htmlFor="vf-uz" error={errors.captionUz}>
          <Input id="vf-uz" maxLength={150} value={f.captionUz} onChange={(e) => setF((prev) => ({ ...prev, captionUz: e.target.value }))} />
        </Field>
        <Field label={t("captionRu")} htmlFor="vf-ru" error={errors.captionRu}>
          <Input id="vf-ru" maxLength={150} value={f.captionRu} onChange={(e) => setF((prev) => ({ ...prev, captionRu: e.target.value }))} />
        </Field>
        <Field label={t("linkedProduct")} htmlFor="vf-p" className="sm:col-span-2">
          <Select id="vf-p" value={f.productId} onChange={(e) => setF((prev) => ({ ...prev, productId: e.target.value }))}>
            <option value="">{t("noProduct")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <FormError message={error} />
      <Button type="submit" loading={pending} disabled={!f.url.length}>
        {t("publish")}
      </Button>
    </form>
  );
}

export function VideoRowActions({ id, active }: { id: string; active: boolean }) {
  const t = useTranslations("sellerContent");
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "");
      router.refresh();
    });
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} leftIcon={active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} onClick={() => run(() => toggleVideoAction({ id, active: !active }))}>
        {active ? t("hideVideo") : t("showVideo")}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} aria-label={t("delete")} onClick={() => window.confirm(t("deleteConfirm")) && run(() => deleteVideoAction({ id }))}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ── Live: schedule ───────────────────────────────────────────────────────

export function LiveScheduleForm({ products, defaultStart }: { products: Product[]; defaultStart: string }) {
  const t = useTranslations("sellerContent");
  const locale = useLocale();
  const router = useRouter();
  const [f, setF] = useState({ titleUz: "", titleRu: "", startsAt: defaultStart, poster: [] as string[], video: [] as string[], pinned: [] as string[] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: string) => setF((prev) => ({ ...prev, pinned: prev.pinned.includes(id) ? prev.pinned.filter((x) => x !== id) : prev.pinned.length >= MAX_PINNED ? prev.pinned : [...prev.pinned, id] }));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          setErrors({});
          const res = await scheduleLiveAction({ titleUz: f.titleUz, titleRu: f.titleRu, startsAt: new Date(f.startsAt), posterUrl: f.poster[0] ?? null, streamUrl: f.video[0] ?? null, pinnedProductIds: f.pinned });
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            return setError(res.error);
          }
          router.push(`/seller/live/${(res.data as { id: string }).id}`);
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("titleUz")} htmlFor="ls-uz" error={errors.titleUz}>
          <Input id="ls-uz" maxLength={120} value={f.titleUz} onChange={(e) => setF((prev) => ({ ...prev, titleUz: e.target.value }))} />
        </Field>
        <Field label={t("titleRu")} htmlFor="ls-ru" error={errors.titleRu}>
          <Input id="ls-ru" maxLength={120} value={f.titleRu} onChange={(e) => setF((prev) => ({ ...prev, titleRu: e.target.value }))} />
        </Field>
        <Field label={t("startsAt")} htmlFor="ls-at" error={errors.startsAt}>
          <Input id="ls-at" type="datetime-local" value={f.startsAt} onChange={(e) => setF((prev) => ({ ...prev, startsAt: e.target.value }))} />
        </Field>
        <Field label={t("poster")}>
          <ImageUploader folder="products" max={1} value={f.poster} onChange={(poster) => setF((prev) => ({ ...prev, poster }))} />
        </Field>
        <Field label={t("streamVideo")} hint={t("streamVideoHint")} className="sm:col-span-2">
          <ImageUploader kind="video" folder="products" accept="video/mp4,video/webm" max={1} value={f.video} onChange={(video) => setF((prev) => ({ ...prev, video }))} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t("pinProducts", { max: MAX_PINNED })}</legend>
        {errors.pinnedProductIds && <p className="mb-1 text-sm text-danger">{errors.pinnedProductIds}</p>}
        <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
          {products.map((p) => (
            <label key={p.id} className={cn("flex cursor-pointer items-center gap-2 rounded-[10px] border p-2 text-sm", f.pinned.includes(p.id) ? "border-primary bg-primary-50 dark:bg-primary/10" : "border-border")}>
              <input type="checkbox" checked={f.pinned.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-[#C8102E]" />
              <span className="line-clamp-1 flex-1">{p.title}</span>
              <span className="tabular text-muted">{formatUZS(p.price, locale)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormError message={error} />
      <Button type="submit" loading={pending} disabled={!f.pinned.length}>
        {t("schedule")}
      </Button>
    </form>
  );
}

// ── Live: host console ───────────────────────────────────────────────────

export function HostControls({ streamId, status, products }: { streamId: string; status: "SCHEDULED" | "LIVE" | "ENDED"; products: Product[] }) {
  const t = useTranslations("sellerContent");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [price, setPrice] = useState<Record<string, { value: string; minutes: string }>>({});
  const run = (input: Parameters<typeof liveControlAction>[0], ok?: string) =>
    start(async () => {
      const r = await liveControlAction(input);
      if (!r.ok) return void toast.error(r.error);
      if (ok) toast.success(ok);
      router.refresh();
    });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "SCHEDULED" && (
          <Button leftIcon={<Play className="h-4 w-4" />} loading={pending} onClick={() => run({ op: "start", streamId }, t("started"))}>
            {t("goLive")}
          </Button>
        )}
        {status === "LIVE" && (
          <Button variant="danger" leftIcon={<Square className="h-4 w-4" />} loading={pending} onClick={() => window.confirm(t("endConfirm")) && run({ op: "end", streamId }, t("ended"))}>
            {t("endLive")}
          </Button>
        )}
      </div>
      {status === "LIVE" && (
        <ul className="space-y-2">
          {products.map((p) => {
            const v = price[p.id] ?? { value: String(Math.round((p.price * 0.85) / 1000) * 1000), minutes: "10" };
            return (
              <li key={p.id} className="rounded-[12px] border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="line-clamp-1 flex-1 text-sm font-semibold">{p.title}</span>
                  <span className="tabular text-sm text-muted">{formatUZS(p.price, locale)}</span>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run({ op: "show", streamId, productId: p.id })}>
                    {t("showNow")}
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Field label={t("livePrice")} htmlFor={`lp-${p.id}`} hint={t("livePriceHint", { min: formatUZS(Math.ceil(p.price * LIVE_PRICE_MIN_SHARE), locale) })} className="min-w-0 flex-1">
                    <Input id={`lp-${p.id}`} type="number" inputMode="numeric" value={v.value} onChange={(e) => setPrice((prev) => ({ ...prev, [p.id]: { ...v, value: e.target.value } }))} />
                  </Field>
                  <Field label={t("duration")} htmlFor={`lm-${p.id}`}>
                    <Select id={`lm-${p.id}`} value={v.minutes} onChange={(e) => setPrice((prev) => ({ ...prev, [p.id]: { ...v, minutes: e.target.value } }))}>
                      {LIVE_PRICE_MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {t("minutes", { count: m })}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button size="sm" variant="accent" leftIcon={<Zap className="h-4 w-4" />} disabled={pending} onClick={() => run({ op: "price", streamId, productId: p.id, price: Number(v.value), minutes: Number(v.minutes) }, t("priceLive"))}>
                    {t("startPrice")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
