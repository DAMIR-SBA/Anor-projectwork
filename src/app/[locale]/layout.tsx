import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { ThemeScript } from "@/components/layout/theme-script";
import { ogImage } from "@/server/og";
import { ToastProvider } from "@/components/ui/toast";
import { PwaRegister } from "@/components/pwa/pwa";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "brand" });
  return {
    metadataBase: new URL(APP_URL),
    title: { default: `ANOR — ${t("tagline")}`, template: "%s · ANOR" },
    description: t("description"),
    applicationName: "ANOR",
    manifest: "/manifest.webmanifest",
    openGraph: { siteName: "ANOR", type: "website", locale: locale === "ru" ? "ru_RU" : "uz_UZ", images: [ogImage("/api/og", locale, `ANOR — ${t("tagline")}`)] },
    twitter: { card: "summary_large_image" },
    alternates: {
      languages: { uz: "/", "uz-Cyrl": "/oz", ru: "/ru" },
    },
    appleWebApp: { capable: true, title: "ANOR", statusBarStyle: "default" },
    icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#C8102E" },
    { media: "(prefers-color-scheme: dark)", color: "#141418" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const theme = (await cookies()).get("anor_theme")?.value;

  return (
    <html lang={locale} className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <ToastProvider>{children}</ToastProvider>
          <PwaRegister />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
