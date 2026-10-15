import { defineRouting } from "next-intl/routing";

export const locales = ["uz", "uz-Cyrl", "ru"] as const;
export type AppLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "uz",
  // Uzbek Latin lives at "/", Cyrillic at "/oz" (the convention used by gov.uz), Russian at "/ru".
  localePrefix: { mode: "as-needed", prefixes: { "uz-Cyrl": "/oz", ru: "/ru" } },
  localeCookie: { name: "anor_locale", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 },
});

export const localeLabels: Record<AppLocale, { short: string; name: string }> = {
  uz: { short: "O‘z", name: "O‘zbekcha" },
  "uz-Cyrl": { short: "Ўз", name: "Ўзбекча" },
  ru: { short: "Ру", name: "Русский" },
};

/** BCP-47 tag used for Intl formatters. */
export function intlLocale(locale: string): string {
  if (locale === "uz-Cyrl") return "uz-Cyrl-UZ";
  if (locale === "ru") return "ru-RU";
  return "uz-Latn-UZ";
}
