import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AnorLogo } from "@/components/brand/AnorLogo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("auth");
  const points = t("brandPanelPoints").split("|");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" aria-label="ANOR">
          <AnorLogo tone="white" height={40} />
        </Link>
        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight">{t("brandPanelTitle")}</h2>
          <ul className="mt-8 space-y-4 text-lg">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                  <Check className="h-4 w-4" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-sm text-white/90">© ANOR</p>
        {/* Decorative pomegranate seeds */}
        <div aria-hidden className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-primary-dark" />
        <div aria-hidden className="absolute bottom-24 right-24 h-10 w-10 rounded-full bg-accent" />
        <div aria-hidden className="absolute bottom-40 right-44 h-8 w-8 rounded-full bg-accent/80" />
        <div aria-hidden className="absolute bottom-16 right-52 h-7 w-7 rounded-full bg-accent/70" />
      </aside>
      <main id="main" className="flex flex-col bg-surface">
        <div className="flex items-center justify-between p-4 md:p-6">
          <Link href="/" className="lg:invisible" aria-label="ANOR">
            <AnorLogo height={32} />
          </Link>
          <LocaleSwitcher />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 md:items-center">
          <div className="w-full max-w-[440px]">{children}</div>
        </div>
      </main>
    </div>
  );
}
