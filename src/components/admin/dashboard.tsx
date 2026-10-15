import { getLocale } from "next-intl/server";
import { StatCard } from "@/components/ui/display";
import { db } from "@/server/db";
import { formatUZS } from "@/lib/money";
import { startOfTashkentDay } from "@/lib/dates";

/** Phase 1 dashboard: core counters. Extended with charts in the admin phase. */
export async function AdminDashboard({ permissions }: { permissions: string[] }) {
  const locale = await getLocale();
  const since = startOfTashkentDay();
  const [users, shops, orders, revenue] = await Promise.all([
    db.user.count({ where: { deletedAt: null } }),
    db.shop.count({ where: { status: "APPROVED" } }),
    db.order.count({ where: { createdAt: { gte: since } } }),
    db.order.aggregate({ _sum: { total: true }, where: { createdAt: { gte: since }, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } } }),
  ]);
  const showMoney = permissions.includes("finance.view") || permissions.includes("analytics.view");
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Users" value={users.toLocaleString("ru-RU")} />
      <StatCard label="Shops" value={shops.toLocaleString("ru-RU")} />
      <StatCard label="Orders today" value={orders.toLocaleString("ru-RU")} />
      {showMoney && <StatCard label="GMV today" value={formatUZS(revenue._sum.total ?? 0, locale)} />}
    </div>
  );
}
