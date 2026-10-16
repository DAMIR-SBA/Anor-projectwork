import { getTranslations, setRequestLocale } from "next-intl/server";
import { Store } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { env } from "@/server/env";
import { onboardingView } from "@/server/services/seller/onboarding";
import { platformSettings } from "@/server/services/platform";
import { OnboardingWizard } from "@/components/seller/onboarding-wizard";
import { EmptyState } from "@/components/ui/display";

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/seller/onboarding");
  const [view, platform] = await Promise.all([onboardingView(user.id), platformSettings()]);
  // Closed sign-ups stop new applications; one already started can still be finished.
  if (!view && !platform.sellerSignupOpen) {
    const t = await getTranslations("sellerOnboarding");
    return <EmptyState className="py-16" icon={<Store className="h-8 w-8" />} title={t("closedTitle")} description={t("closedText")} />;
  }
  return <OnboardingWizard initial={view} demo={env().DEMO_MODE} locale={locale} />;
}
