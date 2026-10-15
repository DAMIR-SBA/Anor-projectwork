"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { quote, isPlanEligible, type Plan } from "@/lib/installment";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";

export function InstallmentWidget({ price, plans, eligible }: { price: number; plans: Plan[]; eligible: boolean }) {
  const t = useTranslations("product");
  const locale = useLocale();
  const available = plans.filter((p) => isPlanEligible(price, p, eligible));
  const [months, setMonths] = useState(available[available.length - 1]?.months ?? 0);
  if (!available.length) return null;
  const plan = available.find((p) => p.months === months) ?? available[0];
  const q = quote(price, plan);
  return (
    <div className="rounded-[16px] border border-accent/60 bg-accent-50 p-3.5 dark:bg-accent/10">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-extrabold">
          <CalendarClock className="h-4 w-4 text-[#8a6500] dark:text-accent" /> {t("nasiyaTitle")}
        </p>
        <Link href="/nasiya" className="text-xs font-semibold text-muted underline">
          {t("nasiyaText")}
        </Link>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1" role="radiogroup" aria-label={t("nasiyaTitle")}>
        {available.map((p) => (
          <button
            key={p.months}
            type="button"
            role="radio"
            aria-checked={p.months === plan.months}
            onClick={() => setMonths(p.months)}
            className={cn("rounded-[10px] py-1.5 text-sm font-bold", p.months === plan.months ? "bg-[#1A1A1F] text-white" : "bg-surface hover:bg-surface-3")}
          >
            {t("months", { count: p.months })}
          </button>
        ))}
      </div>
      <p className="mt-2.5 text-lg font-extrabold">{t("monthly", { amount: formatUZS(q.monthly, locale), months: q.months })}</p>
      <p className="text-xs text-muted">{t("overpay", { amount: formatUZS(q.markup, locale) })}</p>
    </div>
  );
}
