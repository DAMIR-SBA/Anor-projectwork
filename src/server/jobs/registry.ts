import "server-only";
import { db } from "@/server/db";
import { log } from "@/server/log";

export type JobHandler = (data?: Record<string, unknown>) => Promise<unknown>;
type JobDef = { handler: JobHandler; cron?: string; description: string };

const jobs = new Map<string, JobDef>();

export function defineJob(name: string, def: JobDef) {
  jobs.set(name, def);
}

export function listJobs() {
  return [...jobs.entries()].map(([name, d]) => ({ name, cron: d.cron, description: d.description }));
}

export function getJob(name: string) {
  return jobs.get(name);
}

/** Run a job now, recording a JobRun row (status page). */
export async function runJob(name: string, data?: Record<string, unknown>) {
  const def = jobs.get(name);
  if (!def) throw new Error(`Unknown job ${name}`);
  const run = await db.jobRun.create({ data: { name, status: "RUNNING" } });
  const started = Date.now();
  try {
    const result = await def.handler(data);
    await db.jobRun.update({ where: { id: run.id }, data: { status: "OK", finishedAt: new Date(), durationMs: Date.now() - started, result: (result ?? null) as object } });
    return result;
  } catch (err) {
    log.error("job failed", { name, err });
    await db.jobRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), durationMs: Date.now() - started, error: String(err).slice(0, 2000) } });
    throw err;
  }
}
