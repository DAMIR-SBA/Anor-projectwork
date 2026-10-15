import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/display";
import { HelpEditor } from "@/components/admin/help-editor";

export default async function EditHelpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff("help.manage");
  const t = await getTranslations("help.admin");
  const a = id === "new" ? null : await db.helpArticle.findUnique({ where: { id } });
  if (id !== "new" && !a) notFound();
  return (
    <div className="max-w-6xl">
      <Link href="/admin/help" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {t("title")}
      </Link>
      <PageHeader title={a ? a.titleUz : t("add")} />
      <HelpEditor initial={a ? { id: a.id, slug: a.slug, section: a.section as "buyers", titleUz: a.titleUz, titleRu: a.titleRu, bodyUz: a.bodyUz, bodyRu: a.bodyRu, sort: a.sort, isPublished: a.isPublished } : { slug: "", section: "buyers", titleUz: "", titleRu: "", bodyUz: "", bodyRu: "", sort: 0, isPublished: true }} />
    </div>
  );
}
