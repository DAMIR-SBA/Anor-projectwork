import "server-only";
import { defineJob } from "../registry";
import { tickCampaigns } from "@/server/services/admin/marketing";

defineJob("campaigns.tick", { cron: "*/5 * * * *", description: "Start/end campaigns by date and schedule next year's seasonal editions", handler: () => tickCampaigns() });

defineJob("fraud.scan", {
  cron: "30 3 * * *",
  description: "Detect duplicate accounts, price manipulation and serial returners",
  handler: async () => (await import("@/server/services/admin/fraud")).runFraudScan(),
});
