import { getTranslations, setRequestLocale } from "next-intl/server";
import { Camera } from "lucide-react";
import { imageSearchAction } from "@/server/actions/search";
import { aiEnabled } from "@/server/ai/gemini";
import { Button } from "@/components/ui/button";

export default async function ImageSearchPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");
  const te = await getTranslations("errors");
  const sp = await searchParams;
  return (
    <div className="container-page max-w-xl py-10">
      <div className="card space-y-5 p-6 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary dark:bg-primary/15">
          <Camera className="h-8 w-8" />
        </span>
        <h1 className="text-2xl font-extrabold">{t("imageSearch")}</h1>
        <p className="text-muted">{t("imageSearchText")}</p>
        {!aiEnabled() && <p className="rounded-[12px] bg-accent-50 p-3 text-sm dark:bg-accent/10">{t("imageSearchFallback")}</p>}
        {sp.error && <p className="text-sm text-danger">{te("invalidInput")}</p>}
        <form action={imageSearchAction} className="space-y-3">
          <input type="file" name="image" accept="image/jpeg,image/png,image/webp" capture="environment" required className="block w-full rounded-[12px] border border-dashed border-border p-6 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-semibold file:text-white" />
          <Button type="submit" size="lg" className="w-full">
            {t("uploadImage")}
          </Button>
        </form>
      </div>
    </div>
  );
}
