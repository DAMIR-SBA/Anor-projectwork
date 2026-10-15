import "server-only";
import { env } from "@/server/env";
import { log } from "@/server/log";

/**
 * Queue a background job. JOBS_DRIVER=pgboss sends it to the pg-boss queue processed by
 * `npm run worker`; "inline" runs it after the current request in-process.
 */
export async function enqueue(name: string, data: Record<string, unknown> = {}, opts: { delaySeconds?: number } = {}) {
  if (env().JOBS_DRIVER === "pgboss") {
    const { getBoss } = await import("./boss");
    const boss = await getBoss();
    await boss.createQueue(name).catch(() => {});
    await boss.send(name, data, opts.delaySeconds ? { startAfter: opts.delaySeconds } : {});
    return;
  }
  const run = async () => {
    try {
      await import("./all");
      const { runJob } = await import("./registry");
      await runJob(name, data);
    } catch (err) {
      log.error("inline job failed", { name, err });
    }
  };
  if (opts.delaySeconds) setTimeout(run, opts.delaySeconds * 1000).unref?.();
  else setImmediate(run);
}
