"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowUpRight, CreditCard, Gift, QrCode, Smartphone, Trash2, Wifi, Zap, Send } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { Tabs } from "@/components/ui/interactive";
import { topupAction, servicePaymentAction, transferAction, redeemGiftCardAction, removeCardAction } from "@/server/actions/wallet";
import { SERVICE_PROVIDERS } from "@/lib/services";
import { formatUZS, groupDigits } from "@/lib/money";
import { fmtDateTime, fmtDay } from "@/lib/format-date";
import { cn } from "@/lib/cn";
import { AnorLogo } from "@/components/brand/AnorLogo";

type Tx = { id: string; type: string; amount: number; description: string | null; createdAt: string };
type Bonus = { id: string; amount: number; reason: string; expiresAt: string | null; createdAt: string; remaining: number };
type Card = { id: string; brand: string; last4: string; provider: string; exp: string };

export function WalletView({ balance, txs, cards, bonusBalance, bonuses }: { balance: number; txs: Tx[]; cards: Card[]; bonusBalance: number; bonuses: Bonus[] }) {
  const t = useTranslations("wallet");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const fmt = (v: number) => formatUZS(v, locale);

  const [amount, setAmount] = useState(100_000);
  const [method, setMethod] = useState<"CLICK" | "PAYME" | "UZCARD" | "HUMO" | "CARD">("CLICK");
  const [cardId, setCardId] = useState<string>("");

  const run = (fn: () => Promise<{ ok: boolean; data?: unknown; error?: string; fieldErrors?: Record<string, string> }>, success?: (d: unknown) => string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(Object.values(r.fieldErrors ?? {})[0] ?? r.error ?? "");
      const redirect = (r.data as { redirectUrl?: string } | undefined)?.redirectUrl;
      if (redirect) return router.push(redirect);
      if (success) toast.success(success(r.data));
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-primary to-primary-dark p-6 text-white shadow-[var(--shadow-lift)]">
          <AnorLogo tone="white" height={26} />
          <p className="mt-6 text-sm text-white/75">{t("balance")}</p>
          <p className="tabular text-4xl font-extrabold">{fmt(balance)}</p>
          <span aria-hidden className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-white/10" />
          <span aria-hidden className="absolute bottom-6 right-24 h-6 w-6 rounded-full bg-accent" />
        </div>
        <div className="card space-y-3 p-5">
          <h2 className="font-bold">{t("topup")}</h2>
          <div className="flex flex-wrap gap-2">
            {[50_000, 100_000, 200_000, 500_000].map((v) => (
              <button key={v} type="button" onClick={() => setAmount(v)} className={cn("rounded-full px-3 py-1.5 text-sm font-bold", amount === v ? "bg-[#1A1A1F] text-white" : "bg-surface-3")}>
                {groupDigits(v)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input inputMode="numeric" value={groupDigits(amount)} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)} aria-label={t("topupAmount")} />
            <Select value={cardId || method} onChange={(e) => (cards.some((c) => c.id === e.target.value) ? (setCardId(e.target.value), setMethod(cards.find((c) => c.id === e.target.value)!.provider as "CARD")) : (setCardId(""), setMethod(e.target.value as "CLICK")))} aria-label={t("topupVia")}>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.brand} •••• {c.last4}
                </option>
              ))}
              {["CLICK", "PAYME", "UZCARD", "HUMO", "CARD"].map((m) => (
                <option key={m} value={m}>
                  {m === "CARD" ? "Visa / Mastercard" : m.charAt(0) + m.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </div>
          <Button className="w-full" loading={pending} onClick={() => run(() => topupAction({ amount, method, savedCardId: cardId || undefined }), () => t("topup"))}>
            {t("topup")}: {fmt(amount)}
          </Button>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-2 font-bold">{t("services")}</h2>
        <Tabs
          tabs={[
            { key: "MOBILE", label: <span className="flex items-center gap-1.5"><Smartphone className="h-4 w-4" />{t("serviceTypes.MOBILE")}</span>, content: <ServiceForm category="MOBILE" run={run} pending={pending} /> },
            { key: "INTERNET", label: <span className="flex items-center gap-1.5"><Wifi className="h-4 w-4" />{t("serviceTypes.INTERNET")}</span>, content: <ServiceForm category="INTERNET" run={run} pending={pending} /> },
            { key: "UTILITIES", label: <span className="flex items-center gap-1.5"><Zap className="h-4 w-4" />{t("serviceTypes.UTILITIES")}</span>, content: <ServiceForm category="UTILITIES" run={run} pending={pending} /> },
            { key: "TRANSFER", label: <span className="flex items-center gap-1.5"><Send className="h-4 w-4" />{t("serviceTypes.TRANSFER")}</span>, content: <TransferForm run={run} pending={pending} /> },
            { key: "QR", label: <span className="flex items-center gap-1.5"><QrCode className="h-4 w-4" />{t("serviceTypes.QR")}</span>, content: <ServiceForm category="QR" run={run} pending={pending} /> },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-bold">{t("history")}</h2>
          {txs.length === 0 ? (
            <p className="text-sm text-muted">{t("empty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {txs.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", x.amount > 0 ? "bg-success/12 text-success" : "bg-surface-3")}>{x.amount > 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{t(`types.${x.type}` as "types.TOPUP")}</p>
                    <p className="truncate text-xs text-muted">
                      {x.description} · {fmtDateTime(x.createdAt, locale)}
                    </p>
                  </div>
                  <span className={cn("tabular font-bold", x.amount > 0 && "text-success")}>
                    {x.amount > 0 ? "+" : "−"}
                    {groupDigits(Math.abs(x.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="mb-1 font-bold">{t("bonus")}</h2>
            <p className="tabular text-2xl font-extrabold">{t("bonusBalance", { amount: groupDigits(bonusBalance) })}</p>
            <p className="mb-3 text-xs text-muted">{t("bonusHint")}</p>
            <ul className="max-h-60 divide-y divide-border overflow-y-auto text-sm" tabIndex={0}>
              {bonuses.map((b) => (
                <li key={b.id} className="flex justify-between gap-2 py-2">
                  <span>
                    {t(`bonusReasons.${b.reason}` as "bonusReasons.CASHBACK")}
                    {b.expiresAt && b.remaining > 0 && <span className="block text-xs text-muted">{t("expires", { date: fmtDay(b.expiresAt, locale) })}</span>}
                  </span>
                  <span className={cn("tabular font-semibold", b.amount > 0 ? "text-success" : "text-muted")}>
                    {b.amount > 0 ? "+" : ""}
                    {groupDigits(b.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-5">
            <h2 className="mb-3 font-bold">{t("cards")}</h2>
            {cards.length === 0 ? (
              <p className="text-sm text-muted">{t("noCards")}</p>
            ) : (
              <ul className="space-y-2">
                {cards.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-[12px] bg-surface-2 p-3 text-sm">
                    <CreditCard className="h-5 w-5" />
                    <span className="flex-1 font-semibold">
                      {c.brand} •••• {c.last4} <span className="font-normal text-muted">{c.exp}</span>
                    </span>
                    <button type="button" onClick={() => run(() => removeCardAction({ id: c.id }))} className="text-danger" aria-label={t("removeCard")}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <GiftRedeem onRedeem={(code) => run(() => redeemGiftCardAction({ code }), (d) => t("redeemed", { amount: fmt((d as { amount: number }).amount) }))} pending={pending} />
        </div>
      </div>
    </div>
  );
}

type Runner = (fn: () => Promise<{ ok: boolean; data?: unknown; error?: string; fieldErrors?: Record<string, string> }>, success?: (d: unknown) => string) => void;

function ServiceForm({ category, run, pending }: { category: "MOBILE" | "INTERNET" | "UTILITIES" | "QR"; run: Runner; pending: boolean }) {
    const t = useTranslations("wallet");
    const [provider, setProvider] = useState(SERVICE_PROVIDERS[category][0]);
    const [account, setAccount] = useState("");
    const [sum, setSum] = useState("");
    return (
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => servicePaymentAction({ category, provider, account, amount: Number(sum.replace(/\D/g, "")) }), (d) => t("paid", { receipt: (d as { receiptNo: string }).receiptNo }));
        }}
      >
        {category !== "QR" ? (
          <Field label={t("provider")} htmlFor={`p-${category}`}>
            <Select id={`p-${category}`} value={provider} onChange={(e) => setProvider(e.target.value)}>
              {SERVICE_PROVIDERS[category].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label={category === "QR" ? t("qrPayload") : t("account")} htmlFor={`a-${category}`} className={category === "QR" ? "sm:col-span-2" : ""}>
          <Input id={`a-${category}`} value={account} onChange={(e) => setAccount(e.target.value)} placeholder={category === "MOBILE" ? "+998 90 123 45 67" : category === "QR" ? "anor://pay?merchant=..." : ""} required />
        </Field>
        <Field label={t("topupAmount")} htmlFor={`s-${category}`}>
          <Input id={`s-${category}`} inputMode="numeric" value={sum} onChange={(e) => setSum(e.target.value)} placeholder="50 000" required />
        </Field>
        <Button type="submit" loading={pending} className="sm:col-span-3">
          {t("pay")}
        </Button>
      </form>
    );
  }

function TransferForm({ run, pending }: { run: Runner; pending: boolean }) {
    const t = useTranslations("wallet");
    const [to, setTo] = useState("");
    const [sum, setSum] = useState("");
    return (
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => transferAction({ to, amount: Number(sum.replace(/\D/g, "")) }), (d) => t("paid", { receipt: (d as { receiptNo: string }).receiptNo }));
        }}
      >
        <Field label={t("transferTo")} htmlFor="tr-to">
          <Input id="tr-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="anor_ali07" required />
        </Field>
        <Field label={t("topupAmount")} htmlFor="tr-sum">
          <Input id="tr-sum" inputMode="numeric" value={sum} onChange={(e) => setSum(e.target.value)} required />
        </Field>
        <Button type="submit" loading={pending} className="sm:col-span-2" leftIcon={<Send className="h-4 w-4" />}>
          {t("pay")}
        </Button>
      </form>
    );
  }

function GiftRedeem({ onRedeem, pending }: { onRedeem: (code: string) => void; pending: boolean }) {
  const t = useTranslations("wallet");
  const [code, setCode] = useState("");
  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onRedeem(code);
      }}
    >
      <h2 className="flex items-center gap-2 font-bold">
        <Gift className="h-5 w-5 text-primary" /> {t("redeemGift")}
      </h2>
      <div className="flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-EFGH-JKLM-NPQR" className="uppercase tracking-wider" aria-label={t("giftCode")} />
        <Button type="submit" variant="secondary" loading={pending}>
          OK
        </Button>
      </div>
    </form>
  );
}
