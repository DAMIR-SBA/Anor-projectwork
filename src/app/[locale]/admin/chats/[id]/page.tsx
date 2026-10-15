import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { hasModerationAccess, openThread } from "@/server/services/chat";
import { Badge } from "@/components/ui/display";
import { ChatThread } from "@/components/chat/chat-thread";
import { ChatBanButton, ModerationGate, ReportActions } from "@/components/admin/support-tools";

export default async function ModerateChatPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  const staff = await requireStaff("chat.moderate");
  const t = await getTranslations("chatModeration");
  const conv = await db.conversation.findUnique({ where: { id }, include: { members: { include: { user: { select: { id: true, login: true, name: true, chatBannedAt: true } } } }, shop: { select: { name: true } } } });
  if (!conv || conv.type !== "BUYER_SELLER") notFound();
  const back = (
    <Link href="/admin/chats" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4" /> {t("title")}
    </Link>
  );
  if (!(await hasModerationAccess(staff.user.id, id))) {
    return (
      <div>
        {back}
        <ModerationGate conversationId={id} />
      </div>
    );
  }
  const thread = await openThread({ userId: staff.user.id, staff: { permissions: staff.permissions as Set<string>, login: staff.user.login } }, id);
  const reports = await db.chatReport.findMany({ where: { status: "OPEN", message: { conversationId: id } }, include: { reporter: { select: { login: true } } } });
  return (
    <div>
      {back}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-accent bg-accent/10 p-3 text-sm">
        <ShieldAlert className="h-5 w-5 text-accent" />
        <span className="flex-1">{t("loggedBanner")}</span>
        {conv.members.map((m) => (
          <ChatBanButton key={m.userId} userId={m.userId} banned={!!m.user.chatBannedAt} name={m.role === "SELLER" ? (conv.shop?.name ?? m.user.login) : m.user.login} />
        ))}
      </div>
      {reports.length > 0 && (
        <ul className="mb-3 space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-[12px] bg-danger/8 p-2.5 text-sm">
              <Badge tone="danger">{t(`reasons.${r.reason as "spam"}`)}</Badge> {r.reporter.login}
              <span className="ml-auto">
                <ReportActions reportId={r.id} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="card h-[calc(100dvh-260px)] min-h-[420px] overflow-hidden p-0">
        <ChatThread initial={thread} me={{ id: staff.user.id }} viewer="staff" canModerate />
      </div>
    </div>
  );
}
