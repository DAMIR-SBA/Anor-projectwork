import "server-only";
import { db, type Tx } from "@/server/db";
import { AppError } from "@/server/action";
import type { WalletTxType, BonusReason } from "@/generated/prisma/enums";

/** Credit a wallet atomically and append a ledger row. */
export async function walletCredit(tx: Tx, userId: string, amount: number, type: WalletTxType, ref: { refType?: string; refId?: string; description?: string } = {}) {
  if (amount <= 0) return null;
  const wallet = await tx.wallet.upsert({ where: { userId }, create: { userId, balance: amount }, update: { balance: { increment: amount } } });
  return tx.walletTransaction.create({ data: { walletId: wallet.id, type, amount, balanceAfter: wallet.balance, ...ref } });
}

/** Debit only if the balance covers it (conditional update — no negative balances under concurrency). */
export async function walletDebit(tx: Tx, userId: string, amount: number, type: WalletTxType, ref: { refType?: string; refId?: string; description?: string } = {}) {
  if (amount <= 0) return null;
  const res = await tx.wallet.updateMany({ where: { userId, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
  if (res.count !== 1) throw new AppError("insufficientFunds");
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  return tx.walletTransaction.create({ data: { walletId: wallet.id, type, amount: -amount, balanceAfter: wallet.balance, ...ref } });
}

export const BONUS_TTL_DAYS = 180;

export async function bonusEarn(tx: Tx, userId: string, amount: number, reason: BonusReason, opts: { refId?: string; note?: string; ttlDays?: number } = {}) {
  if (amount <= 0) return;
  await tx.bonusPoints.create({
    data: { userId, amount, remaining: amount, reason, refId: opts.refId, note: opts.note, expiresAt: new Date(Date.now() + (opts.ttlDays ?? BONUS_TTL_DAYS) * 86_400_000) },
  });
  await tx.user.update({ where: { id: userId }, data: { bonusBalance: { increment: amount } } });
}

/** Spend bonus points FIFO by expiry (oldest-expiring first). */
export async function bonusSpend(tx: Tx, userId: string, amount: number, refId: string) {
  if (amount <= 0) return;
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { bonusBalance: true } });
  if (user.bonusBalance < amount) throw new AppError("insufficientFunds");
  const lots = await tx.bonusPoints.findMany({ where: { userId, remaining: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }] });
  let left = amount;
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(lot.remaining, left);
    await tx.bonusPoints.update({ where: { id: lot.id }, data: { remaining: { decrement: take } } });
    left -= take;
  }
  await tx.bonusPoints.create({ data: { userId, amount: -amount, remaining: 0, reason: "REDEEM", refId } });
  await tx.user.update({ where: { id: userId }, data: { bonusBalance: { decrement: amount } } });
}

/** Expire lots past their date (nightly job). */
export async function expireBonuses() {
  const lots = await db.bonusPoints.findMany({ where: { remaining: { gt: 0 }, expiresAt: { lt: new Date() } } });
  for (const lot of lots) {
    await db.$transaction(async (tx) => {
      await tx.bonusPoints.update({ where: { id: lot.id }, data: { remaining: 0 } });
      await tx.bonusPoints.create({ data: { userId: lot.userId, amount: -lot.remaining, reason: "EXPIRE", refId: lot.id } });
      await tx.user.update({ where: { id: lot.userId }, data: { bonusBalance: { decrement: lot.remaining } } });
    });
  }
  return { expired: lots.length };
}
