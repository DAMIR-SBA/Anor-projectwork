import "server-only";
import { defineJob } from "../registry";

defineJob("nasiya.daily", {
  cron: "0 9 * * *",
  description: "Nasiya payment reminders and overdue installments",
  handler: async () => (await import("@/server/services/nasiya")).nasiyaDaily(),
});

defineJob("plus.daily", {
  cron: "20 8 * * *",
  description: "ANOR Plus renewal reminders, auto-renewal charges and expiry",
  handler: async () => (await import("@/server/services/plus")).plusDaily(),
});
