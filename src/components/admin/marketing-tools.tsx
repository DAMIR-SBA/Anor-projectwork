"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { ImageUploader } from "@/components/ui/uploader";
import { useToast } from "@/components/ui/toast";
import { ActionButton } from "@/components/admin/ui";
import { bulkCouponsAction, moderateParticipantsAction, saveBannerAction, saveCampaignAction, saveCouponAction, saveLoyaltyAction } from "@/server/actions/admin-marketing";
import { formatUZS } from "@/lib/money";

/** "YYYY-MM-DDTHH:mm" in the viewer's time zone for datetime-local inputs. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fromLocal = (v: string) => (v ? new Date(v) : null);

// ── Campaigns ────────────────────────────────────────────────────────────

type BlockType = "hero" | "countdown" | "products" | "text" | "coupons";
type Block = { type: BlockType; textUz?: string; textRu?: string; codes?: string[] };
export type CampaignForm = { id?: string; slug: string; type: "FLASH_SALE" | "DEAL_OF_DAY" | "SEASONAL"; nameUz: string; nameRu: string; descriptionUz: string; descriptionRu: string; season: string; startsAt: string | null; endsAt: string | null; minDiscountPercent: number; plusEarlyHours: number; themeColor: string; bannerUrl: string | null; recurring: boolean; spinEnabled: boolean; blocks: Block[] };

const BLOCK_TYPES: BlockType[] = ["hero", "countdown", "products", "text", "coupons"];

export function CampaignEditor({ initial }: { initial: CampaignForm }) {
  const t = useTranslations("adminCampaigns");
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ ...initial, startsAt: toLocalInput(initial.startsAt), endsAt: toLocalInput(initial.endsAt) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const setBlock = (i: number, patch: Partial<Block>) => setF((x) => ({ ...x, blocks: x.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const move = (i: number, dir: -1 | 1) =>
    setF((x) => {
      const b = [...x.blocks];
      const j = i + dir;
      if (j < 0 || j >= b.length) return x;
      [b[i], b[j]] = [b[j], b[i]];
      return { ...x, blocks: b };
    });
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          setErrors({});
          const res = await saveCampaignAction({
            id: f.id,
            slug: f.slug || undefined,
            type: f.type,
            nameUz: f.nameUz,
            nameRu: f.nameRu,
            descriptionUz: f.descriptionUz || null,
            descriptionRu: f.descriptionRu || null,
            season: f.season || null,
            startsAt: fromLocal(f.startsAt) ?? new Date(NaN),
            endsAt: fromLocal(f.endsAt) ?? new Date(NaN),
            minDiscountPercent: f.minDiscountPercent,
            plusEarlyHours: f.plusEarlyHours,
            themeColor: f.themeColor,
            bannerUrl: f.bannerUrl,
            recurring: f.recurring,
            spinEnabled: f.spinEnabled,
            blocks: f.blocks,
          });
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            return setError(res.error);
          }
          toast.success(t("saved"));
          const id = (res.data as { id: string }).id;
          if (!f.id) router.replace(`/admin/campaigns/${id}`);
          else router.refresh();
        });
      }}
    >
      <section className="card space-y-3 p-5">
        <h2 className="font-bold">{t("basics")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("nameUz")} htmlFor="cp-nuz" error={errors.nameUz}>
            <Input id="cp-nuz" value={f.nameUz} onChange={(e) => setF({ ...f, nameUz: e.target.value })} />
          </Field>
          <Field label={t("nameRu")} htmlFor="cp-nru" error={errors.nameRu}>
            <Input id="cp-nru" value={f.nameRu} onChange={(e) => setF({ ...f, nameRu: e.target.value })} />
          </Field>
          <Field label={t("descriptionUz")} htmlFor="cp-duz">
            <Textarea id="cp-duz" rows={2} value={f.descriptionUz} onChange={(e) => setF({ ...f, descriptionUz: e.target.value })} />
          </Field>
          <Field label={t("descriptionRu")} htmlFor="cp-dru">
            <Textarea id="cp-dru" rows={2} value={f.descriptionRu} onChange={(e) => setF({ ...f, descriptionRu: e.target.value })} />
          </Field>
          <Field label={t("slug")} htmlFor="cp-slug" error={errors.slug} hint={t("slugHint")}>
            <Input id="cp-slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
          </Field>
          <Field label={t("type")} htmlFor="cp-type">
            <Select id="cp-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as CampaignForm["type"] })}>
              {(["SEASONAL", "FLASH_SALE", "DEAL_OF_DAY"] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`types.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("startsAt")} htmlFor="cp-start" error={errors.startsAt}>
            <Input id="cp-start" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
          </Field>
          <Field label={t("endsAt")} htmlFor="cp-end" error={errors.endsAt}>
            <Input id="cp-end" type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
          </Field>
          <Field label={t("minDiscount")} htmlFor="cp-min" error={errors.minDiscountPercent} hint={t("minDiscountHint")}>
            <Input id="cp-min" inputMode="numeric" value={String(f.minDiscountPercent)} onChange={(e) => setF({ ...f, minDiscountPercent: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </Field>
          <Field label={t("plusEarly")} htmlFor="cp-plus" hint={t("plusEarlyHint")}>
            <Input id="cp-plus" inputMode="numeric" value={String(f.plusEarlyHours)} onChange={(e) => setF({ ...f, plusEarlyHours: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          </Field>
          <Field label={t("season")} htmlFor="cp-season" hint="QORA_JUMA, 11_11, NAVRUZ…">
            <Input id="cp-season" value={f.season} onChange={(e) => setF({ ...f, season: e.target.value.toUpperCase() })} />
          </Field>
          <Field label={t("color")} htmlFor="cp-color">
            <div className="flex items-center gap-2">
              <input id="cp-color" type="color" value={f.themeColor} onChange={(e) => setF({ ...f, themeColor: e.target.value })} className="h-10 w-14 rounded-[10px] border border-border" />
              <span className="font-mono text-sm">{f.themeColor}</span>
            </div>
          </Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <Checkbox checked={f.recurring} onChange={(e) => setF({ ...f, recurring: e.target.checked })} label={t("recurring")} />
          <Checkbox checked={f.spinEnabled} onChange={(e) => setF({ ...f, spinEnabled: e.target.checked })} label={t("spin")} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">{t("banner")}</p>
          <ImageUploader value={f.bannerUrl ? [f.bannerUrl] : []} onChange={(urls) => setF({ ...f, bannerUrl: urls.at(-1) ?? null })} folder="banners" max={1} />
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">{t("landing")}</h2>
        <p className="text-sm text-muted">{t("landingHint")}</p>
        <ol className="space-y-2">
          {f.blocks.map((b, i) => (
            <li key={i} className="rounded-[14px] border border-border p-3">
              <div className="flex items-center gap-2">
                <Badge tone="info">{t(`blocks.${b.type}`)}</Badge>
                <span className="ml-auto flex gap-1">
                  <button type="button" className="rounded p-1 hover:bg-surface-3 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("up")}>
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" className="rounded p-1 hover:bg-surface-3 disabled:opacity-30" disabled={i === f.blocks.length - 1} onClick={() => move(i, 1)} aria-label={t("down")}>
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button type="button" className="rounded p-1 text-muted hover:bg-surface-3 hover:text-danger" onClick={() => setF((x) => ({ ...x, blocks: x.blocks.filter((_, j) => j !== i) }))} aria-label={t("removeBlock")}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </div>
              {b.type === "text" && (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Textarea aria-label={t("textUz")} placeholder={t("textUz")} rows={2} value={b.textUz ?? ""} onChange={(e) => setBlock(i, { textUz: e.target.value })} />
                  <Textarea aria-label={t("textRu")} placeholder={t("textRu")} rows={2} value={b.textRu ?? ""} onChange={(e) => setBlock(i, { textRu: e.target.value })} />
                </div>
              )}
              {b.type === "coupons" && <Input className="mt-2" aria-label={t("codes")} placeholder="NAVRUZ25, ANOR10" value={(b.codes ?? []).join(", ")} onChange={(e) => setBlock(i, { codes: e.target.value.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean) })} />}
              {["hero", "countdown", "products"].includes(b.type) && <p className="mt-1.5 text-[13px] text-muted">{t(`blockHints.${b.type}`)}</p>}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-1.5">
          {BLOCK_TYPES.map((bt) => (
            <Button key={bt} type="button" size="sm" variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setF((x) => ({ ...x, blocks: [...x.blocks, { type: bt }] }))}>
              {t(`blocks.${bt}`)}
            </Button>
          ))}
        </div>
      </section>
      <FormError message={error} />
      <Button type="submit" loading={pending}>
        {t("save")}
      </Button>
    </form>
  );
}

type Participant = { id: string; status: "PENDING" | "APPROVED" | "REJECTED"; salePrice: number; stockLimit: number | null; sold: number; product: { titleUz: string; titleRu: string; price: number; slug: string; image: string | null }; shop: { name: string } };

export function ParticipantsTable({ campaignId, rows, minDiscount }: { campaignId: string; rows: Participant[]; minDiscount: number }) {
  const t = useTranslations("adminCampaigns");
  const locale = useLocale();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const ids = [...sel];
  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <h2 className="mr-auto font-bold">{t("participants", { count: rows.length })}</h2>
        {sel.size > 0 && (
          <>
            <ActionButton action={moderateParticipantsAction} input={{ campaignId, ids, decision: "APPROVED" as const }} variant="success" label={t("approveN", { count: sel.size })} onDone={() => setSel(new Set())} />
            <ActionButton action={moderateParticipantsAction} input={{ campaignId, ids, decision: "REJECTED" as const }} variant="danger" label={t("rejectN", { count: sel.size })} reason={{ title: t("rejectTitle"), required: false }} onDone={() => setSel(new Set())} />
          </>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="w-10 px-3 py-2">
                <input type="checkbox" aria-label={t("selectAll")} className="h-4 w-4 accent-[#C8102E]" checked={rows.length > 0 && sel.size === rows.length} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
              </th>
              <th className="px-3 py-2">{t("product")}</th>
              <th className="px-3 py-2">{t("shop")}</th>
              <th className="px-3 py-2 text-right">{t("salePrice")}</th>
              <th className="px-3 py-2 text-right">{t("sold")}</th>
              <th className="px-3 py-2">{t("status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const discount = Math.round((1 - r.salePrice / r.product.price) * 100);
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={r.product.titleUz}
                      className="h-4 w-4 accent-[#C8102E]"
                      checked={sel.has(r.id)}
                      onChange={() =>
                        setSel((s) => {
                          const n = new Set(s);
                          if (n.has(r.id)) n.delete(r.id);
                          else n.add(r.id);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[8px] bg-surface-2">{r.product.image && <Image src={r.product.image} alt="" fill sizes="36px" className="object-cover" />}</span>
                      <span className="line-clamp-2">{locale === "ru" ? r.product.titleRu : r.product.titleUz}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.shop.name}</td>
                  <td className="tabular px-3 py-2 text-right">
                    {formatUZS(r.salePrice, locale)}{" "}
                    <span className={discount < minDiscount ? "font-bold text-danger" : "text-[12px] text-muted"}>−{discount}%</span>
                  </td>
                  <td className="tabular px-3 py-2 text-right">
                    {r.sold}
                    {r.stockLimit ? ` / ${r.stockLimit}` : ""}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={r.status === "APPROVED" ? "success" : r.status === "REJECTED" ? "danger" : "accent"}>{t(`pStatus.${r.status}`)}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted">{t("noParticipants")}</p>}
      </div>
    </div>
  );
}

// ── Coupons ──────────────────────────────────────────────────────────────

type CouponType = "PERCENT" | "FIXED" | "FREE_DELIVERY";
export type CouponForm = { id?: string; code: string; type: CouponType; value: number; maxDiscount: number | null; minCartTotal: number; categoryId: string | null; shopId: string | null; firstOrderOnly: boolean; usageLimit: number | null; perUserLimit: number; startsAt: string | null; endsAt: string | null; isActive: boolean; descriptionUz: string; descriptionRu: string };
type Opt = { id: string; label: string };

function CouponFields({ f, setF, categories, shops, errors, bulk }: { f: CouponForm; setF: (f: CouponForm) => void; categories: Opt[]; shops: Opt[]; errors: Record<string, string>; bulk?: boolean }) {
  const t = useTranslations("adminCoupons");
  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {!bulk && (
        <Field label={t("code")} htmlFor="cpn-code" error={errors.code}>
          <Input id="cpn-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className="font-mono" />
        </Field>
      )}
      <Field label={t("type")} htmlFor="cpn-type">
        <Select id="cpn-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as CouponType })}>
          {(["PERCENT", "FIXED", "FREE_DELIVERY"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`types.${k}`)}
            </option>
          ))}
        </Select>
      </Field>
      {f.type !== "FREE_DELIVERY" && (
        <Field label={f.type === "PERCENT" ? t("percent") : t("amount")} htmlFor="cpn-val" error={errors.value}>
          <Input id="cpn-val" inputMode="numeric" value={String(f.value)} onChange={(e) => setF({ ...f, value: num(e.target.value) })} />
        </Field>
      )}
      {f.type === "PERCENT" && (
        <Field label={t("maxDiscount")} htmlFor="cpn-max">
          <Input id="cpn-max" inputMode="numeric" value={f.maxDiscount ?? ""} placeholder="—" onChange={(e) => setF({ ...f, maxDiscount: e.target.value ? num(e.target.value) : null })} />
        </Field>
      )}
      <Field label={t("minCart")} htmlFor="cpn-min">
        <Input id="cpn-min" inputMode="numeric" value={String(f.minCartTotal)} onChange={(e) => setF({ ...f, minCartTotal: num(e.target.value) })} />
      </Field>
      <Field label={t("category")} htmlFor="cpn-cat">
        <Select id="cpn-cat" value={f.categoryId ?? ""} onChange={(e) => setF({ ...f, categoryId: e.target.value || null })}>
          <option value="">{t("anyCategory")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("shop")} htmlFor="cpn-shop">
        <Select id="cpn-shop" value={f.shopId ?? ""} onChange={(e) => setF({ ...f, shopId: e.target.value || null })}>
          <option value="">{t("anyShop")}</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      {!bulk && (
        <>
          <Field label={t("usageLimit")} htmlFor="cpn-lim">
            <Input id="cpn-lim" inputMode="numeric" value={f.usageLimit ?? ""} placeholder="∞" onChange={(e) => setF({ ...f, usageLimit: e.target.value ? num(e.target.value) : null })} />
          </Field>
          <Field label={t("perUser")} htmlFor="cpn-pu">
            <Input id="cpn-pu" inputMode="numeric" value={String(f.perUserLimit)} onChange={(e) => setF({ ...f, perUserLimit: num(e.target.value) || 1 })} />
          </Field>
        </>
      )}
      <Field label={t("startsAt")} htmlFor="cpn-s">
        <Input id="cpn-s" type="datetime-local" value={toLocalInput(f.startsAt)} onChange={(e) => setF({ ...f, startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
      </Field>
      <Field label={t("endsAt")} htmlFor="cpn-e" error={errors.endsAt}>
        <Input id="cpn-e" type="datetime-local" value={toLocalInput(f.endsAt)} onChange={(e) => setF({ ...f, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
      </Field>
      <Field label={t("descriptionUz")} htmlFor="cpn-duz">
        <Input id="cpn-duz" value={f.descriptionUz} onChange={(e) => setF({ ...f, descriptionUz: e.target.value })} />
      </Field>
      <Field label={t("descriptionRu")} htmlFor="cpn-dru">
        <Input id="cpn-dru" value={f.descriptionRu} onChange={(e) => setF({ ...f, descriptionRu: e.target.value })} />
      </Field>
      <div className="flex flex-wrap gap-4 sm:col-span-2">
        <Checkbox checked={f.firstOrderOnly} onChange={(e) => setF({ ...f, firstOrderOnly: e.target.checked })} label={t("firstOrder")} />
        <Checkbox checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} label={t("active")} />
      </div>
    </div>
  );
}

const couponPayload = (f: CouponForm) => ({ type: f.type, value: f.value, maxDiscount: f.maxDiscount, minCartTotal: f.minCartTotal, categoryId: f.categoryId, shopId: f.shopId, firstOrderOnly: f.firstOrderOnly, usageLimit: f.usageLimit, perUserLimit: f.perUserLimit, startsAt: f.startsAt ? new Date(f.startsAt) : null, endsAt: f.endsAt ? new Date(f.endsAt) : null, isActive: f.isActive, descriptionUz: f.descriptionUz || null, descriptionRu: f.descriptionRu || null });

export const BLANK_COUPON: CouponForm = { code: "", type: "PERCENT", value: 10, maxDiscount: null, minCartTotal: 0, categoryId: null, shopId: null, firstOrderOnly: false, usageLimit: null, perUserLimit: 1, startsAt: null, endsAt: null, isActive: true, descriptionUz: "", descriptionRu: "" };

export function CouponEditor({ initial, categories, shops }: { initial?: CouponForm; categories: Opt[]; shops: Opt[] }) {
  const t = useTranslations("adminCoupons");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<CouponForm>(initial ?? BLANK_COUPON);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      {initial ? (
        <button type="button" className="rounded-[8px] p-1.5 text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("edit")} onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
          {t("add")}
        </Button>
      )}
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={initial ? initial.code : t("add")}
          closeLabel={tc("close")}
          className="sm:max-w-2xl"
          footer={
            <Button
              loading={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  setErrors({});
                  const res = await saveCouponAction({ id: initial?.id, code: f.code, ...couponPayload(f) });
                  if (!res.ok) {
                    setErrors(res.fieldErrors ?? {});
                    return setError(res.error);
                  }
                  toast.success(t("saved"));
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {t("save")}
            </Button>
          }
        >
          <CouponFields f={f} setF={setF} categories={categories} shops={shops} errors={errors} />
          <FormError message={error} />
        </Dialog>
      )}
    </>
  );
}

export function BulkCoupons({ categories, shops }: { categories: Opt[]; shops: Opt[] }) {
  const t = useTranslations("adminCoupons");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<CouponForm>(BLANK_COUPON);
  const [prefix, setPrefix] = useState("PARTNER");
  const [count, setCount] = useState("100");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const csvHref = codes ? `data:text/csv;charset=utf-8,${encodeURIComponent(["code", ...codes].join("\n"))}` : "";
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t("bulk")}
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => {
            setOpen(false);
            setCodes(null);
          }}
          title={t("bulkTitle")}
          closeLabel={tc("close")}
          className="sm:max-w-2xl"
          footer={
            codes ? (
              <a href={csvHref} download={`${prefix}-codes.csv`} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-primary px-5 font-semibold text-white">
                <Download className="h-4 w-4" /> CSV
              </a>
            ) : (
              <Button
                loading={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const res = await bulkCouponsAction({ prefix, count: Number(count) || 0, ...couponPayload(f) });
                    if (!res.ok) return setError(res.error);
                    setCodes((res.data as { codes: string[] }).codes);
                    router.refresh();
                  })
                }
              >
                {t("generate", { count: Number(count) || 0 })}
              </Button>
            )
          }
        >
          {codes ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-success">{t("generated", { count: codes.length })}</p>
              <pre className="max-h-64 overflow-auto rounded-[10px] bg-surface-2 p-3 font-mono text-[13px]">{codes.slice(0, 200).join("\n")}</pre>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">{t("bulkHint")}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("prefix")} htmlFor="bk-prefix">
                  <Input id="bk-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} className="font-mono" />
                </Field>
                <Field label={t("count")} htmlFor="bk-count">
                  <Input id="bk-count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} />
                </Field>
              </div>
              <CouponFields f={f} setF={setF} categories={categories} shops={shops} errors={{}} bulk />
              <FormError message={error} />
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

// ── Banners ──────────────────────────────────────────────────────────────

type Placement = "HOME_HERO" | "HOME_STRIP" | "CATEGORY";
export type BannerForm = { id?: string; titleUz: string; titleRu: string; subtitleUz: string; subtitleRu: string; imageUrl: string | null; href: string; placement: Placement; bgColor: string; sort: number; startsAt: string | null; endsAt: string | null; isActive: boolean };

export function BannerEditor({ initial }: { initial?: BannerForm }) {
  const t = useTranslations("adminBanners");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<BannerForm>(initial ?? { titleUz: "", titleRu: "", subtitleUz: "", subtitleRu: "", imageUrl: null, href: "/", placement: "HOME_HERO", bgColor: "#C8102E", sort: 0, startsAt: null, endsAt: null, isActive: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      {initial ? (
        <button type="button" className="rounded-[8px] p-1.5 text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("edit")} onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
          {t("add")}
        </Button>
      )}
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={initial ? t("editTitle") : t("add")}
          closeLabel={tc("close")}
          className="sm:max-w-2xl"
          footer={
            <Button
              loading={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  setErrors({});
                  const res = await saveBannerAction({ ...f, id: initial?.id, subtitleUz: f.subtitleUz || null, subtitleRu: f.subtitleRu || null, startsAt: f.startsAt ? new Date(f.startsAt) : null, endsAt: f.endsAt ? new Date(f.endsAt) : null });
                  if (!res.ok) {
                    setErrors(res.fieldErrors ?? {});
                    return setError(res.error);
                  }
                  toast.success(t("saved"));
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {t("save")}
            </Button>
          }
        >
          {/* Live preview with the chosen colour and texts. */}
          <div className="mb-4 flex min-h-28 items-center gap-4 overflow-hidden rounded-[16px] p-5 text-white" style={{ background: f.bgColor }}>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-extrabold">{f.titleUz || t("titleUz")}</p>
              {f.subtitleUz && <p className="mt-1 text-sm text-white/85">{f.subtitleUz}</p>}
            </div>
            {f.imageUrl && (
              <span className="relative h-24 w-32 shrink-0">
                <Image src={f.imageUrl} alt="" fill sizes="128px" className="object-contain" />
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("titleUz")} htmlFor="bn-tuz" error={errors.titleUz}>
              <Input id="bn-tuz" value={f.titleUz} onChange={(e) => setF({ ...f, titleUz: e.target.value })} />
            </Field>
            <Field label={t("titleRu")} htmlFor="bn-tru" error={errors.titleRu}>
              <Input id="bn-tru" value={f.titleRu} onChange={(e) => setF({ ...f, titleRu: e.target.value })} />
            </Field>
            <Field label={t("subtitleUz")} htmlFor="bn-suz">
              <Input id="bn-suz" value={f.subtitleUz} onChange={(e) => setF({ ...f, subtitleUz: e.target.value })} />
            </Field>
            <Field label={t("subtitleRu")} htmlFor="bn-sru">
              <Input id="bn-sru" value={f.subtitleRu} onChange={(e) => setF({ ...f, subtitleRu: e.target.value })} />
            </Field>
            <Field label={t("href")} htmlFor="bn-href" error={errors.href} hint={t("hrefHint")}>
              <Input id="bn-href" value={f.href} onChange={(e) => setF({ ...f, href: e.target.value })} />
            </Field>
            <Field label={t("placement")} htmlFor="bn-pl">
              <Select id="bn-pl" value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value as Placement })}>
                {(["HOME_HERO", "HOME_STRIP", "CATEGORY"] as const).map((p) => (
                  <option key={p} value={p}>
                    {t(`placements.${p}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("startsAt")} htmlFor="bn-s">
              <Input id="bn-s" type="datetime-local" value={toLocalInput(f.startsAt)} onChange={(e) => setF({ ...f, startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </Field>
            <Field label={t("endsAt")} htmlFor="bn-e" error={errors.endsAt}>
              <Input id="bn-e" type="datetime-local" value={toLocalInput(f.endsAt)} onChange={(e) => setF({ ...f, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </Field>
            <Field label={t("color")} htmlFor="bn-c">
              <input id="bn-c" type="color" value={f.bgColor} onChange={(e) => setF({ ...f, bgColor: e.target.value })} className="h-10 w-14 rounded-[10px] border border-border" />
            </Field>
            <Field label={t("sort")} htmlFor="bn-sort">
              <Input id="bn-sort" inputMode="numeric" value={String(f.sort)} onChange={(e) => setF({ ...f, sort: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
            </Field>
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-sm font-semibold">{t("image")}</p>
            <ImageUploader value={f.imageUrl ? [f.imageUrl] : []} onChange={(urls) => setF({ ...f, imageUrl: urls.at(-1) ?? null })} folder="banners" max={1} />
          </div>
          <div className="mt-3">
            <Checkbox checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} label={t("active")} />
          </div>
          <FormError message={error} />
        </Dialog>
      )}
    </>
  );
}

// ── Loyalty ──────────────────────────────────────────────────────────────

type Loyalty = { silverFrom: number; goldFrom: number; referralReward: number; refereeReward: number; referralMonthlyCap: number; baseCashback: number; silverCashback: number; goldCashback: number; plusCashback: number; bonusTtlDays: number };

export function LoyaltyForm({ initial }: { initial: Loyalty }) {
  const t = useTranslations("adminLoyalty");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const pct = (v: number) => String(+(v * 100).toFixed(2));
  const [f, setF] = useState(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, k.endsWith("Cashback") ? pct(v) : String(v)])) as Record<keyof Loyalty, string>);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = (k: keyof Loyalty, label: string, hint?: string) => (
    <Field label={label} htmlFor={`ly-${k}`} error={errors[k]} hint={hint}>
      <Input id={`ly-${k}`} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, "") })} />
    </Field>
  );
  const silverPreview = Number(f.silverFrom) ? formatUZS(Number(f.silverFrom), locale) : "—";
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          setErrors({});
          const n = (k: keyof Loyalty) => Number(f[k]) || 0;
          const res = await saveLoyaltyAction({ silverFrom: n("silverFrom"), goldFrom: n("goldFrom"), referralReward: n("referralReward"), refereeReward: n("refereeReward"), referralMonthlyCap: n("referralMonthlyCap"), baseCashback: n("baseCashback") / 100, silverCashback: n("silverCashback") / 100, goldCashback: n("goldCashback") / 100, plusCashback: n("plusCashback") / 100, bonusTtlDays: n("bonusTtlDays") });
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            return setError(res.error);
          }
          toast.success(t("saved"));
          router.refresh();
        });
      }}
    >
      <section className="card space-y-3 p-5">
        <h2 className="font-bold">{t("tiers")}</h2>
        <p className="text-sm text-muted">{t("tiersHint", { silver: silverPreview })}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field("silverFrom", t("silverFrom"))}
          {field("goldFrom", t("goldFrom"))}
        </div>
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="font-bold">{t("cashback")}</h2>
        <p className="text-sm text-muted">{t("cashbackHint")}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {field("baseCashback", t("base"))}
          {field("silverCashback", t("silver"))}
          {field("goldCashback", t("gold"))}
          {field("plusCashback", t("plus"))}
        </div>
        {field("bonusTtlDays", t("ttl"), t("ttlHint"))}
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="font-bold">{t("referral")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {field("referralReward", t("referrer"))}
          {field("refereeReward", t("referee"))}
          {field("referralMonthlyCap", t("cap"), t("capHint"))}
        </div>
      </section>
      <FormError message={error} />
      <Button type="submit" loading={pending}>
        {t("save")}
      </Button>
    </form>
  );
}
