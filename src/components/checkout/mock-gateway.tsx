"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock, ShieldCheck } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { mockGatewayAction } from "@/server/actions/checkout";
import { formatUZS } from "@/lib/money";

type P = { id: string; amount: number; status: string; purpose: string; groupId: string | null; provider: string; card: string | null };

function after(p: P) {
  if (p.purpose === "ORDER" && p.groupId) return `/checkout/success/${p.groupId}`;
  if (p.purpose === "WALLET_TOPUP") return "/account/wallet";
  if (p.purpose === "GIFT_CARD") return "/account/gift-cards";
  if (p.purpose === "SUBSCRIPTION") return "/account/plus";
  if (p.purpose === "INSTALLMENT") return "/account/nasiya";
  return "/account";
}

export function MockGateway({ payment, testModeLabel }: { payment: P; testModeLabel: string }) {
  const t = useTranslations("pay");
  const locale = useLocale();
  const router = useRouter();
  const [pan, setPan] = useState("8600 1234 5678 9012");
  const [exp, setExp] = useState("12/29");
  const [code, setCode] = useState("");
  const [save, setSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (payment.status !== "PENDING") {
    return (
      <div className="card space-y-4 p-6 text-center">
        <p className="font-bold">{t("already")}</p>
        <Button onClick={() => router.push(after(payment))}>OK</Button>
      </div>
    );
  }

  const submit = (outcome: "success" | "fail") =>
    start(async () => {
      setError(null);
      const r = await mockGatewayAction({ paymentId: payment.id, outcome, cardNumber: pan, expiry: exp, code, saveCard: save });
      if (!r.ok) return setError(r.fieldErrors?.code ?? r.fieldErrors?.cardNumber ?? r.error);
      router.push(after(payment));
    });

  return (
    <div className="card overflow-hidden">
      <div className="bg-[#1A1A1F] px-6 py-5 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-white/60">{payment.provider}</p>
        <p className="mt-1 text-sm text-white/90">{t("amount")}</p>
        <p className="tabular text-3xl font-extrabold">{formatUZS(payment.amount, locale)}</p>
        <p className="mt-1 text-xs text-white/60">{t("merchant")}</p>
      </div>
      <div className="space-y-4 p-6">
        <p className="rounded-[10px] bg-accent-50 px-3 py-2 text-xs font-semibold text-[#7a5600] dark:bg-accent/10 dark:text-accent">{testModeLabel}</p>
        <FormError message={error} />
        {payment.card ? (
          <p className="rounded-[12px] bg-surface-2 p-3 font-semibold">{payment.card}</p>
        ) : (
          <>
            <Field label={t("cardNumber")} htmlFor="pan">
              <Input id="pan" inputMode="numeric" autoComplete="cc-number" value={pan} onChange={(e) => setPan(e.target.value)} className="tabular tracking-wider" />
            </Field>
            <Field label={t("expiry")} htmlFor="exp">
              <Input id="exp" autoComplete="cc-exp" value={exp} onChange={(e) => setExp(e.target.value)} className="w-28" />
            </Field>
          </>
        )}
        <Field label={t("smsCode")} htmlFor="otp">
          <Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        {!payment.card && <Checkbox checked={save} onChange={(e) => setSave(e.target.checked)} label={t("saveCard")} />}
        <Button size="lg" className="w-full" loading={pending} onClick={() => submit("success")} leftIcon={<Lock className="h-4 w-4" />}>
          {t("pay")}
        </Button>
        <Button variant="ghost" className="w-full" disabled={pending} onClick={() => submit("fail")}>
          {t("decline")}
        </Button>
        <p className="flex items-center justify-center gap-1 text-xs text-muted">
          <ShieldCheck className="h-3.5 w-3.5" /> PCI DSS · 3-D Secure
        </p>
      </div>
    </div>
  );
}
