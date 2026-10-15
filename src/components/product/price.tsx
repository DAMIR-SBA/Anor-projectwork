"use client";

import { useLocale } from "next-intl";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";

export function Money({ value, className }: { value: number; className?: string }) {
  const locale = useLocale();
  return <span className={cn("tabular whitespace-nowrap", className)}>{formatUZS(value, locale)}</span>;
}

export function Price({ price, oldPrice, size = "md", className }: { price: number; oldPrice?: number | null; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const locale = useLocale();
  const big = { sm: "text-[15px]", md: "text-lg", lg: "text-2xl", xl: "text-[32px] leading-none" }[size];
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("tabular whitespace-nowrap font-extrabold tracking-tight", big, oldPrice ? "text-brand-ink" : "text-fg")}>{formatUZS(price, locale)}</span>
      {oldPrice ? <s className="tabular whitespace-nowrap text-sm text-muted">{formatUZS(oldPrice, locale)}</s> : null}
    </div>
  );
}
