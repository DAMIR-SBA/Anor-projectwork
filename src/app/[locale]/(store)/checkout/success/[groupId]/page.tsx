import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2, Clock, Landmark } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { RetryPayment } from "@/components/checkout/retry-payment";
import { formatUZS } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";

export default async function SuccessPage({ params }: { params: Promise<{ locale: string; groupId: string }> }) {
  const { locale, groupId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const t = await getTranslations("checkout");
  const group = await db.orderGroup.findFirst({ where: { id: groupId, userId: user.id }, include: { orders: true, invoice: true } });
  if (!group) notFound();
  const pending = group.orders.some((o) => o.status === "PENDING_PAYMENT");
  return (
    <div className="container-page max-w-xl py-12">
      <div className="card space-y-4 p-8 text-center">
        {pending ? <Clock className="mx-auto h-16 w-16 text-accent" /> : <CheckCircle2 className="mx-auto h-16 w-16 text-success" />}
        <h1 className="text-2xl font-extrabold">{pending ? t("pendingPayment") : t("successTitle")}</h1>
        <p className="text-muted">{t("successText", { number: group.number })}</p>
        {pending && group.invoice ? (
          <div className="space-y-2 rounded-[14px] bg-surface-2 p-4 text-left text-sm">
            <p className="flex items-center gap-2 font-bold">
              <Landmark className="h-4 w-4 text-primary" aria-hidden="true" /> {t("invoiceIssued", { number: group.invoice.number })}
            </p>
            <p>{t("invoiceAmount", { amount: formatUZS(group.invoice.amount, locale), date: fmtDay(group.invoice.dueDate.toISOString(), locale) })}</p>
            <p className="text-muted">{t("invoiceHint")}</p>
            <a href={`/api/invoices/${group.invoice.id}?locale=${locale === "ru" ? "ru" : "uz"}`} target="_blank" rel="noopener" className="inline-flex h-10 items-center rounded-[12px] bg-[#1A1A1F] px-4 font-bold text-white">
              {t("invoiceDownload")}
            </a>
          </div>
        ) : (
          pending && <RetryPayment groupId={group.id} />
        )}
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
