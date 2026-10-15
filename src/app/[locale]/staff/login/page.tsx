import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { StaffLoginForm, DemoStaffButtons } from "@/components/staff/staff-forms";
import { FormSuccess } from "@/components/ui/form";
import { getStaffSession } from "@/server/auth/session";
import { env } from "@/server/env";

export default async function StaffLoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getStaffSession()) redirect({ href: "/admin", locale });
  const t = await getTranslations("staff");
  const sp = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{t("loginTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("loginSubtitle")}</p>
      </div>
      {sp.welcome && <FormSuccess message={t("welcome")} />}
      <StaffLoginForm />
      {env().DEMO_MODE && <DemoStaffButtons />}
    </div>
  );
}
