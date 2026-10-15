import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { listCanned } from "@/server/services/support";
import { PageHeader } from "@/components/ui/display";
import { CannedManager } from "@/components/admin/support-tools";

export default async function CannedPage() {
  await requireStaff("support.handle");
  const t = await getTranslations("support");
  const rows = await listCanned();
  return (
    <div className="max-w-3xl">
      <Link href="/admin/support" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {t("title")}
      </Link>
      <PageHeader title={t("canned.title")} description={t("canned.subtitle")} />
      <CannedManager rows={rows.map((r) => ({ id: r.id, title: r.title, shortcut: r.shortcut, textUz: r.textUz, textRu: r.textRu }))} />
    </div>
  );
}
