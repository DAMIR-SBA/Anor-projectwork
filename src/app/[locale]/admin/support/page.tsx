import { requireStaff } from "@/server/auth/guards";
import { AppError } from "@/server/action";
import { listCanned, listTickets, supportAgents, ticketCounts, ticketDetailView } from "@/server/services/support";
import { openThread } from "@/server/services/chat";
import { db } from "@/server/db";
import { SupportDesk } from "@/components/admin/support-desk";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const staff = await requireStaff("support.handle");
  const { t: ticketId } = await searchParams;
  const [initial, counts, agents, canned] = await Promise.all([listTickets({ view: "open" }, staff.user.id), ticketCounts(staff.user.id), supportAgents(), listCanned()]);
  let active = null;
  if (ticketId) {
    const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { conversationId: true } });
    if (ticket) {
      try {
        const [thread, detail] = await Promise.all([openThread({ userId: staff.user.id, staff: { permissions: staff.permissions as Set<string>, login: staff.user.login } }, ticket.conversationId), ticketDetailView(ticketId)]);
        active = { ticketId, thread, detail };
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
      }
    }
  }
  return (
    <div className="-mx-4 -mb-4 -mt-6 md:-m-6 lg:-m-8">
      <SupportDesk me={{ id: staff.user.id }} initial={initial} counts={counts} agents={agents} canned={canned.map((c) => ({ id: c.id, title: c.title, shortcut: c.shortcut, textUz: c.textUz, textRu: c.textRu }))} initialActive={active} />
    </div>
  );
}
