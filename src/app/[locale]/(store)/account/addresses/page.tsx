import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/display";
import { AddressesView } from "@/components/account/addresses-view";

export default async function AddressesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/addresses");
  const t = await getTranslations("addresses");
  const addresses = await db.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  return (
    <div>
      <PageHeader title={t("title")} />
      <AddressesView addresses={addresses} defaults={{ recipient: user.name, phone: user.phone }} />
    </div>
  );
}
