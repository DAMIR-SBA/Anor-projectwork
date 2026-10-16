import "server-only";
import { defineJob } from "../registry";
import { expireInvoices, expireQuotes } from "@/server/services/b2b";

defineJob("b2b.hourly", {
  cron: "20 * * * *",
  description: "Cancel bank-transfer invoices past their due date; expire unanswered and lapsed quotes",
  handler: async () => ({ ...(await expireInvoices()), ...(await expireQuotes()) }),
});
