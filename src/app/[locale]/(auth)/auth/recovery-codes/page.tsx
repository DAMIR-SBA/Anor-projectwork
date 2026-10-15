import { getTranslations, setRequestLocale } from "next-intl/server";
import { KeyRound, TriangleAlert } from "lucide-react";
import { readStashedRecoveryCodes } from "@/server/auth/user-auth";
import { safeNext } from "@/server/auth/guards";
import { RecoveryCodesActions } from "@/components/auth/recovery-codes-actions";
import { Link } from "@/i18n/navigation";

export const metadata = { robots: { index: false } };

export default async function RecoveryCodesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const next = safeNext((await searchParams).next, "/");
  const t = await getTranslations("auth");
  const codes = await readStashedRecoveryCodes();
  return (
    <div className="space-y-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-50 text-[#8a6500] dark:bg-accent/15 dark:text-accent">
        <KeyRound className="h-7 w-7" />
      </div>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("recoveryTitle")}</h1>
        <p className="mt-1 text-muted">{t("recoverySubtitle")}</p>
      </div>
      {codes ? (
        <>
          <div className="flex items-center gap-2 rounded-[12px] bg-danger/10 px-3.5 py-2.5 text-sm font-semibold text-danger">
            <TriangleAlert className="h-4 w-4" /> {t("recoveryWarning")}
          </div>
          <ol className="grid grid-cols-2 gap-2 rounded-[16px] bg-surface-2 p-4 font-mono text-[15px] font-bold tracking-wider">
            {codes.map((c, i) => (
              <li key={c} className="flex gap-2">
                <span className="w-5 text-right text-muted">{i + 1}.</span>
                {c}
              </li>
            ))}
          </ol>
          <RecoveryCodesActions codes={codes} next={next} />
        </>
      ) : (
        <div className="space-y-4">
          <p className="rounded-[12px] bg-surface-2 p-4 text-sm">{t("recoveryExpired")}</p>
          <Link href={next} className="font-bold text-brand-ink">
            →
          </Link>
        </div>
      )}
    </div>
  );
}
