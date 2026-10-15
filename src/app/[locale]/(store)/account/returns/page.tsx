import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Undo2 } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { formatUZS } from "@/lib/money";

export default async function ReturnsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/returns");
  const t = await getTranslations("returns");
  const format = await getFormatter();
  const returns = await db.return.findMany({ where: { userId: user.id }, include: { orderItem: true, order: { select: { number: true } }, dispute: true }, orderBy: { createdAt: "desc" } });
  const tone = { REQUESTED: "accent", APPROVED: "info", REJECTED: "danger", RECEIVED: "info", REFUNDED: "success", DISPUTED: "accent" } as const;
  return (
    <div>
      <PageHeader title={t("title")} description={t("window")} />
      {returns.length === 0 ? (
        <EmptyState className="card" icon={<Undo2 className="h-8 w-8" />} title={t("empty")} />
      ) : (
        <ul className="space-y-3">
          {returns.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-bold">
                  {r.number} · №{r.order.number}
                </p>
                <p className="truncate text-sm">
                  {r.orderItem.title} × {r.quantity}
                </p>
                <p className="text-xs text-muted">
                  {t(`reasons.${r.reason}` as "reasons.defect")} · {format.dateTime(r.createdAt, "short")}
                </p>
                {r.resolution && <p className="mt-1 text-sm text-danger">{r.resolution}</p>}
              </div>
              <div className="text-right">
                <Badge tone={tone[r.status]}>{t(`status.${r.status}`)}</Badge>
                <p className="tabular mt-1 font-bold">{formatUZS(r.amount, locale)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
