import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, StatCard } from "@/components/ui/display";
import { PlatformCharts } from "@/components/admin/analytics-charts";
import { gmvSeries } from "@/server/services/admin/analytics";
import { db } from "@/server/db";
import { formatUZS } from "@/lib/money";
import { startOfTashkentDay } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { Permission } from "@/lib/rbac";

const HOUR = 3_600_000;
const COUNTED = { notIn: ["CANCELLED", "PENDING_PAYMENT"] as Array<"CANCELLED" | "PENDING_PAYMENT"> };

/** Count only when the viewer may act on it; otherwise skip the query entirely. */
const gate = <T,>(ok: boolean, q: () => Promise<T>) => (ok ? q() : Promise.resolve(null));

/** Today's numbers, the work queues and SLA alerts — each block shown only with its permission. */
export async function AdminDashboard({ permissions }: { permissions: string[] }) {
  const locale = await getLocale();
  const t = await getTranslations("adminDashboard");
  const has = (p: Permission) => permissions.includes(p);
  const now = new Date();
  const today = startOfTashkentDay(now);
  // Same span of yesterday (midnight → this time), so the morning isn't compared with a full day.
  const yStart = new Date(today.getTime() - 24 * HOUR);
  const yNow = new Date(now.getTime() - 24 * HOUR);
  const money = has("finance.view") || has("analytics.view");

  const [users, usersY, shops, ordersT, ordersY, gmvT, gmvY, series, q, sla, system] = await Promise.all([
    db.user.count({ where: { deletedAt: null, staffProfile: null, createdAt: { gte: today } } }),
    db.user.count({ where: { deletedAt: null, staffProfile: null, createdAt: { gte: yStart, lt: yNow } } }),
    db.shop.count({ where: { status: "APPROVED" } }),
    db.order.count({ where: { createdAt: { gte: today }, status: COUNTED } }),
    db.order.count({ where: { createdAt: { gte: yStart, lt: yNow }, status: COUNTED } }),
    gate(money, () => db.order.aggregate({ _sum: { total: true }, where: { createdAt: { gte: today }, status: COUNTED } })),
    gate(money, () => db.order.aggregate({ _sum: { total: true }, where: { createdAt: { gte: yStart, lt: yNow }, status: COUNTED } })),
    gate(money, () => gmvSeries(14)),
    Promise.all([
      gate(has("shops.moderate"), () => db.shop.count({ where: { status: "PENDING" } })),
      gate(has("products.moderate"), () => db.product.count({ where: { status: "PENDING", deletedAt: null } })),
      gate(has("reviews.moderate"), () => db.review.count({ where: { status: "PENDING" } })),
      gate(has("disputes.manage"), () => db.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } })),
      gate(has("returns.manage"), () => db.return.count({ where: { status: "REQUESTED" } })),
      gate(has("fraud.manage"), () => db.fraudFlag.count({ where: { status: "OPEN" } })),
      gate(has("support.handle"), () => db.ticket.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } })),
      gate(has("logistics.manage"), () => db.supplyRequest.count({ where: { status: { in: ["CREATED", "ACCEPTED", "RECEIVED"] } } })),
      gate(has("promos.manage"), () => db.campaignProduct.count({ where: { status: "PENDING", campaign: { status: { in: ["SCHEDULED", "ACTIVE"] } } } })),
    ]),
    Promise.all([
      gate(has("logistics.manage"), () => db.shipment.count({ where: { status: "AWAITING_HANDOVER", handoverDeadline: { lt: now } } })),
      gate(has("logistics.manage"), () => db.order.count({ where: { status: "SHIPPED", estimatedDeliveryAt: { lt: now } } })),
      gate(has("logistics.manage"), () => db.shipment.count({ where: { courierId: null, status: { in: ["IN_TRANSIT", "PENDING"] }, type: { in: ["COURIER", "EXPRESS"] }, order: { status: "SHIPPED" } } })),
      gate(has("orders.view"), () => db.order.count({ where: { status: "PLACED", createdAt: { lt: new Date(now.getTime() - 24 * HOUR) } } })),
      gate(has("support.handle"), () => db.ticket.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] }, firstResponseAt: null, slaDueAt: { lt: now } } })),
    ]),
    gate(has("system.status"), () => Promise.all([db.jobRun.count({ where: { status: "FAILED", startedAt: { gte: new Date(now.getTime() - 24 * HOUR) } } }), db.errorEvent.count({ where: { createdAt: { gte: new Date(now.getTime() - 24 * HOUR) } } })])),
  ]);

  const trend = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);
  const queues = [
    { key: "shops", n: q[0], href: "/admin/moderation/shops" },
    { key: "products", n: q[1], href: "/admin/moderation/products" },
    { key: "reviews", n: q[2], href: "/admin/moderation/reviews" },
    { key: "disputes", n: q[3], href: "/admin/disputes" },
    { key: "returns", n: q[4], href: "/admin/returns" },
    { key: "fraud", n: q[5], href: "/admin/fraud" },
    { key: "tickets", n: q[6], href: "/admin/support" },
    { key: "supplies", n: q[7], href: "/admin/logistics?tab=supplies" },
    { key: "participants", n: q[8], href: "/admin/campaigns" },
  ].filter((x): x is { key: string; n: number; href: string } => x.n !== null);
  const alerts = [
    { key: "lateHandover", n: sla[0], href: "/admin/logistics" },
    { key: "lateDelivery", n: sla[1], href: "/admin/logistics" },
    { key: "unassigned", n: sla[2], href: "/admin/logistics?tab=couriers" },
    { key: "unconfirmed", n: sla[3], href: "/admin/orders?tab=attention" },
    { key: "ticketSla", n: sla[4], href: "/admin/support" },
    { key: "failedJobs", n: system?.[0] ?? null, href: "/admin/status" },
    { key: "errors", n: system?.[1] ?? null, href: "/admin/status" },
  ].filter((x): x is { key: string; n: number; href: string } => !!x.n);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {money && <StatCard label={t("gmvToday")} value={formatUZS(gmvT?._sum.total ?? 0, locale)} trend={trend(gmvT?._sum.total ?? 0, gmvY?._sum.total ?? 0)} hint={t("vsYesterday")} />}
        <StatCard label={t("ordersToday")} value={ordersT.toLocaleString("ru-RU")} trend={trend(ordersT, ordersY)} hint={t("vsYesterday")} />
        <StatCard label={t("newUsers")} value={users.toLocaleString("ru-RU")} trend={trend(users, usersY)} hint={t("vsYesterday")} />
        <StatCard label={t("liveShops")} value={shops.toLocaleString("ru-RU")} />
      </div>

      {alerts.length > 0 && (
        <section aria-labelledby="dash-alerts" className="rounded-[16px] border border-danger/30 bg-danger/5 p-4">
          <h2 id="dash-alerts" className="mb-2 flex items-center gap-2 font-bold text-danger">
            <AlertTriangle className="h-5 w-5" /> {t("alertsTitle")}
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {alerts.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="flex items-center justify-between gap-2 rounded-[12px] bg-surface px-3 py-2 text-sm font-semibold hover:shadow-[var(--shadow-soft)]">
                  <span>{t(`alerts.${a.key}`, { n: a.n })}</span>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={cn("grid grid-cols-1 items-start gap-5", series && queues.length ? "xl:grid-cols-[1.4fr_1fr]" : "")}>
        {series && (
          <Card className="min-w-0 p-5">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="font-bold">{t("gmv14")}</h2>
              {has("analytics.view") && (
                <Link href="/admin/analytics" className="text-sm font-semibold text-primary">
                  {t("openAnalytics")}
                </Link>
              )}
            </div>
            <PlatformCharts series={series} only="gmv" />
          </Card>
        )}
        {queues.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("queuesTitle")}</h2>
            <ul className="divide-y divide-border">
              {queues.map((x) => (
                <li key={x.key}>
                  <Link href={x.href} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-primary">
                    <span className="font-medium">{t(`queues.${x.key}`)}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold tabular", x.n ? "bg-primary text-white" : "bg-surface-3 text-muted")}>{x.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
