import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { StatCard } from "@/components/ui/display";
import { formatUZS } from "@/lib/money";

/** Account dashboard tiles; enriched as more phases land (orders, nasiya, rewards). */
export async function AccountOverview({ userId }: { userId: string }) {
  const locale = await getLocale();
  const t = await getTranslations("account.nav");
  const [user, wallet, orders] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { bonusBalance: true, loyaltyTier: true, nasiyaLimit: true, nasiyaUsed: true } }),
    db.wallet.findUnique({ where: { userId } }),
    db.order.count({ where: { userId } }),
  ]);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label={t("wallet")} value={formatUZS(wallet?.balance ?? 0, locale)} />
      <StatCard label={t("bonus")} value={user.bonusBalance.toLocaleString("ru-RU")} hint={user.loyaltyTier} />
      <StatCard label={t("orders")} value={orders} />
      <StatCard label={t("nasiya")} value={formatUZS(Math.max(0, user.nasiyaLimit - user.nasiyaUsed), locale)} />
    </div>
  );
}
