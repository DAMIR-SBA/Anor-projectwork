import "server-only";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import { db } from "@/server/db";
import { env } from "@/server/env";

type Check = { ok: boolean; ms?: number; detail?: string };

async function timed(fn: () => Promise<unknown>): Promise<Check> {
  const t = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - t };
  } catch {
    return { ok: false, ms: Date.now() - t };
  }
}

/**
 * Liveness + readiness for load balancers and uptime monitors. The database decides up/down;
 * failing jobs or storage only degrade. No secrets, hostnames or error texts in the output.
 */
export async function healthReport() {
  const e = env();
  const [database, jobs, storage] = await Promise.all([
    timed(() => db.$queryRaw`SELECT 1`),
    (async (): Promise<Check> => {
      try {
        const failed = await db.jobRun.count({ where: { status: "FAILED", startedAt: { gte: new Date(Date.now() - 3_600_000) } } });
        return { ok: failed === 0, detail: failed ? `${failed} failed in the last hour` : undefined };
      } catch {
        return { ok: false };
      }
    })(),
    e.STORAGE_DRIVER === "local" ? timed(() => access(path.resolve(e.STORAGE_LOCAL_DIR), constants.W_OK)) : Promise.resolve({ ok: !!(e.STORAGE_SUPABASE_URL && e.STORAGE_SUPABASE_SERVICE_KEY) }),
  ]);
  const status = !database.ok ? "down" : jobs.ok && storage.ok ? "ok" : "degraded";
  return {
    status,
    time: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.npm_package_version ?? "dev",
    uptimeSec: Math.round(process.uptime()),
    checks: { database, jobs, storage: { ...storage, driver: e.STORAGE_DRIVER } },
    drivers: { jobs: e.JOBS_DRIVER, realtime: e.REALTIME_DRIVER, email: e.EMAIL_DRIVER, sms: e.SMS_DRIVER },
  };
}
