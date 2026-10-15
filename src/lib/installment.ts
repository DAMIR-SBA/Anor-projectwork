// ANOR NASIYA math — pure functions shared by product cards, checkout and contracts.

export type Plan = { months: number; markupPercent: number; minPrice: number; maxPrice: number; isActive?: boolean };

export const DEFAULT_PLANS: Plan[] = [
  { months: 3, markupPercent: 0.04, minPrice: 300_000, maxPrice: 50_000_000 },
  { months: 6, markupPercent: 0.12, minPrice: 300_000, maxPrice: 50_000_000 },
  { months: 9, markupPercent: 0.18, minPrice: 500_000, maxPrice: 50_000_000 },
  { months: 12, markupPercent: 0.24, minPrice: 1_000_000, maxPrice: 50_000_000 },
];

/** Monthly payments are rounded up to the nearest 100 so'm; the last one absorbs the difference. */
const ROUND = 100;

export type Quote = { months: number; principal: number; markup: number; total: number; monthly: number; last: number };

export function quote(price: number, plan: Plan): Quote {
  const markup = Math.round(price * plan.markupPercent);
  const total = price + markup;
  const monthly = Math.ceil(total / plan.months / ROUND) * ROUND;
  const last = total - monthly * (plan.months - 1);
  return { months: plan.months, principal: price, markup, total, monthly, last };
}

export function isPlanEligible(price: number, plan: Plan, categoryEligible = true): boolean {
  return categoryEligible && plan.isActive !== false && price >= plan.minPrice && price <= plan.maxPrice;
}

/** Cheapest monthly payment available for a price (longest eligible plan), for "from X so'm/month" labels. */
export function bestMonthly(price: number, plans: Plan[] = DEFAULT_PLANS, categoryEligible = true): Quote | null {
  const eligible = plans.filter((p) => isPlanEligible(price, p, categoryEligible));
  if (!eligible.length) return null;
  return eligible.map((p) => quote(price, p)).sort((a, b) => a.monthly - b.monthly)[0];
}

export type ScheduleItem = { index: number; dueDate: Date; amount: number };

/** Equal monthly installments, first due one month after signing, no down payment. */
export function buildSchedule(q: Quote, signedAt: Date): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  for (let i = 1; i <= q.months; i++) {
    const due = new Date(signedAt);
    const day = due.getUTCDate();
    due.setUTCDate(1);
    due.setUTCMonth(due.getUTCMonth() + i);
    const lastDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate();
    due.setUTCDate(Math.min(day, lastDay));
    items.push({ index: i, dueDate: due, amount: i === q.months ? q.last : q.monthly });
  }
  return items;
}

/**
 * Early repayment: each installment is principal/months + markup/months, so paying off after
 * k installments costs only the remaining principal share — future markup is waived.
 */
export function earlyPayoff(q: Quote, paidInstallments: number): number {
  const remaining = q.months - paidInstallments;
  if (remaining <= 0) return 0;
  return Math.ceil((q.principal * remaining) / q.months / ROUND) * ROUND;
}
