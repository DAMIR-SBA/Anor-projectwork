import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { safeEqual } from "@/server/security/crypto";
import { getJob, runJob } from "@/server/jobs/registry";
import "@/server/jobs/all";

export const maxDuration = 300;

/** Scheduled jobs for serverless hosts (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
async function handle(req: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await ctx.params;
  if (!getJob(job)) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  try {
    const result = await runJob(job);
    return NextResponse.json({ ok: true, job, result });
  } catch (err) {
    return NextResponse.json({ ok: false, job, error: String(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
