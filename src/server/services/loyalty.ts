import "server-only";
import { db } from "@/server/db";
import { notify } from "@/server/notify";
import { bonusEarn } from "./wallet";
import type { LoyaltyTier } from "@/generated/prisma/enums";

export type LoyaltySettings = { silverFrom: number; goldFrom: number; referralReward: number; refereeReward: number; referralMonthlyCap: number };
export const DEFAULT_LOYALTY: LoyaltySettings = { silverFrom: 5_000_000, goldFrom: 20_000_000, referralReward: 20_000, refereeReward: 10_000, referralMonthlyCap: 10 };

export async function loyaltySettings(): Promise<LoyaltySettings> {
  const row = await db.setting.findUnique({ where: { key: "loyalty" } });
  return { ...DEFAULT_LOYALTY, ...((row?.value as Partial<LoyaltySettings>) ?? {}) };
}

export function tierFor(spend: number, s: LoyaltySettings): LoyaltyTier {
  return spend >= s.goldFrom ? "GOLD" : spend >= s.silverFrom ? "SILVER" : "STANDARD";
}

/** Tier = delivered spend over the last 365 days. */
export async function recomputeLoyaltyTier(userId: string) {
  const s = await loyaltySettings();
  const agg = await db.order.aggregate({ _sum: { total: true }, where: { userId, status: "DELIVERED", deliveredAt: { gte: new Date(Date.now() - 365 * 86_400_000) } } });
  const tier = tierFor(agg._sum.total ?? 0, s);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { loyaltyTier: true } });
  if (user.loyaltyTier !== tier) {
    await db.user.update({ where: { id: userId }, data: { loyaltyTier: tier } });
    if (tier !== "STANDARD") await notify({ userId, type: "loyalty.tier", title: `${tier} 🎉`, body: tier === "GOLD" ? "+2% qo‘shimcha keshbek" : "+1% qo‘shimcha keshbek", href: "/account/rewards" });
  }
  return tier;
}

/**
 * Referral reward after the referee's first delivered order. Fraud limits: monthly cap per
 * referrer and no reward when referrer and referee share a device or phone (flagged instead).
 */
export async function maybeRewardReferral(refereeId: string) {
  const referee = await db.user.findUniqueOrThrow({ where: { id: refereeId }, select: { referredById: true, phone: true } });
  if (!referee.referredById) return;
  if (await db.referralReward.findUnique({ where: { refereeId } })) return;
  const delivered = await db.order.count({ where: { userId: refereeId, status: "DELIVERED" } });
  if (delivered !== 1) return;
  const s = await loyaltySettings();
  const referrerId = referee.referredById;
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const recent = await db.referralReward.count({ where: { referrerId, createdAt: { gte: monthAgo }, status: "PAID" } });
  const [devA, devB, referrer] = await Promise.all([
    db.device.findMany({ where: { userId: referrerId }, select: { fingerprint: true } }),
    db.device.findMany({ where: { userId: refereeId }, select: { fingerprint: true } }),
    db.user.findUniqueOrThrow({ where: { id: referrerId }, select: { phone: true } }),
  ]);
  const sharedDevice = devA.some((a) => devB.some((b) => b.fingerprint === a.fingerprint));
  const samePhone = !!referee.phone && referee.phone === referrer.phone;
  if (sharedDevice || samePhone || recent >= s.referralMonthlyCap) {
    await db.referralReward.create({ data: { referrerId, refereeId, points: 0, status: "BLOCKED", reason: sharedDevice ? "shared_device" : samePhone ? "same_phone" : "monthly_cap" } });
    if (sharedDevice || samePhone) {
      await db.fraudFlag.upsert({
        where: { type_entityType_entityId: { type: "REFERRAL_ABUSE", entityType: "User", entityId: referrerId } },
        create: { type: "REFERRAL_ABUSE", entityType: "User", entityId: referrerId, userId: referrerId, score: 70, details: { refereeId, sharedDevice, samePhone } },
        update: { score: { increment: 10 } },
      });
    }
    return;
  }
  await db.$transaction(async (tx) => {
    await tx.referralReward.create({ data: { referrerId, refereeId, points: s.referralReward, status: "PAID" } });
    await bonusEarn(tx, referrerId, s.referralReward, "REFERRAL", { refId: refereeId });
    await bonusEarn(tx, refereeId, s.refereeReward, "REFERRAL", { refId: referrerId });
  });
  await notify({ userId: referrerId, type: "referral.paid", title: "Taklif uchun bonus", body: `+${s.referralReward} bonus`, href: "/account/rewards" });
}

type Criteria = { metric: "orders" | "reviews" | "photoReviews" | "checkinStreak" | "referrals" | "spend"; gte: number };

/** Award achievements whose criteria are now met. */
export async function checkAchievements(userId: string) {
  const all = await db.achievement.findMany({ where: { users: { none: { userId } } } });
  if (!all.length) return [];
  const [orders, reviews, photoReviews, streak, referrals] = await Promise.all([
    db.order.count({ where: { userId, status: "DELIVERED" } }),
    db.review.count({ where: { userId, status: "APPROVED" } }),
    db.review.count({ where: { userId, status: "APPROVED", hasMedia: true } }),
    db.checkIn.findFirst({ where: { userId }, orderBy: { day: "desc" }, select: { streak: true } }),
    db.referralReward.count({ where: { referrerId: userId, status: "PAID" } }),
  ]);
  const metrics: Record<Criteria["metric"], number> = { orders, reviews, photoReviews, checkinStreak: streak?.streak ?? 0, referrals, spend: 0 };
  const earned = [];
  for (const a of all) {
    const c = a.criteria as Criteria;
    if ((metrics[c.metric] ?? 0) >= c.gte) {
      await db.$transaction(async (tx) => {
        await tx.userAchievement.create({ data: { userId, achievementId: a.id } });
        await bonusEarn(tx, userId, a.points, "ACHIEVEMENT", { refId: a.id });
      });
      earned.push(a);
      await notify({ userId, type: "achievement", title: `🏆 ${a.nameUz}`, body: `+${a.points} bonus`, href: "/account/rewards" });
    }
  }
  return earned;
}
