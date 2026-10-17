import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { log } from "@/server/log";
import { listJobs } from "@/server/jobs/registry";
import "@/server/jobs/all";
import type { Staff } from "./shops";

const DAY = 86_400_000;

/** Health of the database, jobs, errors and integrations. Never returns secret values. */
export async function systemStatus() {
  const e = env();
  const t0 = performance.now();
  await db.$queryRaw`SELECT 1`;
  const dbLatencyMs = Math.round((performance.now() - t0) * 10) / 10;
  const since = new Date(Date.now() - DAY);

  const [meta, migrations, lastRuns, failures24, recentRuns, errors24, errors, hooks, boss] = await Promise.all([
    db.$queryRaw<Array<{ version: string; size: bigint; connections: number }>>`SELECT version() AS version, pg_database_size(current_database())::bigint AS size, (SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS connections`,
    db.$queryRaw<Array<{ name: string; finished: Date | null; total: number }>>`SELECT migration_name AS name, finished_at AS finished, (SELECT COUNT(*)::int FROM "_prisma_migrations") AS total FROM "_prisma_migrations" ORDER BY finished_at DESC NULLS FIRST LIMIT 1`,
    db.$queryRaw<Array<{ name: string; status: string; startedAt: Date; durationMs: number | null; error: string | null }>>`SELECT DISTINCT ON (name) name, status, "startedAt", "durationMs", error FROM "JobRun" ORDER BY name, "startedAt" DESC`,
    db.jobRun.groupBy({ by: ["name"], where: { status: "FAILED", startedAt: { gte: since } }, _count: { _all: true } }),
    db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 40 }),
    db.errorEvent.count({ where: { createdAt: { gte: since } } }),
    db.errorEvent.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    db.webhookDelivery.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    e.JOBS_DRIVER === "pgboss"
      ? db.$queryRawUnsafe<Array<{ state: string; n: number }>>(`SELECT state::text AS state, COUNT(*)::int AS n FROM pgboss.job GROUP BY 1`).catch(() => null)
      : Promise.resolve(null),
  ]);

  const failed = new Map(failures24.map((f) => [f.name, f._count._all]));
  const jobs = listJobs().map((j) => {
    const last = lastRuns.find((r) => r.name === j.name);
    // A RUNNING row older than an hour means the process died mid-run.
    const stuck = last?.status === "RUNNING" && Date.now() - last.startedAt.getTime() > 3_600_000;
    return { ...j, last: last ? { ...last, status: stuck ? "STUCK" : last.status } : null, failed24: failed.get(j.name) ?? 0 };
  });

  const drivers = [
    { key: "storage", value: e.STORAGE_DRIVER },
    { key: "email", value: e.EMAIL_DRIVER },
    { key: "sms", value: e.SMS_DRIVER },
    { key: "jobs", value: e.JOBS_DRIVER },
    { key: "realtime", value: e.REALTIME_DRIVER },
    { key: "rateLimit", value: e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN ? "upstash" : "memory" },
  ];
  // Only whether each integration is configured — never the value.
  const integrations = [
    { key: "ai", on: !!e.GEMINI_API_KEY },
    { key: "telegram", on: !!e.TELEGRAM_BOT_TOKEN },
    { key: "google", on: !!e.GOOGLE_CLIENT_ID },
    { key: "sentry", on: !!e.SENTRY_DSN },
    { key: "push", on: !!(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY) },
    { key: "cron", on: !!e.CRON_SECRET },
    { key: "virusScan", on: !!e.VIRUS_SCAN_WEBHOOK_URL },
  ];
  const mem = process.memoryUsage();
  return {
    db: { latencyMs: dbLatencyMs, version: meta[0].version.split(" ").slice(0, 2).join(" "), sizeBytes: Number(meta[0].size), connections: meta[0].connections, migrations: migrations[0]?.total ?? 0, lastMigration: migrations[0]?.name ?? null },
    runtime: { node: process.version, env: e.NODE_ENV, demo: e.DEMO_MODE, uptimeSec: Math.round(process.uptime()), rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576) },
    drivers,
    integrations,
    jobs,
    recentRuns,
    errors24,
    errors,
    webhooks: Object.fromEntries(hooks.map((h) => [h.status, h._count._all])) as Record<string, number>,
    queue: boss ? Object.fromEntries(boss.map((b) => [b.state, b.n])) : null,
  };
}

// ── Demo data reset ───────────────────────────────────────────────────────

/** The phrase the operator must type; deliberately not translated. */
export const RESET_PHRASE = "RESET DEMO";

/** Operational history survives a reset; everything else returns to the seed. */
const PRESERVED = new Set(["_prisma_migrations", "AuditLog", "JobRun", "ErrorEvent"]);

function runSeed(): Promise<{ code: number; tail: string }> {
  const cli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const entry = path.join(process.cwd(), "prisma", "seed.ts");
  if (!existsSync(cli) || !existsSync(entry)) throw new AppError("demoResetUnavailable");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "--tsconfig", "tsconfig.json", entry], { cwd: process.cwd(), env: { ...process.env, SEED_DEMO: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const keep = (b: Buffer) => (out = (out + b.toString()).slice(-4000));
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => child.kill("SIGKILL"), 5 * 60_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, tail: out });
    });
  });
}

/**
 * Wipe the demo database and re-run the seed. Only in DEMO_MODE, only for SUPER_ADMIN
 * (`system.demo_reset`), only with the typed phrase. Plain SQL TRUNCATE inside the app, so no
 * Prisma CLI reset (and its safety prompts) is involved. Every session ends, including the caller's.
 */
export async function resetDemoData(staff: Staff, phrase: string) {
  if (!env().DEMO_MODE) throw new AppError("forbidden");
  if (phrase.trim() !== RESET_PHRASE) throw new AppError("demoResetConfirm", undefined, "phrase");
  const running = await db.jobRun.findFirst({ where: { name: "demo.reset", status: "RUNNING", startedAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
  if (running) throw new AppError("demoResetRunning");

  const run = await db.jobRun.create({ data: { name: "demo.reset", status: "RUNNING", result: { by: staff.login } } });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "system.demo_reset.started", entityType: "System" });
  const started = Date.now();
  try {
    const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`;
    const wipe = tables.map((t) => t.tablename).filter((t) => !PRESERVED.has(t));
    // Identifiers come from pg_tables, not from input; quote them anyway.
    if (wipe.length) await db.$executeRawUnsafe(`TRUNCATE TABLE ${wipe.map((t) => `"${t.replace(/"/g, '""')}"`).join(", ")} RESTART IDENTITY CASCADE`);
    const seed = await runSeed();
    if (seed.code !== 0) throw new Error(`seed exited with ${seed.code}: ${seed.tail.slice(-800)}`);
    const result = { by: staff.login, tables: wipe.length, seedLog: seed.tail.split("\n").filter(Boolean).slice(-12) };
    await db.jobRun.update({ where: { id: run.id }, data: { status: "OK", finishedAt: new Date(), durationMs: Date.now() - started, result } });
    await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "system.demo_reset.completed", entityType: "System", after: { tables: wipe.length, durationMs: Date.now() - started } });
    return { tables: wipe.length, durationMs: Date.now() - started };
  } catch (err) {
    log.error("demo reset failed", { err });
    await db.jobRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), durationMs: Date.now() - started, error: String(err).slice(0, 2000) } });
    await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "system.demo_reset.failed", entityType: "System", meta: { error: String(err).slice(0, 500) } });
    throw err instanceof AppError ? err : new AppError("demoResetFailed");
  }
}
