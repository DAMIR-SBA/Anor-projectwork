import "server-only";
import { db } from "@/server/db";
import { tashkentDayKey, tashkentWeekKey } from "@/lib/dates";

/** Advance active missions for an action (VIEW_PRODUCTS, ADD_WISHLIST, ORDER, REVIEW, CHECKIN, SHARE). */
export async function trackMission(userId: string, actionKey: string, amount = 1) {
  const missions = await db.mission.findMany({ where: { action: actionKey, isActive: true } });
  for (const m of missions) {
    const periodKey = m.period === "DAILY" ? tashkentDayKey() : m.period === "WEEKLY" ? tashkentWeekKey() : m.id;
    const um = await db.userMission.upsert({
      where: { userId_missionId_periodKey: { userId, missionId: m.id, periodKey } },
      create: { userId, missionId: m.id, periodKey, progress: Math.min(m.target, amount) },
      update: { progress: { increment: amount } },
    });
    if (um.progress >= m.target && !um.completedAt) {
      await db.userMission.update({ where: { id: um.id }, data: { completedAt: new Date(), progress: m.target } });
    }
  }
}
