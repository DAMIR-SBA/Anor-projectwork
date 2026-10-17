import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { hmac } from "@/server/security/crypto";
import { walletDebit } from "./wallet";
import { nasiyaSettings } from "./admin/finance";
import { startPayment } from "@/server/payments/service";
import { maskPassport, mockScore, principalShare, REAPPLY_DAYS, repaymentAmount, type Employment, type ScoringInput, type ScoringResult } from "@/lib/nasiya";
import type { PaymentMethod } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";

const DAY = 86_400_000;

/** Pluggable scoring: a real bureau integration implements the same call. */
export interface CreditScoringProvider {
  score(input: ScoringInput): Promise<ScoringResult>;
}

const mockProvider: CreditScoringProvider = {
  async score(input) {
    return mockScore(input, await nasiyaSettings());
  },
};

export function scoringProvider(): CreditScoringProvider {
  return mockProvider;
}

export type ApplicationInput = { fullName: string; passport: string; pinfl: string; birthDate: Date; monthlyIncome: number; employment: Employment };

/** Apply for a limit. One open application at a time; after a decision, wait REAPPLY_DAYS. */
export async function applyForNasiya(userId: string, input: ApplicationInput) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, phone: true, phoneVerifiedAt: true, nasiyaLimit: true } });
  if (!user.phone || !user.phoneVerifiedAt) throw new AppError("nasiyaPhone");
  const last = await db.installmentApplication.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (last?.status === "PENDING") throw new AppError("nasiyaPending");
  if (last && last.createdAt.getTime() > Date.now() - REAPPLY_DAYS * DAY) throw new AppError("nasiyaTooSoon", { days: REAPPLY_DAYS });

  const pinflHash = hmac(input.pinfl, "pinfl");
  const now = new Date();
  const [delivered, paidOnTime, overdueNow, activeContracts, duplicate] = await Promise.all([
    db.order.count({ where: { userId, status: "DELIVERED" } }),
    db.repaymentSchedule.count({ where: { contract: { userId }, status: "PAID", paidAt: { not: null } } }),
    db.repaymentSchedule.count({ where: { contract: { userId }, status: "OVERDUE" } }),
    db.installmentContract.count({ where: { userId, status: { in: ["ACTIVE", "OVERDUE"] } } }),
    db.installmentApplication.findFirst({ where: { pinflHash, userId: { not: userId } }, select: { userId: true } }),
  ]);
  const result = await scoringProvider().score({ birthDate: input.birthDate, monthlyIncome: input.monthlyIncome, employment: input.employment, phoneVerified: true, deliveredOrders: delivered, paidOnTime, overdueNow, activeContracts, duplicateIdentity: !!duplicate });

  const status = result.decision === "APPROVED" ? "APPROVED" : result.decision === "REJECTED" ? "REJECTED" : "PENDING";
  const app = await db.$transaction(async (tx) => {
    const row = await tx.installmentApplication.create({
      data: {
        userId,
        status,
        phone: user.phone!,
        fullName: input.fullName.trim(),
        passportMasked: maskPassport(input.passport),
        pinflHash,
        birthDate: input.birthDate,
        monthlyIncome: input.monthlyIncome,
        employment: input.employment,
        scoring: { score: result.score, reasons: result.reasons },
        approvedLimit: status === "APPROVED" ? result.limit : null,
        reason: result.reasons.join(",") || null,
        decidedAt: status === "PENDING" ? null : now,
      },
    });
    if (status === "APPROVED") await tx.user.update({ where: { id: userId }, data: { nasiyaLimit: Math.max(user.nasiyaLimit, result.limit) } });
    return row;
  });
  // The same identity on two accounts goes to the fraud desk.
  if (duplicate) {
    await db.fraudFlag.upsert({
      where: { type_entityType_entityId: { type: "DUPLICATE_ACCOUNT", entityType: "Pinfl", entityId: pinflHash.slice(0, 32) } },
      update: {},
      create: { type: "DUPLICATE_ACCOUNT", entityType: "Pinfl", entityId: pinflHash.slice(0, 32), userId, score: 80, details: { signal: "pinfl", userIds: [duplicate.userId, userId] } },
    });
  }
  await audit({ actorId: userId, actorKind: "user", action: `nasiya.application_${status.toLowerCase()}`, entityType: "InstallmentApplication", entityId: app.id, after: { score: result.score, limit: result.limit, reasons: result.reasons } });
  await notify({ userId, type: "nasiya.decision", title: "ANOR NASIYA", body: status === "APPROVED" ? `Limit: ${result.limit.toLocaleString("ru-RU")} so‘m` : status === "PENDING" ? "Arizangiz ko‘rib chiqilmoqda" : "Ariza rad etildi", href: "/account/nasiya", channels: ["sms", "telegram"] });
  return { status, limit: app.approvedLimit ?? 0, reasons: result.reasons };
}

