import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { adminReturns, RETURN_TABS, type ReturnTab } from "@/server/services/admin/operations";
import { approveReturnAction, rejectReturnAction } from "@/server/actions/admin-operations";
import { Badge, PageHeader } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { AdminTabs } from "@/components/admin/tabs";
import { ActionButton } from "@/components/admin/ui";
import { RETURN_TONE } from "@/components/admin/tones";
import { formatUZS } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";

export default async function AdminReturnsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("returns.manage");
  const t = await getTranslations("adminReturns");
  const tr = await getTranslations("returns");
  const sp = await searchParams;
  const tab = (RETURN_TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as ReturnTab) : "requested";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await adminReturns(tab, page);
  return (
    <div>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AdminTabs active={tab} tabs={RETURN_TABS.map((k) => ({ key: k, href: `/admin/returns?tab=${k}`, label: t(`tabs.${k}`) }))} />
      <ul className="space-y-3">
        {data.rows.map((r) => (
          <li key={r.id} className="card flex flex-wrap items-start gap-3 p-4">
            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{r.orderItem.imageUrl && <Image src={r.orderItem.imageUrl} alt="" fill sizes="56px" className="object-cover" />}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{r.number}</p>
                <Badge tone={RETURN_TONE[r.status]}>{tr.has(`status.${r.status}`) ? tr(`status.${r.status}`) : r.status}</Badge>
                {r.dispute && (
                  <Link href="/admin/disputes" className="text-[13px] font-semibold text-primary underline">
                    {t("dispute")}
                  </Link>
                )}
              </div>
              <p className="text-sm">
                {r.orderItem.title} × {r.quantity} · <b>{formatUZS(r.amount, locale)}</b>
              </p>
              <p className="text-[13px] text-muted">
                {tr.has(`reasons.${r.reason}`) ? tr(`reasons.${r.reason}`) : r.reason}
                {r.description && ` — ${r.description}`}
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                {r.user.name ?? r.user.login} ·{" "}
                <Link href={`/admin/orders/${r.order.id}`} className="underline">
                  №{r.order.number}
                </Link>{" "}
                · {r.order.shop.name} · {fmtDateTime(r.createdAt.toISOString(), locale)}
              </p>
              {r.resolution && <p className="mt-1 text-[13px] text-danger">{r.resolution}</p>}
            </div>
            {r.status === "REQUESTED" && (
              <div className="flex flex-wrap gap-1.5">
                <ActionButton action={approveReturnAction} input={{ id: r.id }} variant="success" label={t("approve")} confirm={t("approveConfirm", { amount: formatUZS(r.amount, locale) })} success={t("approved")} />
                <ActionButton action={rejectReturnAction} input={{ id: r.id }} variant="ghost" className="text-danger" label={t("reject")} reason={{ title: t("rejectTitle"), placeholder: t("rejectPlaceholder") }} />
              </div>
            )}
          </li>
        ))}
        {data.rows.length === 0 && <li className="card p-8 text-center text-muted">{t("empty")}</li>}
      </ul>
      <div className="mt-4">
        <Pagination page={page} total={data.total} pageSize={25} />
      </div>
    </div>
  );
}
