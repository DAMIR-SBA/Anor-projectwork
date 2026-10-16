"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Crown, CreditCard, Wallet } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { FormError, Radio } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { plusAutoRenewAction, subscribePlusAction } from "@/server/actions/plus";
import { annualSavingPct, PLUS_PLANS, type PlusPlan } from "@/lib/plus";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";

type Card = { id: string; brand: string; last4: string; provider: string };
const ONLINE = ["CLICK", "PAYME", "UZCARD", "HUMO", "CARD"] as const;

/** Plan picker + payment method; signed-out visitors are sent to log in first. */
export function PlusSubscribe({ signedIn, walletBalance, cards }: { signedIn: boolean; walletBalance: number; cards: Card[] }) {
  const t = useTranslations("plus");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [plan, setPlan] = useState<PlusPlan>("PLUS_ANNUAL");
  const [method, setMethod] = useState<string>("CLICK");
  const [cardId, setCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const price = PLUS_PLANS[plan].price;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("plan")}>
        {(Object.keys(PLUS_PLANS) as PlusPlan[]).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={plan === p} onClick={() => setPlan(p)} className={cn("rounded-[16px] border-2 p-4 text-left", plan === p ? "border-accent bg-accent-50 dark:bg-accent/10" : "border-border bg-surface")}>
            <span className="flex items-center justify-between gap-2">
              <span className="font-bold">{t(`plans.${p}`)}</span>
              {p === "PLUS_ANNUAL" && <span className="rounded-full bg-success px-2 py-0.5 text-xs font-bold text-white">−{annualSavingPct()}%</span>}
            </span>
            <span className="tabular mt-1 block text-2xl font-extrabold">{formatUZS(PLUS_PLANS[p].price, locale)}</span>
            <span className="text-sm text-muted">{p === "PLUS_ANNUAL" ? t("perMonthEq", { amount: formatUZS(Math.round(PLUS_PLANS[p].price / 12 / 100) * 100, locale) }) : t("perMonth")}</span>
          </button>
        ))}
      </div>
      {signedIn && (
        <div className="space-y-2" role="radiogroup" aria-label={t("method")}>
          <Radio name="plus-method" checked={method === "WALLET"} disabled={walletBalance < price} onChange={() => (setMethod("WALLET"), setCardId(null))} label={<span className="flex items-center gap-2"><Wallet className="h-4 w-4" /> {t("wallet", { amount: formatUZS(walletBalance, locale) })}</span>} />
          {cards.map((c) => (
            <Radio key={c.id} name="plus-method" checked={cardId === c.id} onChange={() => (setMethod(c.provider), setCardId(c.id))} label={<span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> {c.brand} •••• {c.last4}</span>} />
          ))}
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ONLINE.map((m) => (
              <Radio key={m} name="plus-method" checked={method === m && !cardId} onChange={() => (setMethod(m), setCardId(null))} label={t(`methods.${m}`)} />
            ))}
          </div>
        </div>
      )}
      <FormError message={error} />
      <Button
        size="lg"
        className="w-full bg-accent text-[#1A1A1F] hover:bg-accent/90"
        loading={pending}
        leftIcon={<Crown className="h-5 w-5" />}
        onClick={() => {
          if (!signedIn) return router.push(`/auth/login?next=${encodeURIComponent("/plus")}`);
          start(async () => {
            setError(null);
            const res = await subscribePlusAction({ plan, method: method as "WALLET", savedCardId: cardId });
            if (!res.ok) return setError(res.error);
            const d = res.data as { redirectUrl: string | null };
            if (d.redirectUrl) return router.push(d.redirectUrl);
            toast.success(t("welcome"));
            router.push("/account/plus");
            router.refresh();
          });
        }}
      >
        {t("subscribe", { amount: formatUZS(price, locale) })}
      </Button>
      <p className="text-center text-xs text-muted">{t("terms")}</p>
    </div>
  );
}

export function PlusAutoRenew({ on }: { on: boolean }) {
  const t = useTranslations("plus");
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={on ? "ghost" : "primary"}
      className={on ? "text-danger" : undefined}
      loading={pending}
      onClick={() => {
        if (on && !window.confirm(t("cancelConfirm"))) return;
        start(async () => {
          const res = await plusAutoRenewAction({ on: !on });
          if (!res.ok) return void toast.error(res.error ?? "");
          toast.success(on ? t("cancelled") : t("resumed"));
          router.refresh();
        });
      }}
    >
      {on ? t("cancel") : t("resume")}
    </Button>
  );
}
