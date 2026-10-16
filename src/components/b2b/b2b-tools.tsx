"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Building2, FileText } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { acceptQuoteAction, declineQuoteAction, requestQuoteAction, respondQuoteAction, saveBusinessAction } from "@/server/actions/b2b";
import { formatUZS } from "@/lib/money";
import { QUOTE_MIN_QTY, QUOTE_VALID_DAYS } from "@/lib/b2b";

// ── Company profile ──────────────────────────────────────────────────────

type Business = { companyName: string; taxId: string; legalAddress: string; bankName: string; bankAccount: string; bankMfo: string };

export function BusinessForm({ initial, onSaved }: { initial: Business; onSaved?: () => void }) {
  const t = useTranslations("b2b");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<Business>) => setF((prev) => ({ ...prev, ...patch }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          setErrors({});
          const res = await saveBusinessAction(f);
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            return setError(res.error);
          }
          toast.success(t("saved"));
          onSaved?.();
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("companyName")} htmlFor="bz-name" error={errors.companyName} required className="sm:col-span-2">
          <Input id="bz-name" autoComplete="organization" maxLength={160} value={f.companyName} onChange={(e) => set({ companyName: e.target.value })} />
        </Field>
        <Field label={t("taxId")} htmlFor="bz-tax" error={errors.taxId} hint={t("taxIdHint")} required>
          <Input id="bz-tax" inputMode="numeric" maxLength={9} value={f.taxId} onChange={(e) => set({ taxId: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("bankMfo")} htmlFor="bz-mfo" error={errors.bankMfo}>
          <Input id="bz-mfo" inputMode="numeric" maxLength={5} value={f.bankMfo} onChange={(e) => set({ bankMfo: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("legalAddress")} htmlFor="bz-addr" error={errors.legalAddress} required className="sm:col-span-2">
          <Input id="bz-addr" autoComplete="street-address" maxLength={240} value={f.legalAddress} onChange={(e) => set({ legalAddress: e.target.value })} />
        </Field>
        <Field label={t("bankName")} htmlFor="bz-bank" error={errors.bankName}>
          <Input id="bz-bank" maxLength={120} value={f.bankName} onChange={(e) => set({ bankName: e.target.value })} />
        </Field>
        <Field label={t("bankAccount")} htmlFor="bz-acc" error={errors.bankAccount} hint={t("bankAccountHint")}>
          <Input id="bz-acc" inputMode="numeric" maxLength={20} value={f.bankAccount} onChange={(e) => set({ bankAccount: e.target.value.replace(/\D/g, "") })} />
        </Field>
      </div>
      <FormError message={error} />
      <Button type="submit" loading={pending}>
        {tc("save")}
      </Button>
    </form>
  );
}

export function EditBusiness({ initial }: { initial: Business }) {
  const t = useTranslations("b2b");
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("edit")}
      </Button>
    );
  return (
    <div className="mt-4 border-t border-border pt-4">
      <BusinessForm initial={initial} onSaved={() => setOpen(false)} />
    </div>
  );
}

// ── Buyer: quote actions ─────────────────────────────────────────────────

export function QuoteActions({ quoteId, state }: { quoteId: string; state: string }) {
  const t = useTranslations("b2b");
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (accept: boolean) =>
    start(async () => {
      const res = accept ? await acceptQuoteAction({ quoteId }) : await declineQuoteAction({ quoteId });
      if (!res.ok) return void toast.error(res.error);
      if (accept) {
        toast.success(t("acceptedToCart"));
        router.push("/cart");
      } else router.refresh();
    });
  if (state !== "OPEN" && state !== "QUOTED") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {state === "QUOTED" && (
        <Button size="sm" loading={pending} onClick={() => run(true)}>
          {t("accept")}
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(false)}>
        {state === "OPEN" ? t("withdraw") : t("decline")}
      </Button>
    </div>
  );
}

// ── Product page: request a quote ────────────────────────────────────────

type QuoteVariant = { id: string; title: string; price: number };

