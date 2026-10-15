import { latinToCyrillic } from "./translit";

type Localizable = Record<string, unknown>;

/**
 * Pick a localized column: field "title" reads titleUz / titleRu / titleCyrl.
 * Uzbek Cyrillic falls back to transliterating the Latin value.
 */
export function loc<T extends Localizable>(row: T, field: string, locale: string): string {
  const uz = (row[`${field}Uz`] as string | null | undefined) ?? "";
  if (locale === "ru") return ((row[`${field}Ru`] as string | null | undefined) || uz) ?? "";
  if (locale === "uz-Cyrl") {
    const cyrl = row[`${field}Cyrl`] as string | null | undefined;
    return cyrl || latinToCyrillic(uz);
  }
  return uz;
}

/** For free text written in Uzbek Latin (e.g. shop names) shown in the Cyrillic UI. */
export function locText(text: string | null | undefined, locale: string): string {
  if (!text) return "";
  return locale === "uz-Cyrl" ? latinToCyrillic(text) : text;
}
