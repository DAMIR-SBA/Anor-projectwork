"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileText, Loader2, Lock, Upload, Warehouse } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { ImageUploader, uploadFile } from "@/components/ui/uploader";
import { addShopDocumentAction, saveWarehouseAction, updateBankAction, updateShopProfileAction } from "@/server/actions/seller-settings";
import type { settingsView } from "@/server/services/seller/settings";
import { REGIONS } from "@/lib/delivery";
import { DOCUMENTS } from "@/lib/seller";
import { fmtDay } from "@/lib/format-date";

type View = Awaited<ReturnType<typeof settingsView>>;
const DOC_TONE = { PENDING: "info", APPROVED: "success", REJECTED: "danger" } as const;

export function ProfileForm({ v }: { v: View }) {
  const t = useTranslations("sellerSettings");
  const router = useRouter();
  const [f, setF] = useState({ name: v.name, descriptionUz: v.descriptionUz, descriptionRu: v.descriptionRu, city: v.city, logo: v.logoUrl ? [v.logoUrl] : [], banner: v.bannerUrl ? [v.bannerUrl] : [] });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateShopProfileAction({ name: f.name, descriptionUz: f.descriptionUz, descriptionRu: f.descriptionRu, city: f.city, logoUrl: f.logo[0] ?? null, bannerUrl: f.banner[0] ?? null });
          setMsg(res.ok ? { ok: true, text: t("saved") } : { ok: false, text: res.error });
          if (res.ok) router.refresh();
        });
      }}
    >
      <h2 className="text-lg font-bold">{t("profile")}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("name")} htmlFor="st-name" required>
          <Input id="st-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} />
        </Field>
        <Field label={t("slug")} htmlFor="st-slug" hint={t("slugHint")}>
          <Input id="st-slug" value={`anor.uz/shop/${v.slug}`} readOnly disabled />
        </Field>
        <Field label={t("city")} htmlFor="st-city">
          <Input id="st-city" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} maxLength={60} />
        </Field>
      </div>
      <Field label={t("descriptionUz")} htmlFor="st-du">
        <Textarea id="st-du" rows={3} value={f.descriptionUz} onChange={(e) => setF({ ...f, descriptionUz: e.target.value })} maxLength={2000} />
      </Field>
      <Field label={t("descriptionRu")} htmlFor="st-dr">
        <Textarea id="st-dr" rows={3} value={f.descriptionRu} onChange={(e) => setF({ ...f, descriptionRu: e.target.value })} maxLength={2000} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-sm font-semibold">{t("logo")}</p>
          <ImageUploader value={f.logo} onChange={(urls) => setF({ ...f, logo: urls.slice(-1) })} folder="shops" max={1} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">{t("banner")}</p>
          <ImageUploader value={f.banner} onChange={(urls) => setF({ ...f, banner: urls.slice(-1) })} folder="shops" max={1} />
        </div>
      </div>
      {msg && (msg.ok ? <FormSuccess message={msg.text} /> : <FormError message={msg.text} />)}
      <Button type="submit" loading={pending}>
        {t("save")}
      </Button>
    </form>
  );
}

export function BankForm({ v }: { v: View }) {
  const t = useTranslations("sellerSettings");
  const router = useRouter();
  const [f, setF] = useState({ bankName: v.bankName, bankAccount: "", bankMfo: v.bankMfo, confirm: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setErrors({});
          const res = await updateBankAction(f);
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            return setMsg({ ok: false, text: res.error });
          }
          setMsg({ ok: true, text: f.bankAccount ? t("bankChanged") : t("saved") });
          setF({ ...f, bankAccount: "", confirm: "" });
          router.refresh();
        });
      }}
    >
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Lock className="h-5 w-5 text-primary" /> {t("bank")}
      </h2>
      <p className="text-sm text-muted">{t("bankHint")}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("bankName")} htmlFor="st-bn">
          <Input id="st-bn" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} />
        </Field>
        <Field label={t("mfo")} htmlFor="st-mfo" error={errors.bankMfo}>
          <Input id="st-mfo" inputMode="numeric" maxLength={5} value={f.bankMfo} onChange={(e) => setF({ ...f, bankMfo: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("account")} htmlFor="st-acc" hint={v.bankAccountMasked ? t("current", { masked: v.bankAccountMasked }) : undefined} error={errors.bankAccount}>
          <Input id="st-acc" inputMode="numeric" maxLength={24} placeholder={t("accountPlaceholder")} value={f.bankAccount} onChange={(e) => setF({ ...f, bankAccount: e.target.value.replace(/[^\d ]/g, "") })} autoComplete="off" />
        </Field>
        {v.confirmWith && (
          <Field label={v.confirmWith === "password" ? t("confirmPassword") : t("confirmPin")} htmlFor="st-confirm" error={errors.confirm}>
            <PasswordInput id="st-confirm" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} autoComplete="current-password" inputMode={v.confirmWith === "pin" ? "numeric" : undefined} />
          </Field>
        )}
      </div>
      <p className="rounded-[10px] bg-accent/15 p-2.5 text-[13px]">{t("holdNotice")}</p>
      {msg && (msg.ok ? <FormSuccess message={msg.text} /> : <FormError message={msg.text} />)}
      <Button type="submit" loading={pending} disabled={!!v.confirmWith && !f.confirm}>
        {t("save")}
      </Button>
    </form>
  );
}

