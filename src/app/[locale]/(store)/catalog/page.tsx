import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCategoryTree } from "@/server/services/categories";
import { CatalogListing, type SearchParams } from "@/components/catalog/listing";
import { CategoryIcon } from "@/components/catalog/category-icon";
import { loc } from "@/lib/localized";

export async function generateMetadata() {
  const t = await getTranslations("catalog");
  return { title: t("title") };
}

export default async function CatalogPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<SearchParams> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");
  const tree = await getCategoryTree();
  const sp = await searchParams;
  return (
    <div className="container-page space-y-6 py-5">
      <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{t("allCategories")}</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tree.map((c) => (
          <section key={c.id} className="card p-4">
            <Link href={`/c/${c.slug}`} className="mb-2 flex items-center gap-3 text-lg font-bold hover:text-primary">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary dark:bg-primary/15">
                <CategoryIcon name={c.icon} className="h-5 w-5" />
              </span>
              {loc(c, "name", locale)}
            </Link>
            <ul className="space-y-1 pl-[52px] text-sm">
              {c.children.map((s) => (
                <li key={s.id}>
                  <Link href={`/c/${s.slug}`} className="text-muted hover:text-fg">
                    {loc(s, "name", locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {(sp.sort || sp.q) && <CatalogListing base={{}} searchParams={sp} />}
    </div>
  );
}
