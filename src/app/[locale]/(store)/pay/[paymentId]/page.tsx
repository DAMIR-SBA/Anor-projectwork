import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { PROVIDERS } from "@/server/payments/providers";
import { MockGateway } from "@/components/checkout/mock-gateway";

export const metadata = { robots: { index: false } };

/** Hosted payment page of the mock providers (stands in for Click/Payme/acquirer pages). */
export default async function PayPage({ params }: { params: Promise<{ locale: string; paymentId: string }> }) {
  const { locale, paymentId } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/pay/${paymentId}`);
  const payment = await db.payment.findFirst({ where: { id: paymentId, userId: user.id }, include: { savedCard: true } });
  if (!payment) notFound();
  const t = await getTranslations("pay");
  return (
    <div className="container-page max-w-md py-10">
      <MockGateway
        payment={{ id: payment.id, amount: payment.amount, status: payment.status, purpose: payment.purpose, groupId: payment.groupId, provider: PROVIDERS[payment.method].label, card: payment.savedCard ? `${payment.savedCard.brand} •••• ${payment.savedCard.last4}` : null }}
        testModeLabel={t("testMode")}
      />
    </div>
  );
}
