import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Headset } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { Card } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/catalog/listing";
import { ArticleBody } from "@/components/help/article-body";
import { loc } from "@/lib/localized";
import { fmtDay } from "@/lib/format-date";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params;
  const a = await db.helpArticle.findUnique({ where: { slug } });
  if (!a) return {};
  return { title: loc(a, "title", locale), description: loc(a, "body", locale).slice(0, 160), alternates: { canonical: `/help/${slug}` } };
}

export default async function HelpArticlePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const a = await db.helpArticle.findUnique({ where: { slug } });
  if (!a || !a.isPublished) notFound();
  const t = await getTranslations("help");
  const related = await db.helpArticle.findMany({ where: { section: a.section, isPublished: true, NOT: { id: a.id } }, orderBy: { sort: "asc" }, take: 6 });
  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ href: "/", label: (await getTranslations("nav"))("home") }, { href: "/help", label: t("title") }, { label: loc(a, "title", locale) }]} />
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="p-6 md:p-8">
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{loc(a, "title", locale)}</h1>
          <p className="mb-5 mt-1 text-sm text-muted">{t("updated", { date: fmtDay(a.updatedAt, locale, { year: true }) })}</p>
          <ArticleBody text={loc(a, "body", locale)} />
        </Card>
        <aside className="space-y-4">
          {related.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-bold">{t(`sections.${a.section as "buyers"}`)}</h2>
              <ul className="space-y-2 text-sm">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/help/${r.slug}`} className="hover:text-primary hover:underline">
                      {loc(r, "title", locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="space-y-3 p-5">
            <p className="flex items-center gap-2 font-bold">
              <Headset className="h-5 w-5 text-primary" /> {t("stillNeed")}
            </p>
            <Link href="/chat/support" className={buttonClasses("primary", "md", "w-full")}>
              {t("writeSupport")}
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
