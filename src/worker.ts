// Background worker: `npm run worker` (JOBS_DRIVER=pgboss). Processes queued jobs and runs
// cron schedules in Asia/Tashkent. Run it with the react-server condition so server modules load.
import "dotenv/config";
import { getBoss } from "./server/jobs/boss";
import { listJobs, runJob } from "./server/jobs/registry";
import "./server/jobs/all";

async function main() {
  const boss = await getBoss();
  for (const job of listJobs()) {
    await boss.createQueue(job.name).catch(() => {});
    await boss.work(job.name, async (batch) => {
      const items = Array.isArray(batch) ? batch : [batch];
      for (const item of items) await runJob(job.name, (item as { data?: Record<string, unknown> }).data ?? {});
    });
    if (job.cron) await boss.schedule(job.name, job.cron, {}, { tz: "Asia/Tashkent" });
  }
  console.log(`[worker] ready: ${listJobs().map((j) => j.name).join(", ")}`);
  const stop = async () => {
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
