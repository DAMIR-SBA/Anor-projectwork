import { latinToCyrillic } from "./translit";

/** Normalize text for search: lowercase, unify Uzbek apostrophes, collapse spaces. */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Denormalized product search document: titles in all scripts, brand, categories, keywords. */
export function buildSearchText(p: { titleUz: string; titleRu: string; brand?: string | null; categories: Array<{ nameUz: string; nameRu: string }>; keywords?: string | null; sku?: string[] }): string {
  const parts = [
    p.titleUz,
    latinToCyrillic(p.titleUz),
    p.titleRu,
    p.brand ?? "",
    ...p.categories.flatMap((c) => [c.nameUz, c.nameRu]),
    p.keywords ?? "",
    ...(p.sku ?? []),
  ];
  return normalizeSearch(parts.join(" "));
}
