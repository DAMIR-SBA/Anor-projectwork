import "server-only";
import { db } from "@/server/db";
import { defineJob } from "../registry";
import { deliverBroadcast } from "@/server/services/support";
import { notify } from "@/server/notify";
import { publish } from "@/server/realtime/bus";

defineJob("broadcast.send", {
  description: "Deliver a broadcast to its segment in batches",
  handler: async (data) => deliverBroadcast(String(data?.broadcastId)),
});

defineJob("support.sla", {
  cron: "*/5 * * * *",
  description: "Escalate support tickets whose first-reply SLA is breached",
  handler: async () => {
    const late = await db.ticket.findMany({ where: { firstResponseAt: null, status: { in: ["NEW", "IN_PROGRESS"] }, slaDueAt: { lt: new Date() }, priority: { in: ["LOW", "NORMAL"] } }, select: { id: true, number: true, assigneeId: true, subject: true } });
    for (const t of late) {
      await db.ticket.update({ where: { id: t.id }, data: { priority: "HIGH", tags: { push: "sla" } } });
      if (t.assigneeId) await notify({ userId: t.assigneeId, type: "support.sla", title: `SLA #${t.number}`, body: t.subject ?? "", href: `/admin/support?t=${t.id}` });
      await publish("staff:support", "support.ticket", { ticketId: t.id });
    }
    return { escalated: late.length };
  },
});

defineJob("support.autoclose", {
  cron: "10 3 * * *",
  description: "Resolve tickets waiting for the customer for more than 3 days",
  handler: async () => {
    const stale = await db.ticket.updateMany({ where: { status: "WAITING_CUSTOMER", updatedAt: { lt: new Date(Date.now() - 3 * 86_400_000) } }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    return { resolved: stale.count };
  },
});
