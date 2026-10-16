// ANOR PLUS plans and period maths, shared by the landing page, the account page and the renewal job.

export type PlusPlan = "PLUS_MONTHLY" | "PLUS_ANNUAL";
export const PLUS_PLANS: Record<PlusPlan, { price: number; months: number }> = {
  PLUS_MONTHLY: { price: 29_000, months: 1 },
  PLUS_ANNUAL: { price: 249_000, months: 12 },
};

/** Annual saving against twelve monthly payments, in percent. */
export function annualSavingPct(): number {
  const m = PLUS_PLANS.PLUS_MONTHLY.price * 12;
  return Math.round(((m - PLUS_PLANS.PLUS_ANNUAL.price) / m) * 100);
}

/** Same day of month `months` later; the 31st falls back to the month's last day. */
export function addMonths(d: Date, months: number): Date {
  const n = new Date(d);
  const day = n.getUTCDate();
  n.setUTCDate(1);
  n.setUTCMonth(n.getUTCMonth() + months);
  const last = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)).getUTCDate();
  n.setUTCDate(Math.min(day, last));
  return n;
}

/** Remind this many days before an auto-renewal charge. */
export const RENEWAL_NOTICE_DAYS = 3;
