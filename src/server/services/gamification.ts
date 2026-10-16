import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { notify } from "@/server/notify";
import { randomCode } from "@/server/security/crypto";
import { bonusEarn } from "./wallet";
import { trackMission } from "./missions";
import { achieved, checkInPoints, nextStreak, pickPrize, progressOf, publicName, type Metrics } from "@/lib/gamification";
import { tashkentDayKey, tashkentWeekKey } from "@/lib/dates";

const DAY = 86_400_000;

/** The campaign whose wheel is open right now (spin days are campaign days). */
async function spinCampaign() {
  const now = new Date();
  return db.campaign.findFirst({ where: { spinEnabled: true, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { endsAt: "asc" }, select: { id: true, slug: true, nameUz: true, nameRu: true, endsAt: true } });
}

async function metricsFor(userId: string): Promise<Metrics> {
  const [orders, reviews, photoReviews, streak, referrals] = await Promise.all([
    db.order.count({ where: { userId, status: "DELIVERED" } }),
    db.review.count({ where: { userId, status: "APPROVED" } }),
    db.review.count({ where: { userId, status: "APPROVED", hasMedia: true } }),
    db.checkIn.aggregate({ where: { userId }, _max: { streak: true } }),
    db.user.count({ where: { referredById: userId } }),
  ]);
  return { orders, reviews, photoReviews, checkinStreak: streak._max.streak ?? 0, referrals };
}

/** Award every achievement whose rule is now met. Safe to call after any relevant event. */
export async function evaluateAchievements(userId: string) {
  const [all, earned, m] = await Promise.all([db.achievement.findMany(), db.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }), metricsFor(userId)]);
  const have = new Set(earned.map((e) => e.achievementId));
  const fresh = all.filter((a) => !have.has(a.id) && achieved(a.criteria, m));
  for (const a of fresh) {
    const created = await db.$transaction(async (tx) => {
      const r = await tx.userAchievement.createMany({ data: [{ userId, achievementId: a.id }], skipDuplicates: true });
      if (r.count) await bonusEarn(tx, userId, a.points, "ACHIEVEMENT", { refId: a.id, note: a.key });
      return r.count;
    });
    if (created) await notify({ userId, type: "rewards.achievement", title: `🏅 ${a.nameUz}`, body: `+${a.points.toLocaleString("ru-RU")} bonus`, href: "/account/rewards" });
  }
  return fresh.length;
}

