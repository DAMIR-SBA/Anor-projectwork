// Run jobs once from the command line, outside the worker and without HTTP:
//   npm run job -- campaigns.tick          one job
//   npm run job -- --scheduled             every job that has a cron schedule
//   npm run job -- --list                  names and schedules
// Each run is recorded like a worker run (Admin → Status).
import "dotenv/config";
import { getJob, listJobs, runJob } from "@/server/jobs/registry";
import "@/server/jobs/all";

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--list")) {
    for (const j of listJobs()) console.log(`${j.name.padEnd(26)} ${(j.cron ?? "(on demand)").padEnd(14)} ${j.description ?? ""}`);
    return;
  }
  const names = args.includes("--scheduled") ? listJobs().filter((j) => j.cron).map((j) => j.name) : args;
  let failed = 0;
  for (const name of names) {
    if (!getJob(name)) {
      console.error(`unknown job: ${name}`);
      failed++;
      continue;
    }
    const started = Date.now();
    try {
      const result = await runJob(name);
      console.log(`ok     ${name} (${Date.now() - started} ms) ${JSON.stringify(result ?? null).slice(0, 160)}`);
    } catch (err) {
      failed++;
      console.error(`failed ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 100));
