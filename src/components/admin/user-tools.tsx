"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { adjustWalletAction, saveNasiyaAction } from "@/server/actions/admin-risk";
import { decideApplicationAction } from "@/server/actions/nasiya";

/** Credit (+) or debit (−) the buyer's Anor Hamyon with a mandatory reason. */
export function WalletAdjust({ userId }: { userId: string }) {
  const t = useTranslations("adminUsers");
  const router = useRouter();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = Number(amount);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await adjustWalletAction({ id: userId, amount: n, reason });
          if (!res.ok) return setError(res.error);
          toast.success(t("adjusted"));
          setAmount("");
          setReason("");
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-[120px_1fr] gap-2">
        <Field label={t("amount")} htmlFor="wa-amount" hint={t("amountHint")}>
          <Input id="wa-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ""))} placeholder="-25000" />
        </Field>
        <Field label={t("reason")} htmlFor="wa-reason">
          <Input id="wa-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <FormError message={error} />
      <Button type="submit" size="sm" loading={pending} disabled={!n || reason.trim().length < 3}>
        {t("adjust")}
      </Button>
    </form>
  );
}

type Plan = { id: string; months: number; markupPercent: number; minPrice: number; maxPrice: number; isActive: boolean };
type Nasiya = { defaultLimit: number; maxLimit: number; minMonthlyIncome: number; minAgeYears: number; maxActiveContracts: number; incomeMultiplier: number };

/** Nasiya plans (markup, price range) and scoring limits used by the application flow. */
export function NasiyaForm({ settings, plans }: { settings: Nasiya; plans: Plan[] }) {
  const t = useTranslations("adminNasiya");
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState(() => Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, String(v)])) as Record<keyof Nasiya, string>);
  const [p, setP] = useState(() => plans.map((x) => ({ ...x, markup: String(+(x.markupPercent * 100).toFixed(2)), min: String(x.minPrice), max: String(x.maxPrice) })));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const num = (v: string) => Number(v) || 0;
  const field = (k: keyof Nasiya, hint?: string) => (
    <Field label={t(`fields.${k}`)} htmlFor={`ns-${k}`} hint={hint}>
      <Input id={`ns-${k}`} inputMode="decimal" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value.replace(/[^\d.]/g, "") })} />
    </Field>
  );
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await saveNasiyaAction({
            settings: { defaultLimit: num(s.defaultLimit), maxLimit: num(s.maxLimit), minMonthlyIncome: num(s.minMonthlyIncome), minAgeYears: num(s.minAgeYears), maxActiveContracts: num(s.maxActiveContracts), incomeMultiplier: num(s.incomeMultiplier) },
            plans: p.map((x) => ({ id: x.id, markupPercent: num(x.markup) / 100, minPrice: num(x.min), maxPrice: num(x.max), isActive: x.isActive })),
          });
          if (!res.ok) return setError(res.error);
          toast.success(t("saved"));
          router.refresh();
        });
      }}
    >
      <section className="card space-y-3 p-5">
        <h2 className="font-bold">{t("plans")}</h2>
        <div tabIndex={0} className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2">{t("months")}</th>
                <th className="py-1.5 pr-2">{t("markup")}</th>
                <th className="py-1.5 pr-2">{t("minPrice")}</th>
                <th className="py-1.5 pr-2">{t("maxPrice")}</th>
                <th className="py-1.5">{t("active")}</th>
              </tr>
            </thead>
            <tbody>
              {p.map((x, i) => (
                <tr key={x.id}>
                  <td className="py-1.5 pr-2 font-bold">{x.months}</td>
                  {(["markup", "min", "max"] as const).map((k) => (
                    <td key={k} className="py-1.5 pr-2">
                      <input aria-label={`${t(k === "markup" ? "markup" : k === "min" ? "minPrice" : "maxPrice")} ${x.months}`} inputMode="decimal" value={x[k]} onChange={(e) => setP((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value.replace(/[^\d.]/g, "") } : r)))} className="h-9 w-32 rounded-[8px] border border-border bg-surface px-2" />
                    </td>
                  ))}
                  <td className="py-1.5">
                    <input type="checkbox" aria-label={`${t("active")} ${x.months}`} checked={x.isActive} onChange={(e) => setP((rows) => rows.map((r, j) => (j === i ? { ...r, isActive: e.target.checked } : r)))} className="h-4 w-4 accent-[#C8102E]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted">{t("markupHint")}</p>
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="font-bold">{t("scoring")}</h2>
        <p className="text-sm text-muted">{t("scoringHint")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {field("defaultLimit")}
          {field("maxLimit")}
          {field("incomeMultiplier", t("multiplierHint"))}
          {field("minMonthlyIncome")}
          {field("minAgeYears")}
          {field("maxActiveContracts")}
        </div>
      </section>
      <FormError message={error} />
      <Button type="submit" loading={pending}>
        {t("save")}
      </Button>
    </form>
  );
}

/** Manual decision on a borderline Nasiya application: approve with a limit, or reject. */
export function ApplicationDecision({ id, suggested }: { id: string; suggested: number }) {
  const t = useTranslations("adminNasiya");
  const router = useRouter();
  const toast = useToast();
  const [limit, setLimit] = useState(String(suggested));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      setError(null);
      const res = await decideApplicationAction({ id, approve, limit: Number(limit.replace(/\D/g, "")) || 0 });
      if (!res.ok) return setError(res.error);
      toast.success(approve ? t("approved") : t("rejected"));
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={t("limit")} htmlFor={`lim-${id}`} className="w-40">
        <Input id={`lim-${id}`} inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d ]/g, ""))} />
      </Field>
      <Button size="sm" variant="success" loading={pending} onClick={() => decide(true)}>
        {t("approve")}
      </Button>
      <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => decide(false)}>
        {t("reject")}
      </Button>
      <FormError message={error} />
    </div>
  );
}
