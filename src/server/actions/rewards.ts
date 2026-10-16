"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/server/action";
import { checkIn, claimMission, spinWheel } from "@/server/services/gamification";
import { trackMission } from "@/server/services/missions";

const refresh = () => revalidatePath("/[locale]/account/rewards", "page");

export const checkInAction = action({ rateLimit: { key: "rewards.checkin", limit: 10, window: 60 } }, async (_i, ctx) => {
  const r = await checkIn(ctx.user.id);
  refresh();
  return { ok: true, data: r };
});

export const spinAction = action({ rateLimit: { key: "rewards.spin", limit: 5, window: 60 } }, async (_i, ctx) => {
  const r = await spinWheel(ctx.user.id);
  refresh();
  return { ok: true, data: r };
});

export const claimMissionAction = action({ schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  const r = await claimMission(ctx.user.id, i.id);
  refresh();
  return { ok: true, data: r };
});

/** Sharing counts toward SHARE missions; anonymous shares are simply ignored. */
export const trackShareAction = action({ auth: "public", rateLimit: { key: "rewards.share", limit: 20, window: 3600 }, schema: z.object({}) }, async (_i, ctx) => {
  if (ctx.user) await trackMission(ctx.user.id, "SHARE").catch(() => {});
});
