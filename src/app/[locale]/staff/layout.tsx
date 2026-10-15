import { AnorLogo } from "@/components/brand/AnorLogo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

export const metadata = { robots: { index: false, follow: false } };

/** Hidden staff area shell (not linked from the public UI). */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#141418] text-[#F2F2F5]">
      <header className="flex items-center justify-between p-4 md:p-6">
        <div className="flex items-center gap-3">
          <AnorLogo tone="white" height={30} />
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white/80">Staff</span>
        </div>
        <LocaleSwitcher className="text-white hover:bg-white/10 [&_option]:text-black" />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 md:items-center">
        <div className="w-full max-w-[440px] rounded-[20px] bg-surface p-6 text-fg shadow-[var(--shadow-lift)] md:p-8">{children}</div>
      </main>
    </div>
  );
}
