import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { LoginForm, DemoButtons } from "@/components/auth/forms";
import { SocialButtons } from "@/components/auth/social-buttons";
import { FormSuccess } from "@/components/ui/form";
import { getCurrentUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { safeNext } from "@/server/auth/guards";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("signIn"), robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string; reset?: string; error?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const next = safeNext(sp.next, "/");
  if (await getCurrentUser()) redirect({ href: next, locale });
  const t = await getTranslations("auth");
  const te = await getTranslations("errors");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("loginTitle")}</h1>
        <p className="mt-1 text-muted">{t("loginSubtitle")}</p>
      </div>
      {sp.reset && <FormSuccess message={t("resetDone")} />}
      {sp.error && <p className="rounded-[12px] bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{te.has(sp.error) ? te(sp.error) : te("generic")}</p>}
      <LoginForm next={next} />
      <SocialButtons next={next} />
      {env().DEMO_MODE && <DemoButtons next={sp.next ? next : undefined} />}
      <p className="text-center text-sm text-muted">
        {t("noAccount")}{" "}
        <Link href={`/auth/register${sp.next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold text-brand-ink hover:underline">
          {t("registerTitle")}
        </Link>
      </p>
    </div>
  );
}
