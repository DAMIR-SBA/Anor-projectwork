import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { segmentSize } from "@/server/services/support";
import { Badge, Card, PageHeader, Table } from "@/components/ui/display";
import { BroadcastForm } from "@/components/admin/support-tools";
import { fmtDateTime } from "@/lib/format-date";

export default async function BroadcastsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireStaff("support.broadcast");
  const t = await getTranslations("broadcasts");
  const [history, size] = await Promise.all([db.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 30 }), segmentSize("ALL")]);
  const authors = await db.user.findMany({ where: { id: { in: [...new Set(history.map((h) => h.authorId))] } }, select: { id: true, login: true } });
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <BroadcastForm initialSize={size} />
        <Card className="p-2 md:p-3">
          <h2 className="px-2 pb-2 pt-1 font-bold">{t("history")}</h2>
          <Table head={[t("titleLabel"), t("segment"), t("channels"), t("sent"), t("when")]} empty={history.length ? null : <p className="p-4 text-sm text-muted">{t("empty")}</p>}>
            {history.map((h) => (
              <tr key={h.id} className="align-top">
                <td className="max-w-64">
                  <p className="font-semibold">{h.title}</p>
                  <p className="line-clamp-2 text-xs text-muted">{h.body}</p>
                </td>
                <td>
                  <Badge>{t(`segments.${h.segment as "ALL"}`)}</Badge>
                </td>
                <td className="text-xs">{h.channels.map((c) => t(`channelNames.${c as "inapp"}`)).join(", ")}</td>
                <td className="tabular">{h.sentCount}</td>
                <td className="whitespace-nowrap text-xs text-muted">
                  {fmtDateTime(h.createdAt, locale)}
                  <br />
                  {authors.find((a) => a.id === h.authorId)?.login}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}
