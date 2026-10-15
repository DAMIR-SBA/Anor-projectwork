import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/display";
import { WalletView } from "@/components/account/wallet-view";

export default async function WalletPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/wallet");
  const t = await getTranslations("wallet");
  const wallet = await db.wallet.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
  const [txs, cards, bonuses] = await Promise.all([
    db.walletTransaction.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.savedCard.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    db.bonusPoints.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return (
    <div>
      <PageHeader title={t("title")} />
      <WalletView
        balance={wallet.balance}
        txs={txs.map((x) => ({ id: x.id, type: x.type, amount: x.amount, description: x.description, createdAt: x.createdAt.toISOString() }))}
        cards={cards.map((c) => ({ id: c.id, brand: c.brand, last4: c.last4, provider: c.provider, exp: `${String(c.expMonth).padStart(2, "0")}/${String(c.expYear).slice(-2)}` }))}
        bonusBalance={user.bonusBalance}
        bonuses={bonuses.map((b) => ({ id: b.id, amount: b.amount, reason: b.reason, expiresAt: b.expiresAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString(), remaining: b.remaining }))}
      />
    </div>
  );
}
