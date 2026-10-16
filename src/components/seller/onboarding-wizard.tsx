"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, Building2, Check, Clock, FileText, Landmark, Loader2, Store, Trash2, Upload, XCircle } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Radio, Select, Textarea } from "@/components/ui/form";
import { ImageUploader, uploadFile } from "@/components/ui/uploader";
import { useToast } from "@/components/ui/toast";
import { addDocumentAction, demoApproveShopAction, removeDocumentAction, saveBankAction, saveLegalAction, saveProfileAction, submitOnboardingAction } from "@/server/actions/seller-onboarding";
import type { OnboardingView } from "@/server/services/seller/onboarding";
import { DOCUMENTS, requiredDocuments, slugify, type LegalType } from "@/lib/seller";
import { REGIONS } from "@/lib/delivery";
import { cn } from "@/lib/cn";

const STEPS = ["legal", "shop", "bank", "documents", "review"] as const;
type Step = (typeof STEPS)[number];

export function OnboardingWizard({ initial, demo, locale }: { initial: OnboardingView | null; demo: boolean; locale: string }) {
  const t = useTranslations("sellerOnboarding");
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [step, setStep] = useState<Step | "intro">(initial ? (initial.status === "PENDING" ? "review" : "legal") : "intro");

  if (v?.status === "PENDING") return <PendingScreen demo={demo} onApproved={() => router.push("/seller")} />;

  if (step === "intro")
    return (
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{t("introTitle")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">{t("introText")}</p>
        <ul className="mt-8 grid gap-3 text-left sm:grid-cols-2">
          {(["free", "commission", "models", "payouts"] as const).map((k) => (
            <li key={k} className="card flex gap-3 p-4">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div>
                <p className="font-bold">{t(`benefits.${k}.title`)}</p>
                <p className="text-sm text-muted">{t(`benefits.${k}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
        <Button size="lg" className="mt-8" onClick={() => setStep("legal")}>
          {t("start")}
        </Button>
      </div>
    );

  const idx = STEPS.indexOf(step);
  const go = (s: Step) => {
    setStep(s);
    router.refresh();
  };
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-extrabold">{t("title")}</h1>
      {v?.status === "REJECTED" && v.moderationNote && (
        <p className="mb-3 flex items-start gap-2 rounded-[12px] bg-danger/10 p-3 text-sm text-danger">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {t("rejected", { note: v.moderationNote })}
        </p>
      )}
      <ol className="mb-6 mt-4 flex gap-1" aria-label={t("progress")}>
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button type="button" disabled={i > idx && !v} onClick={() => setStep(s)} className="block w-full text-left" aria-current={s === step ? "step" : undefined}>
              <span className={cn("block h-1.5 rounded-full", i <= idx ? "bg-primary" : "bg-surface-3")} />
              <span className={cn("mt-1.5 block text-[12px] font-semibold", s === step ? "text-primary" : "text-muted")}>
                {i + 1}. {t(`steps.${s}`)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="card p-5 md:p-6">
        {step === "legal" && <LegalStep v={v} onDone={(patch) => (setV((x) => ({ ...(x ?? emptyView()), ...patch })), go("shop"))} />}
        {step === "shop" && <ShopStep v={v ?? emptyView()} locale={locale} onDone={(patch) => (setV((x) => ({ ...(x ?? emptyView()), ...patch })), go("bank"))} />}
        {step === "bank" && <BankStep v={v ?? emptyView()} onDone={(patch) => (setV((x) => ({ ...(x ?? emptyView()), ...patch })), go("documents"))} />}
        {step === "documents" && <DocumentsStep v={v ?? emptyView()} onChange={(docs) => setV((x) => ({ ...(x ?? emptyView()), documents: docs }))} onDone={() => go("review")} />}
        {step === "review" && <ReviewStep v={v ?? emptyView()} onEdit={setStep} onSubmitted={() => setV((x) => (x ? { ...x, status: "PENDING" } : x))} />}
      </div>
    </div>
  );
}

function emptyView(): OnboardingView {
  return { id: "", status: "DRAFT", moderationNote: null, legalType: null, legalName: "", taxId: "", name: "", slug: "", descriptionUz: "", descriptionRu: "", city: "", region: "toshkent_sh", address: "", logoUrl: null, bankName: "", bankAccountMasked: null, bankMfo: "", documents: [] };
}

function useStepSubmit() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>, onOk: () => void) =>
    start(async () => {
      setErrors({});
      setError(null);
      const res = await fn();
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        return setError(res.error ?? null);
      }
      onOk();
    });
  return { errors, error, pending, run };
}

function LegalStep({ v, onDone }: { v: OnboardingView | null; onDone: (patch: Partial<OnboardingView>) => void }) {
  const t = useTranslations("sellerOnboarding");
  const [legalType, setLegalType] = useState<LegalType>((v?.legalType as LegalType) ?? "INDIVIDUAL_ENTREPRENEUR");
  const [legalName, setLegalName] = useState(v?.legalName ?? "");
  const [taxId, setTaxId] = useState(v?.taxId ?? "");
  const s = useStepSubmit();
  return (
    <div className="space-y-5">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Building2 className="h-5 w-5 text-primary" /> {t("legal.title")}
      </h2>
      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <legend className="sr-only">{t("legal.type")}</legend>
        {(["INDIVIDUAL_ENTREPRENEUR", "SELF_EMPLOYED", "LLC"] as const).map((lt) => (
          <label key={lt} className={cn("cursor-pointer rounded-[14px] border p-3 text-sm", legalType === lt ? "border-primary bg-primary/5" : "border-border hover:bg-surface-2")}>
            <Radio name="legalType" checked={legalType === lt} onChange={() => setLegalType(lt)} label={<span className="font-bold">{t(`legal.types.${lt}`)}</span>} />
            <span className="mt-1 block pl-7 text-[13px] text-muted">{t(`legal.typeHints.${lt}`)}</span>
          </label>
        ))}
      </fieldset>
      <Field label={legalType === "LLC" ? t("legal.companyName") : t("legal.fullName")} htmlFor="ob-lname" error={s.errors.legalName} required>
        <Input id="ob-lname" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder={legalType === "LLC" ? "«Anor Savdo» MChJ" : "Karimov Bekzod Anvarovich"} />
      </Field>
      <Field label={legalType === "SELF_EMPLOYED" ? t("legal.pinfl") : t("legal.stir")} htmlFor="ob-tax" hint={legalType === "SELF_EMPLOYED" ? t("legal.pinflHint") : t("legal.stirHint")} error={s.errors.taxId} required>
        <Input id="ob-tax" inputMode="numeric" value={taxId} onChange={(e) => setTaxId(e.target.value.replace(/[^\d\s]/g, ""))} maxLength={legalType === "SELF_EMPLOYED" ? 17 : 11} />
      </Field>
      <FormError message={s.error} />
      <Button loading={s.pending} onClick={() => s.run(() => saveLegalAction({ legalType, legalName, taxId }), () => onDone({ legalType, legalName, taxId }))}>
        {t("next")}
      </Button>
    </div>
  );
}

function ShopStep({ v, locale, onDone }: { v: OnboardingView; locale: string; onDone: (patch: Partial<OnboardingView>) => void }) {
  const t = useTranslations("sellerOnboarding");
  const [f, setF] = useState({ name: v.name, slug: v.slug, descriptionUz: v.descriptionUz, descriptionRu: v.descriptionRu, region: v.region, city: v.city, address: v.address, logo: v.logoUrl ? [v.logoUrl] : ([] as string[]) });
  const s = useStepSubmit();
  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Store className="h-5 w-5 text-primary" /> {t("shop.title")}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("shop.name")} htmlFor="ob-name" error={s.errors.name} required>
          <Input id="ob-name" value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.slug && f.slug !== slugify(f.name) ? f.slug : slugify(e.target.value) })} />
        </Field>
        <Field label={t("shop.slug")} htmlFor="ob-slug" hint={`anor.uz/shop/${f.slug || "…"}`} error={s.errors.slug}>
          <Input id="ob-slug" value={f.slug} maxLength={48} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} />
        </Field>
      </div>
      <Field label={t("shop.logo")} hint={t("shop.logoHint")}>
        <ImageUploader value={f.logo} onChange={(urls) => setF({ ...f, logo: urls.slice(-1) })} folder="shops" max={1} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("shop.descriptionUz")} htmlFor="ob-duz">
          <Textarea id="ob-duz" rows={3} value={f.descriptionUz} onChange={(e) => setF({ ...f, descriptionUz: e.target.value })} />
        </Field>
        <Field label={t("shop.descriptionRu")} htmlFor="ob-dru">
          <Textarea id="ob-dru" rows={3} value={f.descriptionRu} onChange={(e) => setF({ ...f, descriptionRu: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("shop.region")} htmlFor="ob-region">
          <Select id="ob-region" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
            {REGIONS.map((r) => (
              <option key={r.key} value={r.key}>
                {locale === "ru" ? r.ru : r.uz}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("shop.city")} htmlFor="ob-city" error={s.errors.city} required>
          <Input id="ob-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        </Field>
      </div>
      <Field label={t("shop.address")} htmlFor="ob-addr" hint={t("shop.addressHint")} error={s.errors.address} required>
        <Input id="ob-addr" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
      </Field>
      <FormError message={s.error} />
      <Button
        loading={s.pending}
        onClick={() =>
          s.run(
            () => saveProfileAction({ name: f.name, slug: f.slug, descriptionUz: f.descriptionUz, descriptionRu: f.descriptionRu, region: f.region, city: f.city, address: f.address, logoUrl: f.logo[0] ?? null }),
            () => onDone({ name: f.name, slug: f.slug, descriptionUz: f.descriptionUz, descriptionRu: f.descriptionRu, region: f.region, city: f.city, address: f.address, logoUrl: f.logo[0] ?? null }),
          )
        }
      >
        {t("next")}
      </Button>
    </div>
  );
}

function BankStep({ v, onDone }: { v: OnboardingView; onDone: (patch: Partial<OnboardingView>) => void }) {
  const t = useTranslations("sellerOnboarding");
  const [f, setF] = useState({ bankName: v.bankName, bankAccount: "", bankMfo: v.bankMfo });
  const s = useStepSubmit();
  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Landmark className="h-5 w-5 text-primary" /> {t("bank.title")}
      </h2>
      <p className="text-sm text-muted">{t("bank.text")}</p>
      <Field label={t("bank.name")} htmlFor="ob-bank" error={s.errors.bankName} required>
        <Input id="ob-bank" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} placeholder="Kapitalbank" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
        <Field label={t("bank.account")} htmlFor="ob-acc" hint={v.bankAccountMasked ? t("bank.saved", { masked: v.bankAccountMasked }) : t("bank.accountHint")} error={s.errors.bankAccount} required={!v.bankAccountMasked}>
          <Input id="ob-acc" inputMode="numeric" autoComplete="off" value={f.bankAccount} onChange={(e) => setF({ ...f, bankAccount: e.target.value.replace(/[^\d\s]/g, "") })} maxLength={25} />
        </Field>
        <Field label={t("bank.mfo")} htmlFor="ob-mfo" error={s.errors.bankMfo} required>
          <Input id="ob-mfo" inputMode="numeric" value={f.bankMfo} onChange={(e) => setF({ ...f, bankMfo: e.target.value.replace(/\D/g, "") })} maxLength={5} />
        </Field>
      </div>
      <FormError message={s.error} />
      <Button loading={s.pending} onClick={() => s.run(() => saveBankAction(f), () => onDone({ bankName: f.bankName, bankMfo: f.bankMfo, bankAccountMasked: f.bankAccount ? `•••• ${f.bankAccount.replace(/\s/g, "").slice(-4)}` : v.bankAccountMasked }))}>
        {t("next")}
      </Button>
    </div>
  );
}

function DocumentsStep({ v, onChange, onDone }: { v: OnboardingView; onChange: (docs: OnboardingView["documents"]) => void; onDone: () => void }) {
  const t = useTranslations("sellerOnboarding");
  const te = useTranslations("errors");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const type = (v.legalType ?? "INDIVIDUAL_ENTREPRENEUR") as LegalType;
  const required = requiredDocuments(type);
  const complete = required.every((r) => v.documents.some((d) => d.type === r));
  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <FileText className="h-5 w-5 text-primary" /> {t("documents.title")}
      </h2>
      <p className="text-sm text-muted">{t("documents.text")}</p>
      <ul className="space-y-2">
        {DOCUMENTS[type].map((dt) => {
          const doc = v.documents.find((d) => d.type === dt);
          return (
            <li key={dt} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {t(`documents.types.${dt}`)} {!required.includes(dt) && <span className="text-sm font-normal text-muted">({t("optional")})</span>}
                </p>
                {doc ? <p className="truncate text-sm text-success">✓ {doc.fileName}</p> : <p className="text-sm text-muted">{t("documents.formats")}</p>}
              </div>
              {doc && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("documents.remove")}
                  onClick={async () => {
                    await removeDocumentAction({ id: doc.id });
                    onChange(v.documents.filter((d) => d.id !== doc.id));
                  }}
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              )}
              <label className={cn("inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-border px-3 text-sm font-semibold hover:bg-surface-2", busy === dt && "pointer-events-none opacity-60")}>
                {busy === dt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {doc ? t("documents.replace") : t("documents.upload")}
                <input
                  type="file"
                  hidden
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setBusy(dt);
                    setError(null);
                    try {
                      const up = await uploadFile(file, "document", "documents");
                      const res = await addDocumentAction({ type: dt as "passport", fileUrl: up.url, fileName: file.name });
                      if (!res.ok) setError(res.error);
                      else {
                        onChange([...v.documents.filter((d) => d.type !== dt), { id: crypto.randomUUID(), type: dt, fileName: file.name, status: "PENDING", note: null }]);
                        router.refresh();
                      }
                    } catch (err) {
                      const code = (err as Error).message;
                      setError(te.has(code) ? te(code) : te("generic"));
                    }
                    setBusy(null);
                  }}
                />
              </label>
            </li>
          );
        })}
      </ul>
      <FormError message={error} />
      <Button disabled={!complete} onClick={onDone}>
        {t("next")}
      </Button>
    </div>
  );
}

function ReviewStep({ v, onEdit, onSubmitted }: { v: OnboardingView; onEdit: (s: Step) => void; onSubmitted: () => void }) {
  const t = useTranslations("sellerOnboarding");
  const s = useStepSubmit();
  const rows: Array<[Step, string, string]> = [
    ["legal", t("steps.legal"), `${v.legalType ? t(`legal.types.${v.legalType as LegalType}`) : "—"} · ${v.legalName || "—"} · ${v.taxId || "—"}`],
    ["shop", t("steps.shop"), `${v.name || "—"} · ${v.city || "—"}`],
    ["bank", t("steps.bank"), `${v.bankName || "—"} · ${v.bankAccountMasked ?? "—"} · MFO ${v.bankMfo || "—"}`],
    ["documents", t("steps.documents"), t("documents.count", { count: v.documents.length })],
  ];
  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <BadgeCheck className="h-5 w-5 text-primary" /> {t("review.title")}
      </h2>
      <dl className="divide-y divide-border rounded-[12px] border border-border">
        {rows.map(([k, label, value]) => (
          <div key={k} className="flex items-center gap-3 p-3">
            <dt className="w-32 shrink-0 text-sm font-semibold text-muted">{label}</dt>
            <dd className="min-w-0 flex-1 truncate">{value}</dd>
            <button type="button" onClick={() => onEdit(k)} className="text-sm font-semibold text-primary hover:underline">
              {t("edit")}
            </button>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted">{t("review.terms")}</p>
      <FormError message={s.error} />
      <Button size="lg" loading={s.pending} onClick={() => s.run(() => submitOnboardingAction({}), onSubmitted)}>
        {t("review.submit")}
      </Button>
    </div>
  );
}

function PendingScreen({ demo, onApproved }: { demo: boolean; onApproved: () => void }) {
  const t = useTranslations("sellerOnboarding");
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="card mx-auto max-w-xl space-y-3 p-8 text-center">
      <Clock className="mx-auto h-12 w-12 text-accent" />
      <h1 className="text-2xl font-extrabold">{t("pending.title")}</h1>
      <p className="text-muted">{t("pending.text")}</p>
      {demo && (
        <Button
          variant="accent"
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await demoApproveShopAction({});
              if (!res.ok) return toast.error(res.error);
              toast.success(t("pending.approved"));
              onApproved();
            })
          }
        >
          {t("pending.demoApprove")}
        </Button>
      )}
    </div>
  );
}