/** Everything the buyer's Nasiya page shows. */
export async function nasiyaOverview(userId: string) {
  const [user, application, contracts] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { nasiyaLimit: true, nasiyaUsed: true, phone: true, phoneVerifiedAt: true, name: true } }),
    db.installmentApplication.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.installmentContract.findMany({ where: { userId }, orderBy: { signedAt: "desc" }, include: { schedule: { orderBy: { index: "asc" } }, plan: { select: { months: true, markupPercent: true } }, group: { select: { id: true, number: true, orders: { select: { id: true, items: { select: { title: true }, take: 2 } } } } } } }),
  ]);
  const settings = await nasiyaSettings();
  // Set only while the waiting period after a decision is still running.
  const reapply = application && application.status !== "PENDING" ? application.createdAt.getTime() + REAPPLY_DAYS * DAY : 0;
  const canReapplyAt = reapply > Date.now() ? new Date(reapply) : null;
  return {
    limit: user.nasiyaLimit,
    used: user.nasiyaUsed,
    available: Math.max(0, user.nasiyaLimit - user.nasiyaUsed),
    phoneVerified: !!(user.phone && user.phoneVerifiedAt),
    name: user.name,
    application,
    canReapplyAt,
    settings,
    contracts: contracts.map((c) => {
      const open = c.schedule.filter((s) => s.status !== "PAID");
      return {
        ...c,
        outstanding: open.reduce((s, r) => s + r.amount - r.paidAmount, 0),
        next: open[0] ?? null,
        payoff: repaymentAmount(c, c.schedule, "payoff").amount,
        overdue: repaymentAmount(c, c.schedule, "overdue").amount,
      };
    }),
  };
}

export type RepayMode = "next" | "overdue" | "payoff";

/** Apply a settled repayment to the schedule (inside the caller's transaction). */
async function applyRepayment(tx: Tx, contractId: string, mode: RepayMode, amount: number) {
  const c = await tx.installmentContract.findUniqueOrThrow({ where: { id: contractId }, include: { schedule: true } });
  const { indexes } = repaymentAmount(c, c.schedule, mode);
  const rows = c.schedule.filter((s) => indexes.includes(s.index)).sort((a, b) => a.index - b.index);
  const now = new Date();
  let left = amount;
  for (const [i, r] of rows.entries()) {
    // Early payoff spreads the (markup-free) amount over the remaining rows; otherwise each row is paid in full.
    const share = mode === "payoff" ? (i === rows.length - 1 ? left : Math.floor(amount / rows.length)) : r.amount - r.paidAmount;
    left -= share;
    await tx.repaymentSchedule.update({ where: { id: r.id }, data: { status: "PAID", paidAt: now, paidAmount: r.paidAmount + share } });
  }
  const remaining = await tx.repaymentSchedule.count({ where: { contractId, status: { not: "PAID" } } });
  const overdue = await tx.repaymentSchedule.count({ where: { contractId, status: "OVERDUE" } });
  await tx.installmentContract.update({ where: { id: contractId }, data: remaining === 0 ? { status: "PAID", closedAt: now } : { status: overdue ? "OVERDUE" : "ACTIVE" } });
  // Repaid principal goes back to the limit.
  const released = mode === "payoff" || remaining === 0 ? principalShare(c, c.schedule.filter((s) => s.status !== "PAID").length) : principalShare(c, rows.length);
  const u = await tx.user.findUniqueOrThrow({ where: { id: c.userId }, select: { nasiyaUsed: true } });
  await tx.user.update({ where: { id: c.userId }, data: { nasiyaUsed: Math.max(0, u.nasiyaUsed - released) } });
  return { contract: c, closed: remaining === 0 };
}

/** Repay from Anor Hamyon (immediately) or by card (through the payment page). */
export async function repay(userId: string, contractId: string, mode: RepayMode, method: PaymentMethod | "WALLET", savedCardId?: string | null) {
  const c = await db.installmentContract.findFirst({ where: { id: contractId, userId }, include: { schedule: true } });
  if (!c || c.status === "PAID" || c.status === "CANCELLED") throw new AppError("notFound");
  const { amount } = repaymentAmount(c, c.schedule, mode);
  if (amount <= 0) throw new AppError("invalidInput");
  if (method === "WALLET") {
    const r = await db.$transaction(async (tx) => {
      await walletDebit(tx, userId, amount, "PAYMENT", { refType: "installment", refId: c.id, description: `Nasiya ${c.number}` });
      await tx.payment.create({ data: { userId, method: "WALLET", purpose: "INSTALLMENT", amount, status: "PAID", paidAt: new Date(), meta: { contractId: c.id, mode } } });
      return applyRepayment(tx, c.id, mode, amount);
    });
    await afterRepayment(userId, c.number, amount, r.closed);
    return { paid: true, redirectUrl: null };
  }
  const p = await startPayment({ userId, method, amount, purpose: "INSTALLMENT", meta: { contractId: c.id, mode }, savedCardId });
  return { paid: p.status === "PAID", redirectUrl: p.redirectUrl };
}

