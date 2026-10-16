import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/auth/guards";
import { env } from "@/server/env";
import { onboardingView } from "@/server/services/seller/onboarding";
import { OnboardingWizard } from "@/components/seller/onboarding-wizard";

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/seller/onboarding");
  const view = await onboardingView(user.id);
  return <OnboardingWizard initial={view} demo={env().DEMO_MODE} locale={locale} />;
}
