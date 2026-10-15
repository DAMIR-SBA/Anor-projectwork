import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ForgotForm } from "@/components/auth/forms";

export default async function ForgotPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("forgotTitle")}</h1>
        <p className="mt-1 text-muted">{t("forgotSubtitle")}</p>
      </div>
      <ForgotForm />
      <Link href="/auth/login" className="block text-center text-sm font-semibold text-brand-ink hover:underline">
        ← {t("signIn")}
      </Link>
    </div>
  );
}
