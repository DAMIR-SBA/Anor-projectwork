import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireShop } from "@/server/auth/guards";
import { academyOverview, tierStatus } from "@/server/services/seller/academy";
import { PageHeader } from "@/components/ui/display";
import { CourseCard, ProPanel } from "@/components/seller/academy-views";

export default async function SellerAcademyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { shop } = await requireShop("/seller/academy");
  const t = await getTranslations("sellerAcademy");
  const [courses, tier] = await Promise.all([academyOverview(shop.id, locale), tierStatus(shop.id)]);
  const passed = courses.filter((c) => c.passed).length;
  return (
    <div>
      <PageHeader title={t("title")} description={t("subtitle", { passed, total: courses.length })} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ul className="space-y-3">
          {courses.map((c) => (
            <CourseCard key={c.key} course={c} />
          ))}
        </ul>
        <div className="lg:sticky lg:top-20">
          <ProPanel tier={tier} />
        </div>
      </div>
    </div>
  );
}