export function DocumentsCard({ v }: { v: View }) {
  const t = useTranslations("sellerSettings");
  const td = useTranslations("sellerOnboarding.documents");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const types = v.legalType ? DOCUMENTS[v.legalType] : [];
  return (
    <section className="card space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{t("documents")}</h2>
        <Badge tone={v.kycLevel >= 2 ? "success" : "info"}>{t("kyc", { level: v.kycLevel })}</Badge>
      </div>
      <p className="text-sm text-muted">
        {v.legalName} · {t("taxId")}: {v.taxId ?? "—"}
        {v.approvedAt && ` · ${t("approvedAt", { date: fmtDay(v.approvedAt, locale) })}`}
      </p>
      <ul className="divide-y divide-border">
        {types.map((dt) => {
          const doc = v.documents.find((d) => d.type === dt);
          return (
            <li key={dt} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
              <FileText className="h-4 w-4 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{td(`types.${dt}`)}</span>
                {doc && <span className="block truncate text-[12px] text-muted">{doc.fileName}</span>}
                {doc?.note && <span className="block text-[12px] text-danger">{doc.note}</span>}
              </span>
              {doc ? <Badge tone={DOC_TONE[doc.status]}>{td(`status.${doc.status}`)}</Badge> : <Badge tone="danger">{t("missing")}</Badge>}
              {doc?.status !== "APPROVED" && (
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] border border-border px-2.5 font-semibold hover:bg-surface-2">
                  {busy === dt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {doc ? td("replace") : td("upload")}
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
                        const res = await addShopDocumentAction({ type: dt, fileUrl: up.url, fileName: file.name });
                        if (!res.ok) setError(res.error);
                        else router.refresh();
                      } catch (err) {
                        const code = (err as Error).message;
                        setError(te.has(code) ? te(code) : te("generic"));
                      }
                      setBusy(null);
                    }}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <FormError message={error} />
    </section>
  );
}

function WarehouseForm({ initial, onDone }: { initial?: View["warehouses"][number]; onDone: () => void }) {
  const t = useTranslations("sellerSettings");
  const locale = useLocale();
  const router = useRouter();
  const [f, setF] = useState({ name: initial?.name ?? "", region: initial?.region ?? "toshkent_sh", city: initial?.city ?? "", address: initial?.address ?? "", isActive: initial?.isActive ?? true });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = initial?.id ?? "new";
  return (
    <form
      className="space-y-3 rounded-[14px] bg-surface-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveWarehouseAction({ ...f, id: initial?.id });
          if (!res.ok) return setError(res.error);
          onDone();
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("whName")} htmlFor={`wh-n-${id}`}>
          <Input id={`wh-n-${id}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={t("region")} htmlFor={`wh-r-${id}`}>
          <Select id={`wh-r-${id}`} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
            {REGIONS.map((r) => (
              <option key={r.key} value={r.key}>
                {locale === "ru" ? r.ru : r.uz}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("city")} htmlFor={`wh-c-${id}`}>
          <Input id={`wh-c-${id}`} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        </Field>
        <Field label={t("address")} htmlFor={`wh-a-${id}`}>
          <Input id={`wh-a-${id}`} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
      </div>
      <Switch checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} label={t("whActive")} />
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          {t("save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

export function WarehousesCard({ v }: { v: View }) {
  const t = useTranslations("sellerSettings");
  const locale = useLocale();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Warehouse className="h-5 w-5 text-primary" /> {t("warehouses")}
        </h2>
        {editing !== "new" && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            {t("addWarehouse")}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted">{t("warehousesHint")}</p>
      <ul className="space-y-2">
        {v.warehouses.map((w) =>
          editing === w.id ? (
            <li key={w.id}>
              <WarehouseForm initial={w} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={w.id} className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {w.name} <code className="ml-1 font-mono text-[12px] text-muted">{w.code}</code>
                </p>
                <p className="text-[13px] text-muted">
                  {REGIONS.find((r) => r.key === w.region)?.[locale === "ru" ? "ru" : "uz"]}, {w.city}, {w.address}
                </p>
              </div>
              {!w.isActive && <Badge>{t("inactive")}</Badge>}
              <Button size="sm" variant="ghost" onClick={() => setEditing(w.id)}>
                {t("edit")}
              </Button>
            </li>
          ),
        )}
      </ul>
      {editing === "new" && <WarehouseForm onDone={() => setEditing(null)} />}
    </section>
  );
}
