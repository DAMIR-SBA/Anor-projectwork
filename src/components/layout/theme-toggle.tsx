"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark" | "system";

const EVENT = "anor-theme";

function apply(theme: Theme) {
  document.cookie = `anor_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  window.dispatchEvent(new Event(EVENT));
}

// The cookie is the source of truth (the server reads it too); every toggle on the page follows it.
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};
const readTheme = (): Theme => (document.cookie.match(/(?:^|; )anor_theme=(light|dark|system)/)?.[1] as Theme | undefined) ?? "system";

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("common");
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  const next: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = theme === "light" ? t("themeLight") : theme === "dark" ? t("themeDark") : t("themeSystem");
  return (
    <button
      type="button"
      onClick={() => {
        apply(next[theme]);
      }}
      className={cn("inline-flex items-center gap-2 rounded-[10px] p-2 text-sm font-semibold hover:bg-surface-3", className)}
      aria-label={`${t("theme")}: ${label}`}
      title={`${t("theme")}: ${label}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
