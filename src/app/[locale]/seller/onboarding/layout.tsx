import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AnorLogo } from "@/components/brand/AnorLogo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export const metadata = { robots: { index: false } };

export default async function OnboardingLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="min-h-dvh bg-surface-2">
      <header className="border-b border-border bg-surface">
        <div className="container-page flex h-16 items-center gap-3">
          <Link href="/" aria-label="ANOR">
            <AnorLogo height={28} />
          </Link>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Seller</span>
          <span className="ml-auto flex items-center gap-1">
            <LocaleSwitcher compact />
            <ThemeToggle />
          </span>
        </div>
      </header>
      <main id="main" className="container-page py-8 md:py-12">
        {children}
      </main>
    </div>
  );
}
