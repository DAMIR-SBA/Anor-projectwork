import { getTranslations, setRequestLocale } from "next-intl/server";
import { env } from "@/server/env";
import { TelegramMiniApp } from "@/components/telegram/mini-app";
import { AnorLogo } from "@/components/brand/AnorLogo";

export const metadata = { robots: { index: false } };

/** Telegram Mini App entry: validates initData, signs in, then opens the storefront. */
export default async function MiniAppPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("telegramBot");
  const e = env();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface-2 p-6 text-center">
      <AnorLogo height={40} />
      <TelegramMiniApp configured={!!e.TELEGRAM_BOT_TOKEN} demo={e.DEMO_MODE} labels={{ signingIn: t("miniSigningIn"), notTelegram: t("miniNotTelegram"), failed: t("miniFailed"), demo: t("miniDemo"), open: t("miniOpenSite") }} />
    </main>
  );
}
