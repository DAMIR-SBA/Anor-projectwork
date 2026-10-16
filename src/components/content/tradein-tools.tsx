"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Laptop, Smartphone, Tablet, Watch } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { ImageUploader } from "@/components/ui/uploader";
import { useToast } from "@/components/ui/toast";
import { answerTradeInAction, offerTradeInAction, submitTradeInAction } from "@/server/actions/content";
import { CATEGORIES, estimate, TRADEIN_MODELS, type Answers, type TradeInCategory } from "@/lib/tradein";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";

const ICONS = { smartphone: Smartphone, laptop: Laptop, tablet: Tablet, watch: Watch } as const;

const DEFAULT_ANSWERS: Answers = { powersOn: true, screen: "perfect", body: "perfect", battery: "good", accessories: false, locked: false };

function Choice<T extends string>({ name, value, options, onChange, label }: { name: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o.value} className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary", value === o.value ? "border-primary bg-primary-50 text-primary dark:bg-primary/10" : "border-border")}>
            <input type="radio" name={name} className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function TradeInEstimator({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("tradein");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [category, setCategory] = useState<TradeInCategory>("smartphone");
  const [modelKey, setModelKey] = useState(TRADEIN_MODELS.smartphone[0].key);
  const [a, setA] = useState<Answers>(DEFAULT_ANSWERS);
  const [photos, setPhotos] = useState<string[]>([]);
  const [imei, setImei] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const model = TRADEIN_MODELS[category].find((m) => m.key === modelKey) ?? TRADEIN_MODELS[category][0];
  const e = estimate(model.base, a);
  const set = (patch: Partial<Answers>) => setA((prev) => ({ ...prev, ...patch }));
  const yesNo = [
    { value: "yes", label: t("yes") },
    { value: "no", label: t("no") },
  ] as const;

  const submit = () =>
    start(async () => {
      setError(null);
      setErrors({});
      const r = await submitTradeInAction({ category, modelKey: model.key, answers: a, photos, imeiLast4: imei });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return setError(r.error);
      }
      toast.success(t("submitted", { number: (r.data as { number: string }).number }));
      router.push("/account/trade-in");
    });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="card space-y-5 p-5">
        <fieldset>
          <legend className="mb-2 font-bold">{t("step1")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CATEGORIES.map((c) => {
              const Icon = ICONS[c];
              return (
                <label key={c} className={cn("flex cursor-pointer flex-col items-center gap-1.5 rounded-[14px] border-2 p-3 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary", category === c ? "border-primary bg-primary-50 dark:bg-primary/10" : "border-border")}>
                  <input
                    type="radio"
                    name="tradein-category"
                    className="sr-only"
                    checked={category === c}
                    onChange={() => {
                      setCategory(c);
                      setModelKey(TRADEIN_MODELS[c][0].key);
                    }}
                  />
                  <Icon className={cn("h-6 w-6", category === c ? "text-primary" : "text-muted")} aria-hidden="true" />
                  {t(`category.${c}`)}
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field label={t("step2")} htmlFor="ti-model">
          <Select id="ti-model" value={model.key} onChange={(ev) => setModelKey(ev.target.value)}>
            {TRADEIN_MODELS[category].map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="space-y-4">
          <p className="font-bold">{t("step3")}</p>
          <Choice name="ti-on" label={t("q.powersOn")} value={a.powersOn ? "yes" : "no"} options={[...yesNo]} onChange={(v) => set({ powersOn: v === "yes" })} />
          <Choice name="ti-screen" label={t("q.screen")} value={a.screen} options={(["perfect", "scratches", "cracked"] as const).map((v) => ({ value: v, label: t(`screen.${v}`) }))} onChange={(screen) => set({ screen })} />
          <Choice name="ti-body" label={t("q.body")} value={a.body} options={(["perfect", "light", "heavy"] as const).map((v) => ({ value: v, label: t(`body.${v}`) }))} onChange={(body) => set({ body })} />
          <Choice name="ti-battery" label={t("q.battery")} value={a.battery} options={(["good", "fair", "poor"] as const).map((v) => ({ value: v, label: t(`battery.${v}`) }))} onChange={(battery) => set({ battery })} />
          <Choice name="ti-acc" label={t("q.accessories")} value={a.accessories ? "yes" : "no"} options={[...yesNo]} onChange={(v) => set({ accessories: v === "yes" })} />
          <Choice name="ti-lock" label={t("q.locked")} value={a.locked ? "yes" : "no"} options={[...yesNo]} onChange={(v) => set({ locked: v === "yes" })} />
        </div>
        {signedIn && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="font-bold">{t("step4")}</p>
            <Field label={t("photos")} hint={t("photosHint")} error={errors.photos}>
              <ImageUploader folder="tradein" max={6} value={photos} onChange={setPhotos} />
            </Field>
            <Field label={t("imei")} htmlFor="ti-imei" hint={t("imeiHint")} error={errors.imeiLast4} className="max-w-xs">
              <Input id="ti-imei" inputMode="numeric" maxLength={4} value={imei} onChange={(ev) => setImei(ev.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
        )}
      </div>

      <aside className="lg:sticky lg:top-36 lg:self-start">
        <div className="card space-y-3 p-5" aria-live="polite">
          <p className="text-sm text-muted">{model.label}</p>
          <p className="text-sm">
            {t("gradeLabel")}: <b>{t(`grade.${e.grade}`)}</b>
          </p>
          {a.locked ? (
            <p className="rounded-[12px] bg-danger/10 p-3 text-sm font-semibold text-danger">{t("lockedWarning")}</p>
          ) : (
            <>
              <p className="text-sm text-muted">{t("estimate")}</p>
              <p className="tabular text-3xl font-extrabold text-primary">{formatUZS(e.value, locale)}</p>
              <p className="text-xs text-muted">{t("estimateHint")}</p>
            </>
          )}
          <FormError message={error} />
          {signedIn ? (
            <Button className="w-full" loading={pending} disabled={a.locked || photos.length < 2} onClick={submit}>
              {photos.length < 2 ? t("addPhotos") : t("submit")}
            </Button>
          ) : (
            <Link href="/auth/login?next=/trade-in" className="flex h-11 w-full items-center justify-center rounded-[12px] bg-primary font-bold text-white">
              {t("signInToSubmit")}
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}

// ── Buyer: answer an offer ───────────────────────────────────────────────

export function TradeInOfferActions({ id }: { id: string }) {
  const t = useTranslations("tradein");
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (accept: boolean) =>
    start(async () => {
      const r = await answerTradeInAction({ id, accept });
      if (!r.ok) return void toast.error(r.error);
      toast.success(accept ? t("accepted") : t("declinedToast"));
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" loading={pending} onClick={() => run(true)}>
        {t("acceptOffer")}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => window.confirm(t("declineConfirm")) && run(false)}>
        {t("declineOffer")}
      </Button>
    </div>
  );
}

// ── Staff: make an offer ─────────────────────────────────────────────────

export function TradeInOfferForm({ id, estimateValue }: { id: string; estimateValue: number }) {
  const t = useTranslations("tradein");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(String(estimateValue));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => {
          setError(null);
          const r = await offerTradeInAction({ id, offeredValue: Number(value), note });
          if (!r.ok) return setError(r.error);
          toast.success(t("offerSent"));
          router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("offerValue")} htmlFor={`to-${id}`} hint={t("estimateWas", { value: formatUZS(estimateValue, locale) })} className="min-w-0 flex-1">
          <Input id={`to-${id}`} type="number" inputMode="numeric" value={value} onChange={(ev) => setValue(ev.target.value)} />
        </Field>
        <Button type="submit" size="sm" loading={pending}>
          {t("sendOffer")}
        </Button>
      </div>
      <Textarea rows={2} maxLength={500} placeholder={t("notePlaceholder")} aria-label={t("notePlaceholder")} value={note} onChange={(ev) => setNote(ev.target.value)} />
      <FormError message={error} />
    </form>
  );
}
