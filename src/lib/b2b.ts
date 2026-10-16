// B2B rules shared by the buyer pages, the seller cabinet, checkout and the jobs. Pure functions.

/** STIR (taxpayer id): 9 digits. Legal entities start with 2 or 3, individual entrepreneurs with 4–7. */
export const TAX_ID_RE = /^[2-7]\d{8}$/;
/** Settlement account: 20 digits. Bank code (MFO): 5 digits. */
export const BANK_ACCOUNT_RE = /^\d{20}$/;
export const MFO_RE = /^\d{5}$/;

export const VAT_RATE = 0.12;
/** Bank transfer invoices must be paid within this many banking days, or the order is cancelled. */
export const INVOICE_BANK_DAYS = 3;
export const QUOTE_MIN_QTY = 5;
export const QUOTE_MAX_QTY = 100_000;
export const QUOTE_VALID_DAYS = [3, 7, 14] as const;
/** Sellers have this long to answer a quote request. */
export const QUOTE_ANSWER_DAYS = 7;

/** VAT contained in a VAT-inclusive amount (12/112). */
export function vatIncluded(amount: number, rate = VAT_RATE): number {
  return Math.round((amount * rate) / (1 + rate));
}

/** Add banking days (Mon–Fri), keeping the time of day. */
export function addBankDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

/** Spaces every 4 digits so a 20-digit account can be read and typed back. */
export function formatAccount(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
}

export type QuoteLike = { status: string; userId: string; validUntil: Date | null; quotedPrice: number | null; createdAt: Date };

/** Status as the buyer should see it now (a quote past its validity reads as expired before the job runs). */
export function quoteState(q: QuoteLike, now = new Date()): string {
  if ((q.status === "QUOTED" || q.status === "ACCEPTED") && q.validUntil && q.validUntil < now) return "EXPIRED";
  if (q.status === "OPEN" && q.createdAt.getTime() + QUOTE_ANSWER_DAYS * 86_400_000 < now.getTime()) return "EXPIRED";
  return q.status;
}

/** The negotiated unit price a cart line may use, or null (wrong owner, not accepted, expired). */
export function quotePriceFor(q: QuoteLike | null | undefined, userId: string | null | undefined, now = new Date()): number | null {
  if (!q || !userId || q.userId !== userId || q.quotedPrice == null) return null;
  return quoteState(q, now) === "ACCEPTED" ? q.quotedPrice : null;
}

/** Quote numbers like Q-7K3M9P (no 0/O/1/I to avoid misreading on the phone). */
export function quoteNumber(rand: () => number = Math.random): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
  return `Q-${s}`;
}
