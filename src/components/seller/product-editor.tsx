"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, CalendarClock, FlaskConical, ImagePlus, Loader2, Plus, Sparkles, Star, Trash2, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Radio, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { uploadFile } from "@/components/ui/uploader";
import { cancelScheduledPriceAction, saveProductAction, schedulePriceAction, startExperimentAction, stopExperimentAction, suggestCategoryAction } from "@/server/actions/seller-products";
import type { EditableProduct } from "@/server/services/seller/products";
import { effectiveCommissionRate, logisticsFee } from "@/lib/pricing";
import { unitEconomics } from "@/lib/seller";
import { formatUZS } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";
import { cn } from "@/lib/cn";

type CategoryOption = { id: string; label: string; commissionRate: number };
type BrandOption = { id: string; name: string };
type VariantRow = { id?: string; titleUz: string; titleRu: string; sku: string; barcode: string; price: string; oldPrice: string; costPrice: string; stock: string; platformStock?: number; hasOrders?: boolean; scheduled?: EditableProduct["variants"][number]["scheduled"] };

const toRow = (v: EditableProduct["variants"][number]): VariantRow => ({ id: v.id, titleUz: v.titleUz, titleRu: v.titleRu, sku: v.sku, barcode: v.barcode, price: String(v.price), oldPrice: v.oldPrice ? String(v.oldPrice) : "", costPrice: v.costPrice != null ? String(v.costPrice) : "", stock: String(v.stock), platformStock: v.platformStock, hasOrders: v.hasOrders, scheduled: v.scheduled });
const int = (s: string) => (s.trim() === "" ? null : Math.round(Number(s.replace(/\s/g, ""))));

