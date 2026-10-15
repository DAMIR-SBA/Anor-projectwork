import Image from "next/image";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Package } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { Prisma } from "@/generated/prisma/client";

import type { OrderStatus } from "@/lib/order-status";

const TABS: Record<"all" | "active" | "delivered" | "cancelled", OrderStatus[] | null> = {
  all: null,
  active: ["PENDING_PAYMENT", "PLACED", "CONFIRMED", "PACKED", "SHIPPED"],
  delivered: ["DELIVERED"],
  cancelled: ["CANCELLED", "RETURNED"],
};

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/orders");
  const t = await getTranslations("orders");
  const format = await getFormatter();
  const tab = ((await searchParams).tab ?? "all") as keyof typeof TABS;
  const statuses = TABS[tab] ?? null;
  const where: Prisma.OrderWhereInput = { userId: user.id, ...(statuses ? { status: { in: statuses } } : {}) };
  const orders = await db.order.findMany({ where, orderBy: { createdAt: "desc" }, take: 50, include: { items: { take: 4 }, shop: { select: { name: true } }, _count: { select: { items: true } } } });
  return (
    <div>
      <PageHeader title={t("title")} />
      <nav className="scrollbar-none mb-4 flex gap-2 overflow-x-auto">
        {(Object.keys(TABS) as Array<keyof typeof TABS>).map((k) => (
          <Link key={k} href={`/account/orders?tab=${k}`} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-semibold", tab === k ? "bg-[#1A1A1F] text-white" : "bg-surface")}>
            {t(`tabs.${k}`)}
          </Link>
        ))}
      </nav>
      {orders.length === 0 ? (
        <EmptyState className="card" icon={<Package className="h-8 w-8" />} title={t("empty")} description={t("emptyText")} />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/account/orders/${o.id}`} className="card block p-4 transition-shadow hover:shadow-[var(--shadow-lift)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">{t("number", { number: o.number })}</p>
                    <p className="text-sm text-muted">
                      {format.dateTime(o.createdAt, "long")} · {o.shop.name}
                    </p>
                  </div>
                  <OrderStatusBadge status={o.status} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex -space-x-2">
                    {o.items.map((i) => (
                      <span key={i.id} className="relative h-14 w-14 overflow-hidden rounded-[12px] border-2 border-surface bg-surface-2">
                        {i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="56px" className="object-cover" />}
                      </span>
                    ))}
                    {o._count.items > 4 && <span className="flex h-14 w-14 items-center justify-center rounded-[12px] border-2 border-surface bg-surface-3 text-sm font-bold">+{o._count.items - 4}</span>}
                  </div>
                  <span className="tabular text-lg font-extrabold">{formatUZS(o.total, locale)}</span>
                </div>
                {o.estimatedDeliveryAt && !["DELIVERED", "CANCELLED", "RETURNED"].includes(o.status) && <p className="mt-2 text-sm font-semibold text-brand-ink">{t("eta", { date: format.dateTime(o.estimatedDeliveryAt, { day: "numeric", month: "long" }) })}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
