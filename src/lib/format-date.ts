// Deterministic date formatting (identical on server and every browser, unlike Intl's
// Uzbek locale data which differs between ICU builds). All dates shown in Asia/Tashkent.
import { latinToCyrillic } from "./translit";

const OFFSET = 5 * 3_600_000;
const UZ = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const RU = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const RU_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function parts(d: Date | string | number) {
  const t = new Date(new Date(d).getTime() + OFFSET);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes() };
}

const pad = (n: number) => String(n).padStart(2, "0");

function month(m: number, locale: string, short: boolean) {
  if (locale === "ru") return (short ? RU_SHORT : RU)[m];
  const uz = (short ? UZ_SHORT : UZ)[m];
  return locale === "uz-Cyrl" ? latinToCyrillic(uz) : uz;
}

/** "15 oktabr" / "15 октября" (+ year when not current). */
export function fmtDay(date: Date | string | number, locale: string, opts: { short?: boolean; year?: boolean } = {}) {
  const p = parts(date);
  const now = parts(Date.now());
  const withYear = opts.year ?? p.y !== now.y;
  const m = month(p.m, locale, !!opts.short);
  const base = locale === "ru" ? `${p.d} ${m}` : `${p.d}-${m}`;
  return withYear ? `${base} ${p.y}` : base;
}

export function fmtTime(date: Date | string | number) {
  const p = parts(date);
  return `${pad(p.h)}:${pad(p.min)}`;
}

export function fmtDateTime(date: Date | string | number, locale: string) {
  return `${fmtDay(date, locale)}, ${fmtTime(date)}`;
}

export function fmtNumeric(date: Date | string | number) {
  const p = parts(date);
  return `${pad(p.d)}.${pad(p.m + 1)}.${p.y}`;
}
