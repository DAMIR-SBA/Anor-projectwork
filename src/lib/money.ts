// UZS formatting: "1 250 000 so'm". Grouping uses a no-break space so amounts never wrap.
const NBSP = " ";

export function currencySuffix(locale: string): string {
  if (locale === "ru") return "сум";
  if (locale === "uz-Cyrl") return "сўм";
  return "so‘m";
}

export function groupDigits(value: number): string {
  const sign = value < 0 ? "-" : "";
  const digits = Math.round(Math.abs(value)).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function formatUZS(value: number, locale = "uz"): string {
  return `${groupDigits(value)}${NBSP}${currencySuffix(locale)}`;
}

/** Compact form for charts/badges: "8 mln", "1,2 mlrd". */
export function formatUZSCompact(value: number, locale = "uz"): string {
  const abs = Math.abs(value);
  const units =
    locale === "ru"
      ? { k: "тыс", m: "млн", b: "млрд" }
      : locale === "uz-Cyrl"
        ? { k: "минг", m: "млн", b: "млрд" }
        : { k: "ming", m: "mln", b: "mlrd" };
  const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");
  if (abs >= 1e9) return `${fmt(value / 1e9)}${NBSP}${units.b}`;
  if (abs >= 1e6) return `${fmt(value / 1e6)}${NBSP}${units.m}`;
  if (abs >= 1e3) return `${fmt(value / 1e3)}${NBSP}${units.k}`;
  return groupDigits(value);
}

export function discountPercent(price: number, oldPrice?: number | null): number {
  if (!oldPrice || oldPrice <= price) return 0;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

/** Parse user-typed amounts: "8 mln", "8 000 000", "8млн", "1.5 million", "500k". */
export function parseAmount(raw: string): number | null {
  const s = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(mlrd|milliard|млрд|mln|million|млн|миллион|million|ming|минг|тыс|k|тысяч)?/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(",", "."));
  const unit = m[2];
  if (!unit) {
    const digits = s.replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : null;
  }
  if (/mlrd|milliard|млрд/.test(unit)) return Math.round(num * 1e9);
  if (/mln|million|млн|миллион/.test(unit)) return Math.round(num * 1e6);
  return Math.round(num * 1e3);
}
