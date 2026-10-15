import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookOpen, Headset, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { Card } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { loc } from "@/lib/localized";

const SECTIONS = ["buyers", "sellers", "company"] as const;

export async function generateMetadata() {
  const t = await getTranslations("help");
  return { title: t("title"), description: t("subtitle") };
}

export default async function HelpIndex({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("help");
  const q = (await searchParams).q?.trim().slice(0, 80) ?? "";
  const field = locale === "ru" ? "Ru" : "Uz";
  const articles = await db.helpArticle.findMany({
    where: { isPublished: true, ...(q ? { OR: [{ [`title${field}`]: { contains: q, mode: "insensitive" } }, { [`body${field}`]: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: [{ section: "asc" }, { sort: "asc" }],
  });
  return (
    <div className="container-page py-6 md:py-10">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{t("title")}</h1>
        <p className="mt-2 text-muted">{t("subtitle")}</p>
        <form className="relative mx-auto mt-5 max-w-xl" role="search">
          <label htmlFor="help-q" className="sr-only">
            {t("search")}
          </label>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input id="help-q" name="q" defaultValue={q} placeholder={t("search")} className="h-12 w-full rounded-full border border-border bg-surface pl-12 pr-4 text-[15px] outline-none focus:border-primary" />
        </form>
      </div>
      <div className="mx-auto mt-8 grid max-w-5xl gap-5 md:grid-cols-3">
        {SECTIONS.map((s) => {
          const list = articles.filter((a) => a.section === s);
          if (!list.length) return null;
          return (
            <Card key={s} className="p-5">
              <h2 className="mb-3 flex items-center gap-2 font-extrabold">
                <BookOpen className="h-5 w-5 text-primary" /> {t(`sections.${s}`)}
              </h2>
              <ul className="space-y-2">
                {list.map((a) => (
                  <li key={a.id}>
                    <Link href={`/help/${a.slug}`} className="text-[15px] hover:text-primary hover:underline">
                      {loc(a, "title", locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      {q && !articles.length && <p className="mt-8 text-center text-muted">{t("noResults")}</p>}
      <Card className="mx-auto mt-8 flex max-w-3xl flex-col items-center gap-3 p-6 text-center sm:flex-row sm:text-left">
        <Headset className="h-10 w-10 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="font-bold">{t("stillNeed")}</p>
          <p className="text-sm text-muted">{t("stillNeedText")}</p>
        </div>
        <Link href="/chat/support" className={buttonClasses("primary", "md")}>
          {t("writeSupport")}
        </Link>
      </Card>
    </div>
  );
}
