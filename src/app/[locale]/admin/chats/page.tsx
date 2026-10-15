import { getTranslations } from "next-intl/server";
import { Flag, MessagesSquare, ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui/display";
import { ReportActions } from "@/components/admin/support-tools";
import { fmtDateTime } from "@/lib/format-date";
import { cn } from "@/lib/cn";

const TABS = ["reports", "flagged", "recent"] as const;

/** Metadata only: message content is visible after a logged moderation-access request. */
export default async function ChatModerationPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await params;
  await requireStaff("chat.moderate");
  const t = await getTranslations("chatModeration");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "reports";
  const parties = { members: { include: { user: { select: { login: true, name: true, chatBannedAt: true } } } }, shop: { select: { name: true } } } as const;

  const [reports, flagged, recent, counts] = await Promise.all([
    tab === "reports" ? db.chatReport.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, take: 100, include: { reporter: { select: { login: true } }, message: { select: { conversationId: true, sender: { select: { login: true } }, conversation: { select: { type: true, ...parties } } } } } }) : [],
    tab === "flagged" ? db.conversation.findMany({ where: { type: "BUYER_SELLER", messages: { some: { flagged: true, deletedAt: null } } }, orderBy: { lastMessageAt: "desc" }, take: 100, include: { ...parties, _count: { select: { messages: { where: { flagged: true } } } } } }) : [],
    tab === "recent" ? db.conversation.findMany({ where: { type: "BUYER_SELLER" }, orderBy: { lastMessageAt: "desc" }, take: 100, include: { ...parties, _count: { select: { messages: true } } } }) : [],
    Promise.all([db.chatReport.count({ where: { status: "OPEN" } }), db.conversation.count({ where: { type: "BUYER_SELLER", messages: { some: { flagged: true, deletedAt: null } } } })]),
  ]);
  const who = (c: { members: Array<{ role: string; user: { login: string; chatBannedAt: Date | null } }>; shop: { name: string } | null }) => {
    const buyer = c.members.find((m) => m.role === "CUSTOMER")?.user;
    return (
      <span>
        <b>{buyer?.login ?? "—"}</b> {buyer?.chatBannedAt && <Badge tone="danger">{t("banned")}</Badge>} ↔ {c.shop?.name ?? "—"}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <nav className="flex gap-1 border-b border-border" aria-label={t("title")}>
        {TABS.map((k) => {
          const n = k === "reports" ? counts[0] : k === "flagged" ? counts[1] : 0;
          return (
            <Link key={k} href={`/admin/chats?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold", tab === k ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>
              {t(`tabs.${k}`)} {n ? <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-[#1A1A1F]">{n}</span> : null}
            </Link>
          );
        })}
      </nav>
      {tab === "reports" &&
        (reports.length ? (
          <Card className="p-2 md:p-3">
            <Table head={[t("conversation"), t("reportedUser"), t("reason"), t("reporter"), ""]}>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>
                    {who(r.message.conversation)}
                    <Link href={`/admin/chats/${r.message.conversationId}`} className="mt-0.5 block text-xs font-semibold text-primary">
                      {t("open")}
                    </Link>
                  </td>
                  <td>{r.message.sender?.login ?? "—"}</td>
                  <td>
                    <Badge tone="danger">{t(`reasons.${r.reason as "spam"}`)}</Badge>
                  </td>
                  <td className="text-xs text-muted">
                    {r.reporter.login}
                    <br />
                    {fmtDateTime(r.createdAt, locale)}
                  </td>
                  <td>
                    <ReportActions reportId={r.id} />
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        ) : (
          <EmptyState className="card" icon={<Flag className="h-8 w-8" />} title={t("noReports")} />
        ))}
      {tab !== "reports" &&
        ((tab === "flagged" ? flagged : recent).length ? (
          <Card className="p-2 md:p-3">
            <Table head={[t("conversation"), tab === "flagged" ? t("flaggedCount") : t("messages"), t("lastActivity"), ""]}>
              {(tab === "flagged" ? flagged : recent).map((c) => (
                <tr key={c.id}>
                  <td>{who(c)}</td>
                  <td className="tabular">{c._count.messages}</td>
                  <td className="text-xs text-muted">{fmtDateTime(c.lastMessageAt, locale)}</td>
                  <td>
                    <Link href={`/admin/chats/${c.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                      <ShieldAlert className="h-4 w-4" /> {t("open")}
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        ) : (
          <EmptyState className="card" icon={<MessagesSquare className="h-8 w-8" />} title={t("empty")} />
        ))}
    </div>
  );
}
