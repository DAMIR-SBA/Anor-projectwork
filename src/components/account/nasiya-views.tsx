"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CreditCard, Wallet } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, Radio, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { applyNasiyaAction, repayAction } from "@/server/actions/nasiya";
import { EMPLOYMENT } from "@/lib/nasiya";
import { isPlanEligible, quote, type Plan } from "@/lib/installment";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";

// ── Application ──────────────────────────────────────────────────────────

export function NasiyaApplyForm({ defaultName }: { defaultName: string }) {
  const t = useTranslations("nasiya");
  const router = useRouter();
  const [f, setF] = useState({ fullName: defaultName, passport: "", pinfl: "", birthDate: "", monthlyIncome: "", employment: "employed" as (typeof EMPLOYMENT)[number], consent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Functional update: autofill and fast typing fire several changes before a re-render.
  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          setErrors({});
          const res = await applyNasiyaAction({ ...f, monthlyIncome: Number(f.monthlyIncome.replace(/\D/g, "")) || 0, consent: f.consent as true });
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            return setError(res.error);
          }
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("form.fullName")} htmlFor="na-name" error={errors.fullName}>
          <Input id="na-name" autoComplete="name" value={f.fullName} onChange={(e) => set({ fullName: e.target.value })} />
        </Field>
        <Field label={t("form.birthDate")} htmlFor="na-birth" error={errors.birthDate}>
          <Input id="na-birth" type="date" value={f.birthDate} onChange={(e) => set({ birthDate: e.target.value })} />
        </Field>
        <Field label={t("form.passport")} htmlFor="na-pass" error={errors.passport} hint={t("form.passportHint")}>
          <Input id="na-pass" autoComplete="off" maxLength={11} placeholder="AB1234567" value={f.passport} onChange={(e) => set({ passport: e.target.value.toUpperCase() })} />
        </Field>
        <Field label={t("form.pinfl")} htmlFor="na-pinfl" error={errors.pinfl} hint={t("form.pinflHint")}>
          <Input id="na-pinfl" inputMode="numeric" autoComplete="off" maxLength={14} value={f.pinfl} onChange={(e) => set({ pinfl: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label={t("form.income")} htmlFor="na-income" error={errors.monthlyIncome}>
          <Input id="na-income" inputMode="numeric" value={f.monthlyIncome} onChange={(e) => set({ monthlyIncome: e.target.value.replace(/[^\d ]/g, "") })} placeholder="5 000 000" />
        </Field>
        <Field label={t("form.employment")} htmlFor="na-emp">
          <Select id="na-emp" value={f.employment} onChange={(e) => set({ employment: e.target.value as typeof f.employment })}>
            {EMPLOYMENT.map((k) => (
              <option key={k} value={k}>
                {t(`employment.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Checkbox checked={f.consent} onChange={(e) => set({ consent: e.target.checked })} label={t("form.consent")} />
      <p className="text-[13px] text-muted">{t("form.privacy")}</p>
      <FormError message={error} />
      <Button type="submit" loading={pending} disabled={!f.consent}>
        {t("form.submit")}
      </Button>
    </form>
  );
}

// ── Repayment ────────────────────────────────────────────────────────────

type Card = { id: string; brand: string; last4: string; provider: string };
const ONLINE = ["CLICK", "PAYME", "UZCARD", "HUMO", "CARD"] as const;

export function RepayButton({ contractId, mode, amount, label, variant = "secondary", walletBalance, cards }: { contractId: string; mode: "next" | "overdue" | "payoff"; amount: number; label: string; variant?: "primary" | "secondary"; walletBalance: number; cards: Card[] }) {
  const t = useTranslations("nasiya");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<string>(walletBalance >= amount ? "WALLET" : "CLICK");
  const [cardId, setCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fmt = (v: number) => formatUZS(v, locale);

  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={t("repay.title", { amount: fmt(amount) })}
          closeLabel={tc("close")}
          footer={
            <Button
              loading={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await repayAction({ contractId, mode, method: method as "WALLET", savedCardId: cardId });
                  if (!res.ok) return setError(res.error);
                  const d = res.data as { paid: boolean; redirectUrl: string | null };
                  if (d.redirectUrl) return router.push(d.redirectUrl);
                  toast.success(t("repay.done"));
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {t("repay.pay", { amount: fmt(amount) })}
            </Button>
          }
        >
          <div className="space-y-2" role="radiogroup" aria-label={t("repay.method")}>
            <Radio name="repay-method" checked={method === "WALLET"} disabled={walletBalance < amount} onChange={() => (setMethod("WALLET"), setCardId(null))} label={<span className="flex items-center gap-2"><Wallet className="h-4 w-4" /> {t("repay.wallet", { amount: fmt(walletBalance) })}</span>} />
            {cards.map((c) => (
              <Radio key={c.id} name="repay-method" checked={cardId === c.id} onChange={() => (setMethod(c.provider), setCardId(c.id))} label={<span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> {c.brand} •••• {c.last4}</span>} />
            ))}
            {ONLINE.map((m) => (
              <Radio key={m} name="repay-method" checked={method === m && !cardId} onChange={() => (setMethod(m), setCardId(null))} label={t(`repay.methods.${m}`)} />
            ))}
          </div>
          {mode === "payoff" && <p className="mt-3 rounded-[10px] bg-success/10 p-2 text-sm text-success">{t("repay.payoffNote")}</p>}
          <FormError message={error} />
        </Dialog>
      )}
    </>
  );
}

// ── Calculator (public landing) ──────────────────────────────────────────

export function NasiyaCalculator({ plans }: { plans: Plan[] }) {
  const t = useTranslations("nasiya");
  const locale = useLocale();
  const [price, setPrice] = useState(6_000_000);
  const [months, setMonths] = useState(plans.at(-1)?.months ?? 12);
  const eligible = plans.filter((p) => isPlanEligible(price, p));
  const plan = eligible.find((p) => p.months === months) ?? eligible.at(-1) ?? null;
  const q = plan ? quote(price, plan) : null;
  return (
    <div className="card space-y-4 p-5">
      <h2 className="text-lg font-bold">{t("calc.title")}</h2>
      <Field label={t("calc.price", { amount: formatUZS(price, locale) })} htmlFor="calc-price">
        <input id="calc-price" type="range" min={300_000} max={30_000_000} step={100_000} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-full accent-[#C8102E]" />
      </Field>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t("calc.months")}>
        {plans.map((p) => {
          const ok = isPlanEligible(price, p);
          return (
            <button key={p.months} type="button" role="radio" aria-checked={plan?.months === p.months} disabled={!ok} onClick={() => setMonths(p.months)} className={cn("rounded-[12px] py-2 text-sm font-bold", plan?.months === p.months ? "bg-[#1A1A1F] text-white" : "bg-surface-2", !ok && "opacity-40")}>
              {t("calc.monthsN", { n: p.months })}
            </button>
          );
        })}
      </div>
      {q ? (
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted">{t("calc.monthly")}</dt>
          <dd className="tabular text-right text-xl font-extrabold text-primary">{formatUZS(q.monthly, locale)}</dd>
          <dt className="text-muted">{t("calc.markup", { pct: Math.round(plan!.markupPercent * 100) })}</dt>
          <dd className="tabular text-right">{formatUZS(q.markup, locale)}</dd>
          <dt className="text-muted">{t("calc.total")}</dt>
          <dd className="tabular text-right font-semibold">{formatUZS(q.total, locale)}</dd>
          <dt className="text-muted">{t("calc.downPayment")}</dt>
          <dd className="tabular text-right font-semibold">0</dd>
        </dl>
      ) : (
        <p className="text-sm text-muted">{t("calc.none")}</p>
      )}
    </div>
  );
}
