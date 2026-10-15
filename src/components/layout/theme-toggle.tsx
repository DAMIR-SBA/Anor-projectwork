"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark" | "system";

function apply(theme: Theme) {
  document.cookie = `anor_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("common");
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )anor_theme=([^;]+)/);
    if (m) setTheme(m[1] as Theme);
  }, []);
  const next: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = theme === "light" ? t("themeLight") : theme === "dark" ? t("themeDark") : t("themeSystem");
  return (
    <button
      type="button"
      onClick={() => {
        const n = next[theme];
        setTheme(n);
        apply(n);
      }}
      className={cn("inline-flex items-center gap-2 rounded-[10px] p-2 text-sm font-semibold hover:bg-surface-3", className)}
      aria-label={`${t("theme")}: ${label}`}
      title={`${t("theme")}: ${label}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