export function QuoteRequestButton({ productId, productSlug, variants, variantId, business }: { productId: string; productSlug: string; variants: QuoteVariant[]; variantId: string; business: "verified" | "none" | "guest" }) {
  const t = useTranslations("b2b");
  const tc = useTranslations("common");
  const locale = useLocale();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ variantId, quantity: String(QUOTE_MIN_QTY * 2), targetPrice: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (business === "guest")
    return (
      <Link href={`/auth/login?next=/p/${productSlug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <FileText className="h-4 w-4" /> {t("requestQuote")}
      </Link>
    );
  if (business === "none")
    return (
      <Link href="/account/business" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <Building2 className="h-4 w-4" /> {t("openBusiness")}
      </Link>
    );
  const v = variants.find((x) => x.id === f.variantId) ?? variants[0];
  const submit = () =>
    start(async () => {
      setError(null);
      setErrors({});
      const res = await requestQuoteAction({ productId, variantId: f.variantId, quantity: Number(f.quantity), targetPrice: f.targetPrice ? Number(f.targetPrice) : null, message: f.message });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        return setError(res.error);
      }
      setOpen(false);
      toast.success(t("requestSent", { number: (res.data as { number: string }).number }), t("requestSentHint"));
    });
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        leftIcon={<FileText className="h-4 w-4" />}
        onClick={() => {
          setF((prev) => ({ ...prev, variantId }));
          setOpen(true);
        }}
      >
        {t("requestQuote")}
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={t("requestQuote")}
          closeLabel={tc("close")}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button loading={pending} onClick={submit}>
                {t("send")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-muted">{t("requestHint", { min: QUOTE_MIN_QTY })}</p>
            {variants.length > 1 && (
              <Field label={t("variant")} htmlFor="qr-v">
                <Select id="qr-v" value={f.variantId} onChange={(e) => setF((prev) => ({ ...prev, variantId: e.target.value }))}>
                  {variants.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title} — {formatUZS(x.price, locale)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("quantity")} htmlFor="qr-q" error={errors.quantity}>
                <Input id="qr-q" type="number" inputMode="numeric" min={QUOTE_MIN_QTY} value={f.quantity} onChange={(e) => setF((prev) => ({ ...prev, quantity: e.target.value }))} />
              </Field>
              <Field label={t("targetPrice")} htmlFor="qr-p" error={errors.targetPrice} hint={t("listPrice", { price: formatUZS(v.price, locale) })}>
                <Input id="qr-p" type="number" inputMode="numeric" min={1} value={f.targetPrice} onChange={(e) => setF((prev) => ({ ...prev, targetPrice: e.target.value }))} />
              </Field>
            </div>
            <Field label={t("message")} htmlFor="qr-m" error={errors.message}>
              <Textarea id="qr-m" rows={3} maxLength={1000} placeholder={t("messagePlaceholder")} value={f.message} onChange={(e) => setF((prev) => ({ ...prev, message: e.target.value }))} />
            </Field>
            <FormError message={error} />
          </div>
        </Dialog>
      )}
    </>
  );
}

// ── Seller: answer a quote ───────────────────────────────────────────────

export function QuoteResponder({ quoteId, listPrice, targetPrice, quantity }: { quoteId: string; listPrice: number; targetPrice: number | null; quantity: number }) {
  const t = useTranslations("b2b");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ price: String(targetPrice ?? Math.round((listPrice * 0.9) / 100) * 100), validDays: "7", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const price = Number(f.price) || 0;
  const send = (decision: "quote" | "decline") =>
    start(async () => {
      setError(null);
      setErrors({});
      const res = decision === "quote" ? await respondQuoteAction({ quoteId, decision, price, validDays: Number(f.validDays), note: f.note }) : await respondQuoteAction({ quoteId, decision, note: f.note });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        if (!open) return void toast.error(res.error);
        return setError(res.error);
      }
      setOpen(false);
      toast.success(decision === "quote" ? t("quoteSent") : t("declined"));
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setOpen(true)}>
        {t("makeOffer")}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => window.confirm(t("declineConfirm")) && send("decline")}>
        {t("decline")}
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={t("makeOffer")}
          closeLabel={tc("close")}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button loading={pending} onClick={() => send("quote")}>
                {t("send")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("unitPrice")} htmlFor="qo-p" error={errors.price} hint={t("listPrice", { price: formatUZS(listPrice, locale) })}>
                <Input id="qo-p" type="number" inputMode="numeric" min={1} value={f.price} onChange={(e) => setF((prev) => ({ ...prev, price: e.target.value }))} />
              </Field>
              <Field label={t("validFor")} htmlFor="qo-d">
                <Select id="qo-d" value={f.validDays} onChange={(e) => setF((prev) => ({ ...prev, validDays: e.target.value }))}>
                  {QUOTE_VALID_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {t("days", { count: d })}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="rounded-[10px] bg-surface-2 p-3 text-sm">
              {t("offerTotal", { qty: quantity, total: formatUZS(price * quantity, locale) })}
              {listPrice > price && price > 0 && <span className="ml-1 text-success">−{Math.round((1 - price / listPrice) * 100)}%</span>}
            </p>
            <Field label={t("note")} htmlFor="qo-n" error={errors.note}>
              <Textarea id="qo-n" rows={3} maxLength={1000} placeholder={t("notePlaceholder")} value={f.note} onChange={(e) => setF((prev) => ({ ...prev, note: e.target.value }))} />
            </Field>
            <FormError message={error} />
          </div>
        </Dialog>
      )}
    </div>
  );
}
