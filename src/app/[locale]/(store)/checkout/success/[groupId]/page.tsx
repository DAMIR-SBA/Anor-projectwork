import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2, Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { RetryPayment } from "@/components/checkout/retry-payment";

export default async function SuccessPage({ params }: { params: Promise<{ locale: string; groupId: string }> }) {
  const { locale, groupId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const t = await getTranslations("checkout");
  const group = await db.orderGroup.findFirst({ where: { id: groupId, userId: user.id }, include: { orders: true } });
  if (!group) notFound();
  const pending = group.orders.some((o) => o.status === "PENDING_PAYMENT");
  return (
    <div className="container-page max-w-xl py-12">
      <div className="card space-y-4 p-8 text-center">
        {pending ? <Clock className="mx-auto h-16 w-16 text-accent" /> : <CheckCircle2 className="mx-auto h-16 w-16 text-success" />}
        <h1 className="text-2xl font-extrabold">{pending ? t("pendingPayment") : t("successTitle")}</h1>
        <p className="text-muted">{t("successText", { number: group.number })}</p>
        {pending && <RetryPayment groupId={group.id} />}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Link href="/account/orders" className="inline-flex h-11 items-center rounded-[12px] bg-primary px-5 font-bold text-white">
            {t("toOrders")}
          </Link>
          <Link href="/" className="inline-flex h-11 items-center rounded-[12px] bg-surface-3 px-5 font-bold">
            {t("continueShopping")}
          </Link>
        </div>
      </div>
    </div>
  );
}
