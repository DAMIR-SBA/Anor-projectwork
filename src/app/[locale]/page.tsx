import { getTranslations, setRequestLocale } from "next-intl/server";
import { AnorLogo } from "@/components/brand/AnorLogo";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("brand");
  return (
    <main className="container-page py-16">
      <AnorLogo height={56} />
      <p className="mt-4 text-xl font-semibold">{t("tagline")}</p>
    </main>
  );
}
