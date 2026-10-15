import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/auth/guards";
import { PageHeader } from "@/components/ui/display";
import { AccountOverview } from "@/components/account/overview";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account");
  const t = await getTranslations("account");
  return (
    <div>
      <PageHeader title={t("hello", { name: user.name ?? user.login })} />
      <AccountOverview userId={user.id} />
    </div>
  );
}
