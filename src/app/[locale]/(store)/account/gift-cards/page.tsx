import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Gift } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { CopyButton } from "@/components/ui/interactive";
import { formatUZS } from "@/lib/money";

export default async function MyGiftCards({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/gift-cards");
  const t = await getTranslations("giftcards");
  const format = await getFormatter();
  const cards = await db.giftCard.findMany({ where: { buyerId: user.id }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title={t("mine")} actions={<Link href="/gift-cards" className="text-sm font-bold text-brand-ink">{t("buy")} →</Link>} />
      {cards.length === 0 ? (
        <EmptyState className="card" icon={<Gift className="h-8 w-8" />} title={t("title")} description={t("subtitle")} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <li key={c.id} className="card space-y-1 p-4">
              <p className="tabular text-2xl font-extrabold">{formatUZS(c.amount, locale)}</p>
              <p className="flex items-center gap-2 font-mono text-sm font-bold">
                {c.code} <CopyButton value={c.code} />
              </p>
              <p className="text-sm text-muted">
                {t("balance")}: {formatUZS(c.balance, locale)} · {t("validUntil", { date: format.dateTime(c.expiresAt, "short") })}
              </p>
              {c.recipientName && <p className="text-sm">→ {c.recipientName}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
