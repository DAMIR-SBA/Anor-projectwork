"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeLabels, locales, type AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/cn";

export function LocaleSwitcher({ className, compact }: { className?: string; compact?: boolean }) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  return (
    <label className={cn("relative inline-flex items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-sm font-semibold hover:bg-surface-3", pending && "opacity-60", className)}>
      <Globe className="h-4 w-4 text-muted" aria-hidden />
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={(e) => {
          const next = e.target.value as AppLocale;
          const qs = window.location.search.slice(1);
          start(() => router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { locale: next }));
        }}
        className="cursor-pointer appearance-none bg-transparent pr-1 focus:outline-none"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {compact ? localeLabels[l].short : localeLabels[l].name}
          </option>
        ))}
      </select>
    </label>
  );
}
