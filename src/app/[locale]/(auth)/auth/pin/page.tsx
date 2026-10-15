import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { PinForm } from "@/components/auth/forms";
import { getUserSession } from "@/server/auth/session";
import { safeNext } from "@/server/auth/guards";

export default async function PinPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const next = safeNext((await searchParams).next, "/");
  const s = await getUserSession();
  if (!s) redirect({ href: "/auth/login", locale });
  else if (!s.needsPin) redirect({ href: next, locale });
  const t = await getTranslations("auth");
  return (
    <div className="space-y-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary dark:bg-primary/15">
        <ShieldCheck className="h-7 w-7" />
      </div>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("pinTitle")}</h1>
        <p className="mt-1 text-muted">{t("pinSubtitle")}</p>
      </div>
      <PinForm next={next} />
      <Link href="/auth/forgot" className="block text-center text-sm font-semibold text-brand-ink hover:underline">
        {t("pinForgot")}
      </Link>
    </div>
  );
}
