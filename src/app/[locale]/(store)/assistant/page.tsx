import { getTranslations, setRequestLocale } from "next-intl/server";
import { aiEnabled } from "@/server/ai/gemini";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "assistant" });
  return { title: t("metaTitle") };
}

export default async function AssistantPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("assistant");
  return (
    <div className="container-page max-w-4xl py-4 md:py-6">
      <AssistantChat aiOn={aiEnabled()} starters={[t("starter1"), t("starter2"), t("starter3"), t("starter4")]} />
      <p className="mt-2 text-center text-xs text-muted">{t("disclaimer")}</p>
    </div>
  );
}
