import "server-only";
import { agingBucket } from "@/lib/admin";
import { DEFAULT_NASIYA, type NasiyaSettings } from "@/lib/nasiya";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { walletCredit, walletDebit } from "@/server/services/wallet";
import { dayKey } from "@/lib/chat";
import type { Prisma } from "@/generated/prisma/client";
import type { Staff } from "./shops";

/** Platform money for the last `days` days plus current liabilities. */
export async function financeOverview(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [gmv, ads, refunds, pending, paid, wallets, bonus, penalties] = await Promise.all([
    db.order.aggregate({ _sum: { total: true, commissionTotal: true, logisticsFee: true }, _count: { _all: true }, where: { status: "DELIVERED", deliveredAt: { gte: since } } }),
    db.adStat.aggregate({ _sum: { spend: true }, where: { day: { gte: dayKey(since) } } }),
    db.return.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { status: "REFUNDED", decidedAt: { gte: since } } }),
    db.payout.aggregate({ _sum: { net: true }, _count: { _all: true }, where: { status: { not: "PAID" } } }),
    db.payout.aggregate({ _sum: { net: true }, _count: { _all: true }, where: { status: "PAID", paidAt: { gte: since } } }),
    db.wallet.aggregate({ _sum: { balance: true } }),
    db.user.aggregate({ _sum: { bonusBalance: true } }),
    db.penalty.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: since } } }),
  ]);
  const commission = gmv._sum.commissionTotal ?? 0;
  const adRevenue = ads._sum.spend ?? 0;
  return {
    days,
    gmv: gmv._sum.total ?? 0,
    orders: gmv._count._all,
    commission,
    logistics: gmv._sum.logisticsFee ?? 0,
    adRevenue,
    penalties: penalties._sum.amount ?? 0,
    takeRate: gmv._sum.total ? (commission + adRevenue) / gmv._sum.total : 0,
    refunds: { amount: refunds._sum.amount ?? 0, count: refunds._count._all },
    payoutsPending: { amount: pending._sum.net ?? 0, count: pending._count._all },
    payoutsPaid: { amount: paid._sum.net ?? 0, count: paid._count._all },
    walletBalances: wallets._sum.balance ?? 0,
    bonusLiability: bonus._sum.bonusBalance ?? 0,
  };
}

export async function payoutsList(f: { status?: string; page: number }, pageSize = 30) {
  const where: Prisma.PayoutWhereInput = f.status === "PAID" ? { status: "PAID" } : f.status === "PENDING" ? { status: { not: "PAID" } } : {};
  const [rows, total] = await Promise.all([db.payout.findMany({ where, orderBy: [{ periodStart: "desc" }, { net: "desc" }], skip: (f.page - 1) * pageSize, take: pageSize, include: { shop: { select: { id: true, name: true } } } }), db.payout.count({ where })]);
  return { rows, total };
}

export async function refundsList(page: number, pageSize = 30) {
  const [rows, total] = await Promise.all([
    db.refund.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { payment: { select: { method: true, group: { select: { number: true, userId: true } } } }, return: { select: { number: true } } } }),
    db.refund.count(),
  ]);
  return { rows, total };
}

/** Nasiya portfolio: contracts by status, outstanding balance, overdue installments with aging. */
export async function installmentPortfolio() {
  const now = new Date();
  const [byStatus, outstanding, overdueRows, byPlan, apps] = await Promise.all([
    db.installmentContract.groupBy({ by: ["status"], _count: { _all: true }, _sum: { total: true } }),
    db.repaymentSchedule.aggregate({ _sum: { amount: true, paidAmount: true }, where: { status: { not: "PAID" }, contract: { status: { in: ["ACTIVE", "OVERDUE"] } } } }),
    db.repaymentSchedule.findMany({ where: { status: { not: "PAID" }, dueDate: { lt: now } }, orderBy: { dueDate: "asc" }, take: 200, include: { contract: { select: { id: true, number: true, months: true, user: { select: { id: true, login: true, name: true, phone: true } } } } } }),
    db.installmentContract.groupBy({ by: ["months"], where: { status: { in: ["ACTIVE", "OVERDUE"] } }, _count: { _all: true }, _sum: { total: true } }),
    db.installmentApplication.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const overdue = overdueRows.map((r) => {
    const days = Math.floor((now.getTime() - r.dueDate.getTime()) / 86_400_000);
    return { id: r.id, contract: r.contract, index: r.index, dueDate: r.dueDate.toISOString(), due: r.amount - r.paidAmount, days, bucket: agingBucket(days) };
  });
  const aging = { "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as Record<ReturnType<typeof agingBucket>, number>;
  for (const o of overdue) aging[o.bucket] += o.due;
  return {
    contracts: Object.fromEntries(byStatus.map((s) => [s.status, { count: s._count._all, total: s._sum.total ?? 0 }])) as Record<string, { count: number; total: number }>,
    outstanding: (outstanding._sum.amount ?? 0) - (outstanding._sum.paidAmount ?? 0),
    overdue,
    aging,
    byPlan: byPlan.map((p) => ({ months: p.months, count: p._count._all, total: p._sum.total ?? 0 })).sort((a, b) => a.months - b.months),
    applications: Object.fromEntries(apps.map((a) => [a.status, a._count._all])) as Record<string, number>,
  };
}

/** Manual wallet correction (support compensation, mistaken charge); always with a reason. */
export async function adjustWallet(userId: string, staff: Staff, amount: number, reason: string) {
  if (!amount) throw new AppError("invalidInput", undefined, "amount");
  await db.$transaction(async (tx) => {
    if (amount > 0) await walletCredit(tx, userId, amount, "ADJUSTMENT", { refType: "staff", refId: staff.userId, description: reason });
    else await walletDebit(tx, userId, -amount, "ADJUSTMENT", { refType: "staff", refId: staff.userId, description: reason });
  });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "wallet.adjusted", entityType: "User", entityId: userId, after: { amount }, meta: { reason } });
  await notify({ userId, type: "wallet.adjusted", title: "Anor Hamyon", body: `${amount > 0 ? "+" : ""}${amount.toLocaleString("ru-RU")} so‘m · ${reason}`, href: "/account/wallet" });
}

// ── Nasiya settings ──────────────────────────────────────────────────────

export type { NasiyaSettings } from "@/lib/nasiya";

export async function nasiyaSettings(): Promise<NasiyaSettings> {
  const row = await db.setting.findUnique({ where: { key: "nasiya" } });
  return { ...DEFAULT_NASIYA, ...((row?.value as Partial<NasiyaSettings>) ?? {}) };
}

export async function saveNasiya(staff: Staff, s: NasiyaSettings, plans: Array<{ id: string; markupPercent: number; minPrice: number; maxPrice: number; isActive: boolean }>) {
  if (s.defaultLimit > s.maxLimit) throw new AppError("limitOrder", undefined, "defaultLimit");
  for (const p of plans) if (p.minPrice >= p.maxPrice) throw new AppError("invalidInput", undefined, `plan.${p.id}`);
  await db.setting.upsert({ where: { key: "nasiya" }, create: { key: "nasiya", value: s, updatedById: staff.userId }, update: { value: s, updatedById: staff.userId } });
  for (const p of plans) await db.installmentPlan.update({ where: { id: p.id }, data: { markupPercent: p.markupPercent, minPrice: p.minPrice, maxPrice: p.maxPrice, isActive: p.isActive } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "nasiya.updated", entityType: "Setting", entityId: "nasiya", after: { ...s, plans } });
}