export function ProductEditor({ initial, categories, brands, tier, shopApproved }: { initial: EditableProduct | null; categories: CategoryOption[]; brands: BrandOption[]; tier: "BASIC" | "PRO"; shopApproved: boolean }) {
  const t = useTranslations("sellerProducts.editor");
  const tp = useTranslations("sellerProducts");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({
    titleUz: initial?.titleUz ?? "",
    titleRu: initial?.titleRu ?? "",
    descriptionUz: initial?.descriptionUz ?? "",
    descriptionRu: initial?.descriptionRu ?? "",
    categoryId: initial?.categoryId ?? "",
    brandId: initial?.brandId ?? "",
    condition: initial?.condition ?? "NEW",
    videoUrl: initial?.videoUrl ?? "",
    fulfillment: initial?.fulfillment ?? "FBS",
    weightGrams: String(initial?.weightGrams ?? 500),
    isHalal: initial?.isHalal ?? false,
    madeInUz: initial?.madeInUz ?? false,
    isPreorder: initial?.isPreorder ?? false,
    keywords: "",
  });
  const [media, setMedia] = useState<string[]>(initial?.media ?? []);
  const [variants, setVariants] = useState<VariantRow[]>(initial?.variants.map(toRow) ?? [{ titleUz: "", titleRu: "", sku: "", barcode: "", price: "", oldPrice: "", costPrice: "", stock: "0" }]);
  const [specs, setSpecs] = useState(initial?.specs ?? []);
  const [wholesale, setWholesale] = useState((initial?.wholesale ?? []).map((w) => ({ minQty: String(w.minQty), price: String(w.price) })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [schedule, setSchedule] = useState<VariantRow | null>(null);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const setVar = (i: number, patch: Partial<VariantRow>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  const category = categories.find((c) => c.id === f.categoryId);
  const first = variants[0];
  const econ =
    category && int(first?.price ?? "")
      ? unitEconomics({ price: int(first.price)!, commissionRate: effectiveCommissionRate(category.commissionRate, tier), logisticsFee: logisticsFee(f.fulfillment as "FBS", Number(f.weightGrams) || 500, 1), costPrice: int(first.costPrice) })
      : null;

  const save = (publish: boolean) =>
    start(async () => {
      setErrors({});
      setError(null);
      const res = await saveProductAction({
        id: initial?.id,
        titleUz: f.titleUz,
        titleRu: f.titleRu,
        descriptionUz: f.descriptionUz,
        descriptionRu: f.descriptionRu,
        categoryId: f.categoryId,
        brandId: f.brandId || null,
        specs,
        media,
        videoUrl: f.videoUrl || null,
        fulfillment: f.fulfillment as "FBS",
        weightGrams: Number(f.weightGrams) || 0,
        isHalal: f.isHalal,
        madeInUz: f.madeInUz,
        condition: f.condition as "NEW",
        isPreorder: f.isPreorder,
        wholesale: wholesale.filter((w) => w.minQty && w.price).map((w) => ({ minQty: Number(w.minQty), price: Number(w.price) })),
        keywords: f.keywords || undefined,
        variants: variants.map((v) => ({ id: v.id, titleUz: v.titleUz, titleRu: v.titleRu, sku: v.sku, barcode: v.barcode, price: int(v.price) ?? 0, oldPrice: int(v.oldPrice), costPrice: int(v.costPrice), stock: int(v.stock) ?? 0 })),
        publish,
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        return setError(res.error);
      }
      const d = res.data as { id: string; status: string };
      toast.success(d.status === "ACTIVE" ? t("published") : d.status === "PENDING" ? t("sentToModeration") : t("savedDraft"));
      if (!initial) router.replace(`/seller/products/${d.id}`);
      router.refresh();
    });

  const upload = async (files: File[]) => {
    setUploading(true);
    for (const file of files.slice(0, 12 - media.length)) {
      try {
        const up = await uploadFile(file, "image", "products");
        setMedia((m) => [...m, up.url]);
      } catch {
        setError(t("uploadFailed"));
      }
    }
    setUploading(false);
  };

  const err = (k: string) => errors[k] ?? Object.entries(errors).find(([key]) => key.startsWith(`${k}.`))?.[1];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        {initial?.status === "REJECTED" && initial.moderationNote && <p className="rounded-[12px] bg-danger/10 p-3 text-sm text-danger">{t("rejected", { note: initial.moderationNote })}</p>}
        {initial?.status === "PENDING" && <p className="rounded-[12px] bg-accent/15 p-3 text-sm">{t("pending")}</p>}

        <section className="card space-y-4 p-5">
          <h2 className="font-bold">{t("basics")}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t("titleUz")} htmlFor="p-tuz" error={err("titleUz")} required>
              <Input id="p-tuz" value={f.titleUz} maxLength={200} onChange={(e) => set("titleUz", e.target.value)} />
            </Field>
            <Field label={t("titleRu")} htmlFor="p-tru" error={err("titleRu")} required>
              <Input id="p-tru" value={f.titleRu} maxLength={200} onChange={(e) => set("titleRu", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <Field label={t("category")} htmlFor="p-cat" error={err("categoryId")} required>
              <Select id="p-cat" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">{t("pickCategory")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button
                variant="outline"
                loading={suggesting}
                leftIcon={<Sparkles className="h-4 w-4" />}
                disabled={f.titleUz.length < 3}
                onClick={async () => {
                  setSuggesting(true);
                  const res = await suggestCategoryAction({ title: `${f.titleUz} ${f.titleRu}`, description: f.descriptionUz });
                  setSuggesting(false);
                  const d = res.ok ? (res.data as { categoryId: string; attributes: Array<{ keyUz: string; keyRu: string; value: string }> } | null) : null;
                  if (!d) return toast.info(t("noSuggestion"));
                  set("categoryId", d.categoryId);
                  if (d.attributes.length) setSpecs((s) => [...s, ...d.attributes.filter((a) => !s.some((x) => x.keyUz === a.keyUz))]);
                  toast.success(t("suggested", { name: categories.find((c) => c.id === d.categoryId)?.label ?? "" }));
                }}
              >
                {t("suggest")}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t("brand")} htmlFor="p-brand">
              <Select id="p-brand" value={f.brandId} onChange={(e) => set("brandId", e.target.value)}>
                <option value="">{t("noBrand")}</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("condition")} htmlFor="p-cond">
              <Select id="p-cond" value={f.condition} onChange={(e) => set("condition", e.target.value as "NEW")}>
                {(["NEW", "USED_A", "USED_B", "USED_C"] as const).map((c) => (
                  <option key={c} value={c}>
                    {t(`conditions.${c}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t("descriptionUz")} htmlFor="p-duz">
              <Textarea id="p-duz" rows={6} value={f.descriptionUz} onChange={(e) => set("descriptionUz", e.target.value)} />
            </Field>
            <Field label={t("descriptionRu")} htmlFor="p-dru">
              <Textarea id="p-dru" rows={6} value={f.descriptionRu} onChange={(e) => set("descriptionRu", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-bold">{t("photos")}</h2>
          <p className="text-sm text-muted">{t("photosHint")}</p>
          <ul className="flex flex-wrap gap-2" aria-label={t("photos")}>
            {media.map((url, i) => (
              <li key={url} className={cn("group relative h-28 w-28 overflow-hidden rounded-[12px] bg-surface-2", i === 0 && "ring-2 ring-primary")}>
                <Image src={url} alt="" fill sizes="112px" className="object-cover" />
                {i === 0 && <span className="absolute left-1 top-1 rounded bg-primary px-1 text-[10px] font-bold text-white">{t("cover")}</span>}
                <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <button type="button" className="rounded-full bg-black/60 p-1 text-white disabled:opacity-30" disabled={i === 0} onClick={() => setMedia((m) => { const n = [...m]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} aria-label={t("moveLeft")}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="rounded-full bg-black/60 p-1 text-white" onClick={() => setMedia((m) => m.filter((x) => x !== url))} aria-label={t("removePhoto")}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="rounded-full bg-black/60 p-1 text-white disabled:opacity-30" disabled={i === media.length - 1} onClick={() => setMedia((m) => { const n = [...m]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })} aria-label={t("moveRight")}>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
            {media.length < 12 && (
              <li>
                <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="flex h-28 w-28 items-center justify-center rounded-[12px] border-2 border-dashed border-border text-muted hover:border-primary hover:text-primary" aria-label={t("addPhotos")}>
                  {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                </button>
              </li>
            )}
          </ul>
          <input ref={fileInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => (void upload([...(e.target.files ?? [])]), (e.target.value = ""))} />
          {err("media") && <p className="text-sm text-danger">{err("media")}</p>}
          <Field label={t("video")} htmlFor="p-video" hint={t("videoHint")} error={err("videoUrl")}>
            <Input id="p-video" type="url" value={f.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://…" />
          </Field>
        </section>

        <section className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{t("variants")}</h2>
            <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setVariants((v) => [...v, { titleUz: "", titleRu: "", sku: "", barcode: "", price: v[0]?.price ?? "", oldPrice: "", costPrice: v[0]?.costPrice ?? "", stock: "0" }])}>
              {t("addVariant")}
            </Button>
          </div>
          {err("variants") && <p className="text-sm text-danger">{err("variants")}</p>}
          <div tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-1.5 pr-2">{t("variantUz")}</th>
                  <th className="pb-1.5 pr-2">{t("variantRu")}</th>
                  <th className="pb-1.5 pr-2">SKU *</th>
                  <th className="pb-1.5 pr-2">{t("barcode")}</th>
                  <th className="pb-1.5 pr-2">{t("price")} *</th>
                  <th className="pb-1.5 pr-2">{t("oldPrice")}</th>
                  <th className="pb-1.5 pr-2">{t("costPrice")}</th>
                  <th className="pb-1.5 pr-2">{f.fulfillment === "FBO" ? t("platformStock") : t("stock")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {variants.map((v, i) => (
                  <tr key={v.id ?? `new-${i}`} className="align-top">
                    {(["titleUz", "titleRu", "sku", "barcode", "price", "oldPrice", "costPrice"] as const).map((k) => (
                      <td key={k} className="py-1 pr-2">
                        <Input aria-label={`${k} ${i + 1}`} value={v[k]} onChange={(e) => setVar(i, { [k]: e.target.value })} inputMode={["price", "oldPrice", "costPrice", "barcode"].includes(k) ? "numeric" : undefined} placeholder={k === "titleUz" ? t("variantPlaceholder") : undefined} className={cn("h-9 text-sm", errors[`variants.${i}.${k}`] && "border-danger")} />
                      </td>
                    ))}
                    <td className="py-1 pr-2">
                      {f.fulfillment === "FBO" ? <span className="tabular block pt-2">{v.platformStock ?? 0}</span> : <Input aria-label={`stock ${i + 1}`} value={v.stock} onChange={(e) => setVar(i, { stock: e.target.value })} inputMode="numeric" className="h-9 w-20 text-sm" />}
                    </td>
                    <td className="flex gap-0.5 py-1">
                      {v.id && (
                        <button type="button" onClick={() => setSchedule(v)} className="rounded-[8px] p-2 text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("schedulePrice")} title={t("schedulePrice")}>
                          <CalendarClock className="h-4 w-4" />
                        </button>
                      )}
                      <button type="button" disabled={variants.length === 1 || v.hasOrders} onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))} className="rounded-[8px] p-2 text-muted hover:bg-surface-3 hover:text-danger disabled:opacity-30" aria-label={t("removeVariant")} title={v.hasOrders ? t("variantHasOrders") : t("removeVariant")}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {variants.some((v) => v.scheduled?.length) && (
            <ul className="space-y-1 text-[13px] text-muted">
              {variants.flatMap((v) =>
                (v.scheduled ?? []).map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <CalendarClock className="h-3.5 w-3.5" /> {v.sku}: {formatUZS(s.newPrice, locale)} · {fmtDateTime(s.startsAt, locale)}
                    {s.endsAt && ` → ${fmtDateTime(s.endsAt, locale)}`} {s.applied && <span className="text-success">✓</span>}
                    {!s.applied && (
                      <button
                        type="button"
                        className="text-danger hover:underline"
                        onClick={async () => {
                          await cancelScheduledPriceAction({ id: s.id });
                          router.refresh();
                        }}
                      >
                        {t("cancel")}
                      </button>
                    )}
                  </li>
                )),
              )}
            </ul>
          )}
        </section>

        <section className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{t("specs")}</h2>
            <Button size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setSpecs((s) => [...s, { keyUz: "", keyRu: "", value: "" }])}>
              {t("addSpec")}
            </Button>
          </div>
          {specs.map((s, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_1fr_1fr_auto] gap-2">
              <Input aria-label={t("specKeyUz")} placeholder={t("specKeyUz")} value={s.keyUz} onChange={(e) => setSpecs((x) => x.map((y, j) => (j === i ? { ...y, keyUz: e.target.value } : y)))} className="h-9 text-sm" />
              <Input aria-label={t("specKeyRu")} placeholder={t("specKeyRu")} value={s.keyRu} onChange={(e) => setSpecs((x) => x.map((y, j) => (j === i ? { ...y, keyRu: e.target.value } : y)))} className="h-9 text-sm" />
              <Input aria-label={t("specValue")} placeholder={t("specValue")} value={s.value} onChange={(e) => setSpecs((x) => x.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} className="h-9 text-sm" />
              <button type="button" onClick={() => setSpecs((x) => x.filter((_, j) => j !== i))} className="rounded-[8px] p-2 text-muted hover:text-danger" aria-label={t("remove")}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-bold">{t("logistics")}</h2>
          <fieldset className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <legend className="sr-only">{t("fulfillment")}</legend>
            {(["FBO", "FBS", "DBS"] as const).map((m) => (
              <label key={m} className={cn("cursor-pointer rounded-[14px] border p-3 text-sm", f.fulfillment === m ? "border-primary bg-primary/5" : "border-border hover:bg-surface-2")}>
                <Radio name="fulfillment" checked={f.fulfillment === m} onChange={() => set("fulfillment", m)} label={<span className="font-bold">{m}</span>} />
                <span className="mt-1 block pl-7 text-[13px] text-muted">{t(`models.${m}`)}</span>
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label={t("weight")} htmlFor="p-weight" error={err("weightGrams")}>
              <Input id="p-weight" inputMode="numeric" value={f.weightGrams} onChange={(e) => set("weightGrams", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label={t("keywords")} htmlFor="p-kw" hint={t("keywordsHint")} className="md:col-span-2">
              <Input id="p-kw" value={f.keywords} onChange={(e) => set("keywords", e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-5">
            <Checkbox label={t("halal")} checked={f.isHalal} onChange={(e) => set("isHalal", e.target.checked)} />
            <Checkbox label={t("madeInUz")} checked={f.madeInUz} onChange={(e) => set("madeInUz", e.target.checked)} />
            <Checkbox label={t("preorder")} checked={f.isPreorder} onChange={(e) => set("isPreorder", e.target.checked)} />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">{t("wholesale")}</p>
            {wholesale.map((w, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <Input aria-label={t("minQty")} placeholder={t("minQty")} value={w.minQty} onChange={(e) => setWholesale((x) => x.map((y, j) => (j === i ? { ...y, minQty: e.target.value.replace(/\D/g, "") } : y)))} className="h-9 w-28 text-sm" />
                <Input aria-label={t("price")} placeholder={t("price")} value={w.price} onChange={(e) => setWholesale((x) => x.map((y, j) => (j === i ? { ...y, price: e.target.value.replace(/\D/g, "") } : y)))} className="h-9 w-40 text-sm" />
                <button type="button" onClick={() => setWholesale((x) => x.filter((_, j) => j !== i))} className="p-2 text-muted hover:text-danger" aria-label={t("remove")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {wholesale.length < 5 && (
              <Button size="sm" variant="ghost" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setWholesale((x) => [...x, { minQty: "", price: "" }])}>
                {t("addTier")}
              </Button>
            )}
          </div>
        </section>
        {initial && <AbTest product={initial} pro={tier === "PRO"} />}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <div className="card space-y-2 p-5 text-sm">
          <h2 className="font-bold">{t("economics")}</h2>
          {econ ? (
            <dl className="space-y-1.5">
              <Row label={t("price")} value={formatUZS(econ.price, locale)} />
              <Row label={t("commission", { rate: Math.round(effectiveCommissionRate(category!.commissionRate, tier) * 100) })} value={`−${formatUZS(econ.commission, locale)}`} />
              <Row label={t("logisticsFee")} value={`−${formatUZS(econ.logistics, locale)}`} />
              <Row label={t("payout")} value={formatUZS(econ.payout, locale)} strong />
              {econ.profit !== null && <Row label={t("profit", { margin: Math.round((econ.margin ?? 0) * 100) })} value={formatUZS(econ.profit, locale)} tone={econ.profit < 0 ? "danger" : "success"} />}
            </dl>
          ) : (
            <p className="text-muted">{t("economicsHint")}</p>
          )}
          {tier !== "PRO" && <p className="text-[12px] text-muted">{t("proCommission")}</p>}
        </div>
        <div className="card space-y-2 p-5">
          {!shopApproved && <p className="text-sm text-muted">{t("shopNotApproved")}</p>}
          <FormError message={error} />
          <Button className="w-full" loading={pending} onClick={() => save(true)} disabled={!shopApproved}>
            {initial?.status === "ACTIVE" ? t("saveChanges") : t("publish")}
          </Button>
          {initial?.status !== "ACTIVE" && (
            <Button className="w-full" variant="secondary" disabled={pending} onClick={() => save(false)}>
              {t("saveDraft")}
            </Button>
          )}
          {initial && (
            <p className="text-center text-[12px] text-muted">
              {tp(`statuses.${initial.status}`)} · {initial.slug}
            </p>
          )}
        </div>
      </aside>
      {schedule && <ScheduleDialog variant={schedule} onClose={() => setSchedule(null)} onDone={() => (setSchedule(null), router.refresh())} />}
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "danger" | "success" }) {
  return (
    <div className={cn("flex justify-between gap-2", strong && "border-t border-border pt-1.5 font-extrabold")}>
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular", tone === "danger" && "text-danger", tone === "success" && "font-bold text-success")}>{value}</dd>
    </div>
  );
}

function ScheduleDialog({ variant, onClose, onDone }: { variant: VariantRow; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("sellerProducts.editor");
  const tc = useTranslations("common");
  const [v, setV] = useState({ newPrice: "", newOldPrice: variant.price, startsAt: "", endsAt: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("scheduleTitle", { sku: variant.sku })}
      closeLabel={tc("close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await schedulePriceAction({ variantId: variant.id!, newPrice: Number(v.newPrice), newOldPrice: v.newOldPrice ? Number(v.newOldPrice) : null, startsAt: new Date(v.startsAt), endsAt: v.endsAt ? new Date(v.endsAt) : null });
                if (!res.ok) {
                  setErrors(res.fieldErrors ?? {});
                  return setError(res.error);
                }
                onDone();
              })
            }
          >
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("newPrice")} htmlFor="s-price" error={errors.newPrice}>
          <Input id="s-price" inputMode="numeric" value={v.newPrice} onChange={(e) => setV({ ...v, newPrice: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("oldPrice")} htmlFor="s-old" error={errors.newOldPrice}>
          <Input id="s-old" inputMode="numeric" value={v.newOldPrice} onChange={(e) => setV({ ...v, newOldPrice: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("startsAt")} htmlFor="s-start" error={errors.startsAt}>
          <Input id="s-start" type="datetime-local" value={v.startsAt} onChange={(e) => setV({ ...v, startsAt: e.target.value })} />
        </Field>
        <Field label={t("endsAt")} htmlFor="s-end" hint={t("endsAtHint")} error={errors.endsAt}>
          <Input id="s-end" type="datetime-local" value={v.endsAt} onChange={(e) => setV({ ...v, endsAt: e.target.value })} />
        </Field>
      </div>
      <FormError message={error} />
    </Dialog>
  );
}

function AbTest({ product, pro }: { product: EditableProduct; pro: boolean }) {
  const t = useTranslations("sellerProducts.editor");
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<"title" | "image">("title");
  const [title, setTitle] = useState("");
  const [image, setImage] = useState(product.media[1] ?? "");
  const [pending, start] = useTransition();
  const e = product.experiment;
  const ctr = (c: number, i: number) => (i ? `${((c / i) * 100).toFixed(1)}%` : "—");
  return (
    <section className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <FlaskConical className="h-5 w-5 text-info" /> {t("abTitle")} {!pro && <span className="rounded bg-accent px-1.5 text-[11px] font-bold text-[#1A1A1F]">PRO</span>}
      </h2>
      <p className="text-sm text-muted">{t("abText")}</p>
      {e?.status === "RUNNING" ? (
        <div className="space-y-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th />
                <th>{t("abVariant")}</th>
                <th className="text-right">{t("abImpressions")}</th>
                <th className="text-right">{t("abClicks")}</th>
                <th className="text-right">CTR</th>
              </tr>
            </thead>
            <tbody>
              {(["A", "B"] as const).map((g) => {
                const val = g === "A" ? e.a : e.b;
                const imp = g === "A" ? e.impressionsA : e.impressionsB;
                const clk = g === "A" ? e.clicksA : e.clicksB;
                return (
                  <tr key={g} className="border-t border-border">
                    <td className="py-1.5 font-bold">{g}</td>
                    <td className="max-w-60 truncate py-1.5">{val.title ?? (val.image ? <Image src={val.image} alt="" width={40} height={40} className="rounded" /> : "—")}</td>
                    <td className="tabular py-1.5 text-right">{imp}</td>
                    <td className="tabular py-1.5 text-right">{clk}</td>
                    <td className="tabular py-1.5 text-right font-bold">{ctr(clk, imp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {e.impressionsA + e.impressionsB > 0 && <p className="text-sm font-semibold">{t("abWinner", { winner: (e.impressionsB ? e.clicksB / e.impressionsB : 0) > (e.impressionsA ? e.clicksA / e.impressionsA : 0) ? "B" : "A" })}</p>}
          <div className="flex gap-2">
            <Button size="sm" loading={pending} onClick={() => start(async () => { const r = await stopExperimentAction({ experimentId: e.id, apply: true }); if (r.ok) toast.success(t("abWinner", { winner: String((r.data as { winner: string }).winner) })); router.refresh(); })}>
              <Star className="h-4 w-4" /> {t("abApply")}
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { await stopExperimentAction({ experimentId: e.id, apply: false }); router.refresh(); })}>
              {t("abStop")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {e?.winner && <p className="text-sm text-muted">{t("abLast", { winner: e.winner })}</p>}
          <div className="flex gap-4">
            <Radio name="abtype" checked={type === "title"} onChange={() => setType("title")} label={t("abTypeTitle")} />
            <Radio name="abtype" checked={type === "image"} onChange={() => setType("image")} label={t("abTypeImage")} disabled={product.media.length < 2} />
          </div>
          {type === "title" ? (
            <Input aria-label={t("abAltTitle")} placeholder={t("abAltTitle")} value={title} onChange={(ev) => setTitle(ev.target.value)} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {product.media.slice(1).map((url) => (
                <button key={url} type="button" onClick={() => setImage(url)} className={cn("relative h-16 w-16 overflow-hidden rounded-[10px]", image === url && "ring-2 ring-primary")} aria-pressed={image === url}>
                  <Image src={url} alt="" fill sizes="64px" className="object-cover" />
                </button>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!pro || pending}
            onClick={() =>
              start(async () => {
                const r = await startExperimentAction({ productId: product.id, type, title, image });
                if (!r.ok) return toast.error(r.error);
                router.refresh();
              })
            }
          >
            {t("abStart")}
          </Button>
          {!pro && <p className="text-[12px] text-muted">{t("abProOnly")}</p>}
        </div>
      )}
    </section>
  );
}
