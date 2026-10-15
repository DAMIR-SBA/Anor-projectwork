import { notFound } from "next/navigation";
import { getFormatter, setRequestLocale } from "next-intl/server";
import { BadgeCheck } from "lucide-react";
import { db } from "@/server/db";
import { safeEqual } from "@/server/security/crypto";
import { formatUZS } from "@/lib/money";

export const metadata = { robots: { index: false } };

/** Public receipt verification (target of the fiscal QR). Requires the fiscal sign from the QR. */
export default async function ReceiptVerify({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ s?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const s = (await searchParams).s ?? "";
  const r = await db.fiscalReceipt.findUnique({ where: { orderId: id }, include: { order: { include: { shop: true } } } });
  if (!r || !safeEqual(r.fiscalSign, s)) notFound();
  const format = await getFormatter();
  return (
    <div className="container-page max-w-md py-10">
      <div className="card space-y-2 p-6 text-sm">
        <p className="flex items-center gap-2 text-lg font-extrabold text-success">
          <BadgeCheck className="h-6 w-6" /> Fiscal receipt valid
        </p>
        <p>№ {r.receiptNo}</p>
        <p>{r.order.shop.legalName ?? r.order.shop.name} · STIR {r.order.shop.taxId}</p>
        <p>{format.dateTime(r.issuedAt, "long")}</p>
        <p className="text-xl font-extrabold">{formatUZS(r.total, locale)}</p>
        <p className="text-muted">FB {r.fiscalSign} · {r.terminalId}</p>
      </div>
    </div>
  );
}
