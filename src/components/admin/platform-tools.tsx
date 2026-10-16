"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { getPathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { demoResetAction, saveFlagAction, saveSettingsAction } from "@/server/actions/admin-platform";
import type { PlatformSettings } from "@/lib/platform";
import { toLocalInput } from "./marketing-tools";

// ── Feature flags ────────────────────────────────────────────────────────

type FlagForm = { id?: string; key: string; description: string | null; enabled: boolean; rolloutPercent: number; variants: Array<{ key: string; weight: number }> };

export function FlagEditor({ flag, known }: { flag?: FlagForm; known: Record<string, { variants?: string[] }> }) {
  const t = useTranslations("adminFlags");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const blank: FlagForm = { key: "", description: "", enabled: false, rolloutPercent: 100, variants: [] };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<FlagForm>(flag ?? blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const suggestions = known[f.key]?.variants;
  const total = f.variants.reduce((s, v) => s + v.weight, 0);
  const setVariant = (i: number, patch: Partial<{ key: string; weight: number }>) => setF({ ...f, variants: f.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

  const save = () =>
    start(async () => {
      setError(null);
      setErrors({});
      const res = await saveFlagAction({ ...f, description: f.description || null });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        return setError(res.error);
      }
      toast.success(t("saved"));
      setOpen(false);
      if (!flag) setF(blank);
      router.refresh();
    });

  return (
    <>
      {flag ? (
        <Button size="sm" variant="ghost" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setOpen(true)}>
          {t("edit")}
        </Button>
      ) : (
        <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
          {t("new")}
        </Button>
      )}
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={flag ? flag.key : t("new")}
          closeLabel={tc("close")}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {tc("back")}
              </Button>
              <Button variant="primary" loading={pending} onClick={save}>
                {tc("save")}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label={t("key")} htmlFor="fl-key" error={errors.key} hint={t("keyHint")}>
              <Input id="fl-key" value={f.key} disabled={!!flag} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "") })} list="fl-known" />
              <datalist id="fl-known">
                {Object.keys(known).map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </Field>
            <Field label={t("description")} htmlFor="fl-desc">
              <Textarea id="fl-desc" rows={2} maxLength={300} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
            <Switch label={t("enabled")} checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
            <Field label={t("rollout", { pct: f.rolloutPercent })} htmlFor="fl-rollout" hint={t("rolloutHint")}>
              <input id="fl-rollout" type="range" min={0} max={100} step={5} value={f.rolloutPercent} onChange={(e) => setF({ ...f, rolloutPercent: Number(e.target.value) })} className="w-full accent-[#C8102E]" />
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">{t("variants")}</legend>
              <p className="text-[13px] text-muted">{suggestions ? t("variantsKnown", { list: suggestions.join(", ") }) : t("variantsHint")}</p>
              {f.variants.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input aria-label={t("variantKey")} value={v.key} onChange={(e) => setVariant(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} className="flex-1" list={suggestions ? "fl-variants" : undefined} />
                  <Input aria-label={t("weight")} inputMode="numeric" value={String(v.weight)} onChange={(e) => setVariant(i, { weight: Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0) })} className="w-20" />
                  <span className="w-12 text-right text-[13px] tabular text-muted">{total ? Math.round((v.weight / total) * 100) : 0}%</span>
                  <Button size="sm" variant="ghost" aria-label={t("removeVariant")} onClick={() => setF({ ...f, variants: f.variants.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {suggestions && (
                <datalist id="fl-variants">
                  {suggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
              {f.variants.length < 6 && (
                <Button size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setF({ ...f, variants: [...f.variants, { key: suggestions?.find((s) => !f.variants.some((v) => v.key === s)) ?? "", weight: 50 }] })}>
                  {t("addVariant")}
                </Button>
              )}
              {f.variants.length === 1 && <p className="text-[13px] text-danger">{t("oneVariant")}</p>}
              {errors.variants && <p className="text-[13px] text-danger">{errors.variants}</p>}
            </fieldset>
            <FormError message={error} />
          </div>
        </Dialog>
      )}
    </>
  );
}

// ── Platform settings ────────────────────────────────────────────────────

export function SettingsForm({ initial }: { initial: PlatformSettings }) {
  const t = useTranslations("adminSettings");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState(() => ({ ...initial, announcement: { ...initial.announcement, startsAt: toLocalInput(initial.announcement.startsAt), endsAt: toLocalInput(initial.announcement.endsAt) } }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const a = s.announcement;
  const setA = (patch: Partial<typeof a>) => setS((prev) => ({ ...prev, announcement: { ...prev.announcement, ...patch } }));
  const setP = (patch: Partial<PlatformSettings["ordersPaused"]>) => setS((prev) => ({ ...prev, ordersPaused: { ...prev.ordersPaused, ...patch } }));
  const setSup = (patch: Partial<PlatformSettings["support"]>) => setS((prev) => ({ ...prev, support: { ...prev.support, ...patch } }));
  const setReq = (patch: Partial<PlatformSettings["requisites"]>) => setS((prev) => ({ ...prev, requisites: { ...prev.requisites, ...patch } }));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          setErrors({});
          const iso = (v: string) => (v ? new Date(v).toISOString() : null);
          const res = await saveSettingsAction({ ...s, announcement: { ...a, href: a.href || null, startsAt: iso(a.startsAt), endsAt: iso(a.endsAt) } });
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">{t("announcement")}</h2>
          <Switch label={t("show")} checked={a.enabled} onChange={(e) => setA({ enabled: e.target.checked })} />
        </div>
        <p className="text-sm text-muted">{t("announcementHint")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("textUz")} htmlFor="st-auz" error={errors["announcement.textUz"]}>
            <Input id="st-auz" maxLength={200} value={a.textUz} onChange={(e) => setA({ textUz: e.target.value })} />
          </Field>
          <Field label={t("textRu")} htmlFor="st-aru">
            <Input id="st-aru" maxLength={200} value={a.textRu} onChange={(e) => setA({ textRu: e.target.value })} />
          </Field>
          <Field label={t("link")} htmlFor="st-ahref" error={errors["announcement.href"]} hint={t("linkHint")}>
            <Input id="st-ahref" maxLength={200} placeholder="/deals" value={a.href ?? ""} onChange={(e) => setA({ href: e.target.value })} />
          </Field>
          <Field label={t("tone")} htmlFor="st-atone">
            <Select id="st-atone" value={a.tone} onChange={(e) => setA({ tone: e.target.value as typeof a.tone })}>
              {(["info", "promo", "warning"] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`tones.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("startsAt")} htmlFor="st-as">
            <Input id="st-as" type="datetime-local" value={a.startsAt} onChange={(e) => setA({ startsAt: e.target.value })} />
          </Field>
          <Field label={t("endsAt")} htmlFor="st-ae" error={errors["announcement.endsAt"]}>
            <Input id="st-ae" type="datetime-local" value={a.endsAt} onChange={(e) => setA({ endsAt: e.target.value })} />
          </Field>
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">{t("ordersPaused")}</h2>
          <Switch label={t("pause")} checked={s.ordersPaused.enabled} onChange={(e) => setP({ enabled: e.target.checked })} />
        </div>
        <p className="text-sm text-muted">{t("ordersPausedHint")}</p>
        {s.ordersPaused.enabled && (
          <p className="flex items-center gap-2 rounded-[10px] bg-danger/10 p-2 text-sm font-semibold text-danger">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {t("pausedWarning")}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("messageUz")} htmlFor="st-puz" error={errors["ordersPaused.messageUz"]}>
            <Textarea id="st-puz" rows={2} maxLength={300} value={s.ordersPaused.messageUz} onChange={(e) => setP({ messageUz: e.target.value })} />
          </Field>
          <Field label={t("messageRu")} htmlFor="st-pru">
            <Textarea id="st-pru" rows={2} maxLength={300} value={s.ordersPaused.messageRu} onChange={(e) => setP({ messageRu: e.target.value })} />
          </Field>
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">{t("sellers")}</h2>
        <Switch label={t("sellerSignupOpen")} checked={s.sellerSignupOpen} onChange={(e) => setS((prev) => ({ ...prev, sellerSignupOpen: e.target.checked }))} />
        <p className="text-sm text-muted">{t("sellerSignupHint")}</p>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">{t("support")}</h2>
        <p className="text-sm text-muted">{t("supportHint")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t("phone")} htmlFor="st-ph" error={errors["support.phone"]}>
            <Input id="st-ph" inputMode="tel" maxLength={20} placeholder="+998 ..." value={s.support.phone} onChange={(e) => setSup({ phone: e.target.value })} />
          </Field>
          <Field label={t("email")} htmlFor="st-em" error={errors["support.email"]}>
            <Input id="st-em" type="email" maxLength={120} value={s.support.email} onChange={(e) => setSup({ email: e.target.value })} />
          </Field>
          <Field label={t("telegram")} htmlFor="st-tg" error={errors["support.telegram"]} hint={t("telegramHint")}>
            <Input id="st-tg" maxLength={60} placeholder="@..." value={s.support.telegram} onChange={(e) => setSup({ telegram: e.target.value })} />
          </Field>
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">{t("requisites")}</h2>
        <p className="text-sm text-muted">{t("requisitesHint")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("legalName")} htmlFor="rq-name" error={errors["requisites.legalName"]}>
            <Input id="rq-name" maxLength={160} value={s.requisites.legalName} onChange={(e) => setReq({ legalName: e.target.value })} />
          </Field>
          <Field label={t("taxId")} htmlFor="rq-tax" error={errors["requisites.taxId"]}>
            <Input id="rq-tax" inputMode="numeric" maxLength={9} value={s.requisites.taxId} onChange={(e) => setReq({ taxId: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label={t("legalAddress")} htmlFor="rq-addr" error={errors["requisites.address"]} className="sm:col-span-2">
            <Input id="rq-addr" maxLength={240} value={s.requisites.address} onChange={(e) => setReq({ address: e.target.value })} />
          </Field>
          <Field label={t("bankName")} htmlFor="rq-bank" error={errors["requisites.bankName"]}>
            <Input id="rq-bank" maxLength={120} value={s.requisites.bankName} onChange={(e) => setReq({ bankName: e.target.value })} />
          </Field>
          <Field label={t("mfo")} htmlFor="rq-mfo" error={errors["requisites.mfo"]}>
            <Input id="rq-mfo" inputMode="numeric" maxLength={5} value={s.requisites.mfo} onChange={(e) => setReq({ mfo: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label={t("bankAccount")} htmlFor="rq-acc" error={errors["requisites.bankAccount"]} className="sm:col-span-2">
            <Input id="rq-acc" inputMode="numeric" maxLength={20} value={s.requisites.bankAccount} onChange={(e) => setReq({ bankAccount: e.target.value.replace(/\D/g, "") })} />
          </Field>
        </div>
      </section>

      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending}>
          {tc("save")}
        </Button>
      </div>
    </form>
  );
}

// ── Demo reset ───────────────────────────────────────────────────────────

export function DemoReset({ phrase }: { phrase: string }) {
  const t = useTranslations("adminStatus");
  const locale = useLocale();
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button variant="danger" leftIcon={<TriangleAlert className="h-4 w-4" />} onClick={() => setOpen(true)}>
        {t("reset.button")}
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => !pending && setOpen(false)}
          title={t("reset.title")}
          closeLabel={tc("close")}
          footer={
            <>
              <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                {tc("back")}
              </Button>
              <Button
                variant="danger"
                loading={pending}
                disabled={text.trim() !== phrase}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const res = await demoResetAction({ phrase: text });
                    if (!res.ok) return setError(res.error);
                    // Every session was cleared, ours included.
                    window.location.assign(getPathname({ href: "/staff/login?reset=1", locale }));
                  })
                }
              >
                {t("reset.confirm")}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <p>{t("reset.body")}</p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>{t("reset.wipes")}</li>
              <li>{t("reset.keeps")}</li>
              <li>{t("reset.signout")}</li>
            </ul>
            <Field label={t("reset.type", { phrase })} htmlFor="demo-phrase">
              <Input id="demo-phrase" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            </Field>
            {pending && <p className="text-muted">{t("reset.running")}</p>}
            <FormError message={error} />
          </div>
        </Dialog>
      )}
    </>
  );
}