/** Payment handler for card repayments (registered in payments/handlers). */
export async function settleCardRepayment(p: { userId: string; amount: number; meta: Record<string, unknown> }) {
  const contractId = String(p.meta.contractId);
  const mode = (p.meta.mode as RepayMode) ?? "next";
  const r = await db.$transaction((tx) => applyRepayment(tx, contractId, mode, p.amount));
  await afterRepayment(p.userId, r.contract.number, p.amount, r.closed);
}

async function afterRepayment(userId: string, number: string, amount: number, closed: boolean) {
  await audit({ actorId: userId, actorKind: "user", action: closed ? "nasiya.contract_closed" : "nasiya.repaid", entityType: "InstallmentContract", entityId: number, after: { amount } });
  await notify({ userId, type: "nasiya.repaid", title: `Nasiya ${number}`, body: closed ? "Shartnoma to‘liq yopildi" : `To‘lov qabul qilindi: ${amount.toLocaleString("ru-RU")} so‘m`, href: "/account/nasiya" });
}

/** Daily: reminders 3 days and 1 day before the due date; late installments become overdue. */
export async function nasiyaDaily(now = new Date()) {
  const soon = await db.repaymentSchedule.findMany({
    where: { status: "DUE", dueDate: { gte: now, lt: new Date(now.getTime() + 3 * DAY) }, OR: [{ remindedAt: null }, { remindedAt: { lt: new Date(now.getTime() - 20 * 3_600_000) } }] },
    include: { contract: { select: { userId: true, number: true } } },
  });
  for (const s of soon) {
    const days = Math.max(1, Math.ceil((s.dueDate.getTime() - now.getTime()) / DAY));
    await notify({ userId: s.contract.userId, type: "nasiya.reminder", title: `Nasiya ${s.contract.number}`, body: `${days} kundan so‘ng to‘lov: ${(s.amount - s.paidAmount).toLocaleString("ru-RU")} so‘m`, href: "/account/nasiya", channels: ["sms", "telegram", "push"] });
    await db.repaymentSchedule.update({ where: { id: s.id }, data: { remindedAt: now } });
  }
  const late = await db.repaymentSchedule.findMany({ where: { status: "DUE", dueDate: { lt: now } }, include: { contract: { select: { id: true, userId: true, number: true } } } });
  for (const s of late) {
    await db.repaymentSchedule.update({ where: { id: s.id }, data: { status: "OVERDUE" } });
    await db.installmentContract.update({ where: { id: s.contract.id }, data: { status: "OVERDUE" } });
    await notify({ userId: s.contract.userId, type: "nasiya.overdue", title: `Nasiya ${s.contract.number}`, body: `To‘lov muddati o‘tdi: ${(s.amount - s.paidAmount).toLocaleString("ru-RU")} so‘m`, href: "/account/nasiya", channels: ["sms", "telegram", "push"] });
  }
  return { reminded: soon.length, overdue: late.length };
}

// ── Staff review of borderline applications ──────────────────────────────

export async function pendingApplications() {
  return db.installmentApplication.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 50, include: { user: { select: { id: true, login: true, name: true } } } });
}

export async function decideApplication(id: string, staff: { userId: string; login: string }, approve: boolean, limit: number, note: string | null) {
  const app = await db.installmentApplication.findUnique({ where: { id } });
  if (!app || app.status !== "PENDING") throw new AppError("invalidTransition");
  const settings = await nasiyaSettings();
  if (approve && (limit < 100_000 || limit > settings.maxLimit)) throw new AppError("invalidInput", undefined, "limit");
  await db.$transaction(async (tx) => {
    await tx.installmentApplication.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", approvedLimit: approve ? limit : null, reason: note || (approve ? null : "manual"), decidedAt: new Date() } });
    if (approve) await tx.user.update({ where: { id: app.userId }, data: { nasiyaLimit: limit } });
  });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: approve ? "nasiya.application_approved" : "nasiya.application_rejected", entityType: "InstallmentApplication", entityId: id, after: { limit: approve ? limit : 0, note } });
  await notify({ userId: app.userId, type: "nasiya.decision", title: "ANOR NASIYA", body: approve ? `Limit: ${limit.toLocaleString("ru-RU")} so‘m` : "Ariza rad etildi", href: "/account/nasiya", channels: ["sms", "telegram"] });
}
