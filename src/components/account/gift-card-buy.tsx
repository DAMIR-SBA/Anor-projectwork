"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { buyGiftCardAction } from "@/server/actions/wallet";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";
import { AnorLogo } from "@/components/brand/AnorLogo";

const AMOUNTS = [100_000, 250_000, 500_000, 1_000_000] as const;
const DESIGNS = { pomegranate: "from-primary to-primary-dark", navruz: "from-[#1FA463] to-[#0E6E6E]", birthday: "from-[#F5B301] to-[#E26D5C]" } as const;

export function GiftCardBuy({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("giftcards");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [amount, setAmount] = useState<(typeof AMOUNTS)[number]>(250_000);
  const [design, setDesign] = useState<keyof typeof DESIGNS>("pomegranate");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [method, setMethod] = useState<"CLICK" | "PAYME" | "UZCARD" | "HUMO" | "CARD">("CLICK");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className={cn("relative aspect-[1.6] overflow-hidden rounded-[24px] bg-gradient-to-br p-6 text-white shadow-[var(--shadow-lift)]", DESIGNS[design])}>
        <AnorLogo tone="white" height={30} />
        <p className="absolute bottom-6 left-6 text-4xl font-extrabold">{formatUZS(amount, locale)}</p>
        {name && <p className="absolute right-6 top-6 text-sm font-semibold">→ {name}</p>}
        <span aria-hidden className="absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-white/10" />
      </div>
      <div className="card space-y-3 p-5">
        <Field label={t("amount")}>
          <div className="grid grid-cols-4 gap-2">
            {AMOUNTS.map((a) => (
              <button key={a} type="button" onClick={() => setAmount(a)} className={cn("rounded-[12px] py-2 text-sm font-bold", amount === a ? "bg-[#1A1A1F] text-white" : "bg-surface-3")}>
                {a / 1000}k
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("design")}>
          <div className="flex gap-2">
            {(Object.keys(DESIGNS) as Array<keyof typeof DESIGNS>).map((d) => (
              <button key={d} type="button" onClick={() => setDesign(d)} className={cn("h-10 w-16 rounded-[10px] bg-gradient-to-br ring-offset-2", DESIGNS[d], design === d && "ring-2 ring-primary")} aria-label={d} aria-pressed={design === d} />
            ))}
          </div>
        </Field>
        <Field label={t("recipientName")} htmlFor="gc-name">
          <Input id="gc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field label={t("message")} htmlFor="gc-msg">
          <Textarea id="gc-msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} rows={2} />
        </Field>
        <Select value={method} onChange={(e) => setMethod(e.target.value as "CLICK")} aria-label="payment">
          {["CLICK", "PAYME", "UZCARD", "HUMO", "CARD"].map((m) => (
            <option key={m} value={m}>
              {m === "CARD" ? "Visa / Mastercard" : m}
            </option>
          ))}
        </Select>
        <Button
          className="w-full"
          size="lg"
          loading={pending}
          onClick={() => {
            if (!signedIn) return router.push("/auth/login?next=/gift-cards");
            start(async () => {
              const r = await buyGiftCardAction({ amount, method, recipientName: name, message, design });
              if (!r.ok) return void toast.error(r.error);
              const url = (r.data as { redirectUrl: string | null }).redirectUrl;
              router.push(url ?? "/account/gift-cards");
            });
          }}
        >
          {t("buy")} · {formatUZS(amount, locale)}
        </Button>
      </div>
    </div>
  );
}
