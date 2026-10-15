import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { Badge, Card, PageHeader, Table } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format-date";

export default async function AdminHelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireStaff("help.manage");
  const t = await getTranslations("help");
  const rows = await db.helpArticle.findMany({ orderBy: [{ section: "asc" }, { sort: "asc" }] });
  return (
    <div className="space-y-5">
      <PageHeader
        title={t("admin.title")}
        description={t("admin.subtitle")}
        actions={
          <Link href="/admin/help/new" className={buttonClasses("primary", "sm")}>
            <Plus className="h-4 w-4" /> {t("admin.add")}
          </Link>
        }
      />
      <Card className="p-2 md:p-3">
        <Table head={[t("admin.titleUz"), t("admin.section"), "URL", t("admin.updated"), ""]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/admin/help/${r.id}`} className="font-semibold hover:underline">
                  {r.titleUz}
                </Link>
                <p className="text-xs text-muted">{r.titleRu}</p>
              </td>
              <td>{t(`sections.${r.section as "buyers"}`)}</td>
              <td className="text-xs">
                <a href={`/help/${r.slug}`} target="_blank" rel="noopener" className="text-primary">
                  /help/{r.slug}
                </a>
              </td>
              <td className="text-xs text-muted">{fmtDateTime(r.updatedAt, locale)}</td>
              <td>{!r.isPublished && <Badge>{t("admin.draft")}</Badge>}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