export async function rewardsOverview(userId: string) {
  const today = tashkentDayKey();
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00+05:00`);
  const [last, recent, campaign, spinToday, achievements, earned, missions, progress, m, user, board] = await Promise.all([
    db.checkIn.findFirst({ where: { userId }, orderBy: { day: "desc" } }),
    db.checkIn.findMany({ where: { userId, createdAt: { gte: new Date(Date.now() - 8 * DAY) } }, select: { day: true } }),
    spinCampaign(),
    db.spinResult.findUnique({ where: { userId_day: { userId, day: today } } }),
    db.achievement.findMany({ orderBy: { points: "asc" } }),
    db.userAchievement.findMany({ where: { userId } }),
    db.mission.findMany({ where: { isActive: true, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, orderBy: [{ period: "asc" }, { rewardPoints: "asc" }] }),
    db.userMission.findMany({ where: { userId, periodKey: { in: [today, tashkentWeekKey()] } } }),
    metricsFor(userId),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { bonusBalance: true } }),
    db.review.groupBy({ by: ["userId"], where: { status: "APPROVED", createdAt: { gte: monthStart } }, _count: { _all: true }, _sum: { helpfulCount: true }, orderBy: { _count: { userId: "desc" } }, take: 50 }),
  ]);
  const checkedToday = last?.day === today;
  const streak = last ? (checkedToday ? last.streak : nextStreak(last, today) - 1) : 0;
  const nextPoints = checkInPoints(streak + 1);

  // Leaderboard: approved reviews this month, helpful votes break ties.
  const ranked = board.map((b) => ({ userId: b.userId, reviews: b._count._all, helpful: b._sum.helpfulCount ?? 0 })).sort((a, b) => b.reviews - a.reviews || b.helpful - a.helpful);
  const people = await db.user.findMany({ where: { id: { in: ranked.slice(0, 10).map((r) => r.userId) } }, select: { id: true, name: true, login: true, avatarUrl: true } });
  const myRank = ranked.findIndex((r) => r.userId === userId);

  const missionPeriod = (p: string) => (p === "DAILY" ? today : p === "WEEKLY" ? tashkentWeekKey() : null);
  return {
    bonusBalance: user.bonusBalance,
    checkIn: { today: checkedToday, streak, nextPoints, days: recent.map((r) => r.day) },
    spin: campaign ? { campaign, result: spinToday } : null,
    achievements: achievements.map((a) => ({ ...a, earnedAt: earned.find((e) => e.achievementId === a.id)?.earnedAt ?? null, progress: progressOf(a.criteria, m) })),
    missions: missions.map((mi) => {
      const key = missionPeriod(mi.period) ?? mi.id;
      const um = progress.find((p) => p.missionId === mi.id && p.periodKey === key);
      return { ...mi, userMissionId: um?.id ?? null, progress: um?.progress ?? 0, completedAt: um?.completedAt ?? null, claimedAt: um?.claimedAt ?? null };
    }),
    leaderboard: ranked.slice(0, 10).map((r, i) => {
      const u = people.find((p) => p.id === r.userId);
      return { rank: i + 1, name: publicName(u?.name, u?.login ?? "user"), avatarUrl: u?.avatarUrl ?? null, reviews: r.reviews, helpful: r.helpful, me: r.userId === userId };
    }),
    myRank: myRank >= 0 ? myRank + 1 : null,
    metrics: m,
  };
}

/** Daily check-in: once per Tashkent day; the streak resets after a missed day. */
export async function checkIn(userId: string) {
  const day = tashkentDayKey();
  const last = await db.checkIn.findFirst({ where: { userId }, orderBy: { day: "desc" } });
  if (last?.day === day) throw new AppError("alreadyCheckedIn");
  const streak = nextStreak(last, day);
  const points = checkInPoints(streak);
  try {
    await db.$transaction(async (tx) => {
      await tx.checkIn.create({ data: { userId, day, streak, points } });
      await bonusEarn(tx, userId, points, "CHECKIN", { note: day });
    });
  } catch (err) {
    // Unique (userId, day): a double click lost the race.
    if (String(err).includes("Unique")) throw new AppError("alreadyCheckedIn");
    throw err;
  }
  await trackMission(userId, "CHECKIN").catch(() => {});
  await evaluateAchievements(userId).catch(() => {});
  return { streak, points };
}

/** One spin per day while a spin-enabled campaign runs. The prize is drawn on the server. */
export async function spinWheel(userId: string) {
  const campaign = await spinCampaign();
  if (!campaign) throw new AppError("spinClosed");
  const day = tashkentDayKey();
  if (await db.spinResult.findUnique({ where: { userId_day: { userId, day } } })) throw new AppError("alreadySpun");
  const prize = pickPrize(randomInt(1_000_000) / 1_000_000);
  let couponCode: string | null = null;
  await db.$transaction(async (tx) => {
    if (prize.kind === "COUPON_PERCENT" || prize.kind === "COUPON_DELIVERY") {
      couponCode = `SPIN-${randomCode(2, 4)}`;
      await tx.coupon.create({
        data: {
          code: couponCode,
          type: prize.kind === "COUPON_PERCENT" ? "PERCENT" : "FREE_DELIVERY",
          value: prize.value,
          maxDiscount: prize.kind === "COUPON_PERCENT" ? 100_000 : null,
          minCartTotal: 100_000,
          usageLimit: 1,
          perUserLimit: 1,
          endsAt: new Date(Date.now() + 7 * DAY),
          descriptionUz: `Omad g‘ildiragi: ${campaign.nameUz}`,
          descriptionRu: `Колесо удачи: ${campaign.nameRu}`,
        },
      });
    }
    await tx.spinResult.create({ data: { userId, day, prize: prize.key, value: prize.value, couponCode } });
    if (prize.kind === "POINTS") await bonusEarn(tx, userId, prize.value, "SPIN", { refId: campaign.id });
  });
  return { prize: prize.key, kind: prize.kind, value: prize.value, couponCode };
}

/** Claim a completed mission's reward once. */
export async function claimMission(userId: string, userMissionId: string) {
  const um = await db.userMission.findFirst({ where: { id: userMissionId, userId }, include: { mission: true } });
  if (!um || !um.completedAt) throw new AppError("missionNotDone");
  const claimed = await db.$transaction(async (tx) => {
    const r = await tx.userMission.updateMany({ where: { id: um.id, claimedAt: null }, data: { claimedAt: new Date() } });
    if (r.count) await bonusEarn(tx, userId, um.mission.rewardPoints, "MISSION", { refId: um.missionId, note: um.periodKey });
    return r.count;
  });
  if (!claimed) throw new AppError("missionClaimed");
  return { points: um.mission.rewardPoints };
}
