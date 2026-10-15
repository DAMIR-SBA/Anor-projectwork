import { getFormatter, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { Badge, Card, PageHeader, Table } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";

const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; actor?: string; page?: string }> }) {
  const staff = await requireStaff("audit.view");
  const t = await getTranslations("admin");
  const tc = await getTranslations("common");
  const format = await getFormatter();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = {
    ...(sp.action ? { action: { contains: sp.action } } : {}),
    ...(sp.actor ? { actorLogin: { contains: sp.actor.toLowerCase() } } : {}),
  };
  const [rows, total] = await Promise.all([db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE }), db.auditLog.count({ where })]);
  const qs = new URLSearchParams(Object.entries({ action: sp.action ?? "", actor: sp.actor ?? "" }).filter(([, v]) => v)).toString();

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("auditTitle")}
        description={t("auditSubtitle")}
        actions={
          staff.permissions.has("audit.export") && (
            <>
              <a href={`/api/admin/audit/export?format=csv&${qs}`} className="inline-flex h-9 items-center gap-1.5 rounded-[12px] border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-2">
                <Download className="h-4 w-4" /> {t("exportCsv")}
              </a>
              <a href={`/api/admin/audit/export?format=xlsx&${qs}`} className="inline-flex h-9 items-center gap-1.5 rounded-[12px] border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-2">
                <Download className="h-4 w-4" /> {t("exportXlsx")}
              </a>
            </>
          )
        }
      />
      <form className="flex flex-wrap gap-2" method="get">
        <Input name="action" defaultValue={sp.action} placeholder={t("filterAction")} className="h-10 max-w-60" />
        <Input name="actor" defaultValue={sp.actor} placeholder={t("filterActor")} className="h-10 max-w-60" />
        <Button type="submit" size="sm" variant="secondary">
          {tc("apply")}
        </Button>
      </form>
      <Card className="p-2 md:p-3">
        <Table head={[tc("date"), t("actor"), t("action"), t("entity"), "IP", t("changes")]}>
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="whitespace-nowrap text-xs text-muted">{format.dateTime(r.createdAt, "long")}</td>
              <td className="font-semibold">{r.actorLogin ?? "system"}</td>
              <td>
                <Badge tone={r.action.includes("failed") ? "danger" : "neutral"}>{r.action}</Badge>
              </td>
              <td className="text-xs">
                {r.entityType} <span className="text-muted">{r.entityId?.slice(0, 10)}</span>
              </td>
              <td className="text-xs text-muted">{r.ip}</td>
              <td className="max-w-md text-xs">
                {(r.before || r.after || r.meta) && (
                  <details>
                    <summary className="cursor-pointer text-brand-ink">{tc("details")}</summary>
                    {r.before != null && (
                      <pre className="mt-1 overflow-x-auto rounded bg-surface-2 p-2">
                        {t("before")}: {JSON.stringify(r.before, null, 1)}
                      </pre>
                    )}
                    {r.after != null && (
                      <pre className="mt-1 overflow-x-auto rounded bg-surface-2 p-2">
                        {t("after")}: {JSON.stringify(r.after, null, 1)}
                      </pre>
                    )}
                    {r.meta != null && <pre className="mt-1 overflow-x-auto rounded bg-surface-2 p-2">{JSON.stringify(r.meta, null, 1)}</pre>}
                  </details>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      <Pagination page={page} total={total} pageSize={PAGE} />
    </div>
  );
}
