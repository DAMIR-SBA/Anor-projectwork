// ANOR NASIYA eligibility: the mock credit scoring and the rules around applications and
// repayments. Pure, so the same numbers are shown in the UI, enforced on the server and tested.

export type NasiyaSettings = { defaultLimit: number; maxLimit: number; minMonthlyIncome: number; minAgeYears: number; maxActiveContracts: number; incomeMultiplier: number };
export const DEFAULT_NASIYA: NasiyaSettings = { defaultLimit: 3_000_000, maxLimit: 30_000_000, minMonthlyIncome: 1_500_000, minAgeYears: 21, maxActiveContracts: 3, incomeMultiplier: 3 };

export const EMPLOYMENT = ["employed", "self_employed", "business_owner", "pensioner", "student"] as const;
export type Employment = (typeof EMPLOYMENT)[number];

export type ScoringInput = {
  birthDate: Date;
  monthlyIncome: number;
  employment: Employment;
  phoneVerified: boolean;
  /** Platform history: delivered orders, installments paid on time, currently overdue ones, open contracts. */
  deliveredOrders: number;
  paidOnTime: number;
  overdueNow: number;
  activeContracts: number;
  /** The same PINFL was already used by another account. */
  duplicateIdentity: boolean;
};

export type ScoringResult = { decision: "APPROVED" | "REJECTED" | "REVIEW"; score: number; limit: number; reasons: string[] };

/** Whole years between two dates. */
export function ageOn(birth: Date, on: Date): number {
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const m = on.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

const EMPLOYMENT_POINTS: Record<Employment, number> = { employed: 60, business_owner: 45, self_employed: 35, pensioner: 25, student: 0 };

/**
 * Mock CreditScoringProvider. Hard rules reject; otherwise a 300–850 score from income, employment
 * and platform history sets the limit (income × multiplier, scaled by score, capped, rounded down to
 * 100 000). Borderline scores go to manual review instead of an automatic "no".
 */
export function mockScore(i: ScoringInput, s: NasiyaSettings, now = new Date()): ScoringResult {
  const reasons: string[] = [];
  if (i.duplicateIdentity) reasons.push("duplicate");
  if (ageOn(i.birthDate, now) < s.minAgeYears) reasons.push("age");
  if (i.monthlyIncome < s.minMonthlyIncome) reasons.push("income");
  if (i.overdueNow > 0) reasons.push("overdue");
  if (i.activeContracts >= s.maxActiveContracts) reasons.push("activeContracts");
  if (!i.phoneVerified) reasons.push("phone");
  const score = Math.max(
    300,
    Math.min(850, 480 + EMPLOYMENT_POINTS[i.employment] + Math.min(120, i.deliveredOrders * 12) + Math.min(80, i.paidOnTime * 8) + Math.min(60, Math.floor(i.monthlyIncome / 1_000_000) * 6) + (i.phoneVerified ? 30 : 0)),
  );
  if (reasons.length) return { decision: "REJECTED", score, limit: 0, reasons };
  if (score < 580) return { decision: "REVIEW", score, limit: 0, reasons: ["lowScore"] };
  const raw = i.monthlyIncome * s.incomeMultiplier * Math.min(1.5, score / 700);
  const limit = Math.floor(Math.min(s.maxLimit, Math.max(s.defaultLimit, raw)) / 100_000) * 100_000;
  return { decision: "APPROVED", score, limit, reasons: [] };
}

/** Passport series and number, e.g. "AB1234567". */
export const PASSPORT_RE = /^[A-Z]{2}\d{7}$/;
export const PINFL_RE = /^\d{14}$/;

/** "AB1234567" → "AB*****67": only the masked form is ever stored. */
export function maskPassport(p: string): string {
  const v = p.replace(/\s/g, "").toUpperCase();
  return `${v.slice(0, 2)}*****${v.slice(-2)}`;
}

/** Days to wait before applying again after a decision. */
export const REAPPLY_DAYS = 30;

export type ScheduleRow = { index: number; amount: number; paidAmount: number; status: "DUE" | "PAID" | "OVERDUE"; dueDate: Date };

/**
 * What to charge for a repayment. "next" pays the earliest open installment, "overdue" every late
 * one, "payoff" settles the contract early: the remaining principal share only, future markup waived.
 */
export function repaymentAmount(c: { principal: number; months: number }, rows: ScheduleRow[], mode: "next" | "overdue" | "payoff"): { amount: number; indexes: number[] } {
  const open = rows.filter((r) => r.status !== "PAID").sort((a, b) => a.index - b.index);
  if (!open.length) return { amount: 0, indexes: [] };
  if (mode === "next") return { amount: open[0].amount - open[0].paidAmount, indexes: [open[0].index] };
  if (mode === "overdue") {
    const late = open.filter((r) => r.status === "OVERDUE");
    return { amount: late.reduce((s, r) => s + r.amount - r.paidAmount, 0), indexes: late.map((r) => r.index) };
  }
  const principalLeft = Math.ceil((c.principal * open.length) / c.months / 100) * 100;
  const partial = open.reduce((s, r) => s + r.paidAmount, 0);
  return { amount: Math.max(0, principalLeft - partial), indexes: open.map((r) => r.index) };
}

/** Principal released back to the limit when installments are paid (markup is not limit). */
export function principalShare(c: { principal: number; months: number }, installments: number): number {
  return Math.round((c.principal * installments) / c.months);
}
