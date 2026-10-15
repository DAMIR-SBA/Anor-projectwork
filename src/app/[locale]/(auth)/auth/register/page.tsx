import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { RegisterForm } from "@/components/auth/forms";
import { SocialButtons } from "@/components/auth/social-buttons";
import { getCurrentUser } from "@/server/auth/session";
import { safeNext } from "@/server/auth/guards";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("registerTitle"), robots: { index: false } };
}

export default async function RegisterPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string; ref?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const next = safeNext(sp.next, "/");
  if (await getCurrentUser()) redirect({ href: next, locale });
  const t = await getTranslations("auth");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("registerTitle")}</h1>
        <p className="mt-1 text-muted">{t("registerSubtitle")}</p>
      </div>
      <RegisterForm next={next} referral={sp.ref} />
      <SocialButtons next={next} />
      <p className="text-center text-sm text-muted">
        {t("haveAccount")}{" "}
        <Link href="/auth/login" className="font-bold text-brand-ink hover:underline">
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}
