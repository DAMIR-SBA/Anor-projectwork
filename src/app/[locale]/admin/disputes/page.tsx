import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { adminDisputes } from "@/server/services/admin/operations";
import { decideDisputeAction, disputeNoteAction } from "@/server/actions/admin-operations";
import { Badge, PageHeader } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { AdminTabs } from "@/components/admin/tabs";
import { ActionButton } from "@/components/admin/ui";
import { DISPUTE_TONE } from "@/components/admin/tones";
import { formatUZS } from "@/lib/money";
import { fmtDateTime, fmtDay } from "@/lib/format-date";

export default async function AdminDisputesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("disputes.manage");
  const t = await getTranslations("adminDisputes");
  const tr = await getTranslations("returns");
  const ts = await getTranslations("sellerReturns");
  const sp = await searchParams;
  const tab = sp.tab === "decided" ? "decided" : "open";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await adminDisputes(tab, page);
  return (
    <div>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AdminTabs active={tab} tabs={(["open", "decided"] as const).map((k) => ({ key: k, href: `/admin/disputes?tab=${k}`, label: t(`tabs.${k}`) }))} />
      <ul className="space-y-4">
        {data.rows.map((d) => {
          const r = d.return;
          const photos = (r.photos as string[] | null) ?? [];
          const evidence = (d.evidence as string[] | null) ?? [];
          return (
            <li key={d.id} className="card p-5">
              <div className="flex flex-wrap items-start gap-3">
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] bg-surface-2">{r.orderItem.imageUrl && <Image src={r.orderItem.imageUrl} alt="" fill sizes="64px" className="object-cover" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">
                      {r.number} · {r.orderItem.title}
                    </p>
                    <Badge tone={DISPUTE_TONE[d.status]}>{ts(`disputeStatus.${d.status}`)}</Badge>
                  </div>
                  <p className="text-sm">
                    {t("amount")}: <b>{formatUZS(r.amount, locale)}</b> · {tr.has(`reasons.${r.reason}`) ? tr(`reasons.${r.reason}`) : r.reason}
                  </p>
                  <p className="text-[13px] text-muted">
                    <Link href={`/admin/orders/${r.order.id}`} className="underline">
                      №{r.order.number}
                    </Link>
                    {r.order.deliveredAt && ` · ${t("delivered", { date: fmtDay(r.order.deliveredAt.toISOString(), locale) })}`}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-[12px] bg-surface-2 p-3 text-sm">
                  <p className="font-semibold">{t("buyer", { name: r.user.name ?? r.user.login })}</p>
                  <p className="text-[13px] text-muted">{t("buyerStats", { returns: d.buyerStats.returns, orders: d.buyerStats.orders })}</p>
                  {r.description && <p className="mt-1">{r.description}</p>}
                  {photos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {photos.map((u) => (
                        <a key={u} href={u} target="_blank" rel="noopener" className="relative h-14 w-14 overflow-hidden rounded-[8px]">
                          <Image src={u} alt={t("photo")} fill sizes="56px" className="object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-[12px] bg-surface-2 p-3 text-sm">
                  <p className="font-semibold">
                    <Link href={`/admin/moderation/shops/${d.shop.id}`} className="underline">
                      {d.shop.name}
                    </Link>
                  </p>
                  <p className="text-[13px] text-muted">{t("shopStats", { rate: `${(d.shop.returnRate * 100).toFixed(1)}%`, score: d.shop.fulfillmentScore.toFixed(0) })}</p>
                  <p className="mt-1">{d.sellerReason}</p>
                  {evidence.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {evidence.map((u) => (
                        <a key={u} href={u} target="_blank" rel="noopener" className="text-[13px] text-primary underline">
                          {t("evidenceFile")}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <ol className="mt-3 space-y-1 border-l-2 border-border pl-3 text-[13px]">
                {d.timeline.map((e, i) => (
                  <li key={i}>
                    <span className="text-muted">{fmtDateTime(e.at, locale)}</span> · <b>{ts(`actors.${e.actor}`)}</b> · {ts.has(`events.${e.event}`) ? ts(`events.${e.event}`) : e.event}
                    {e.note && <span className="block">{e.note}</span>}
                  </li>
                ))}
              </ol>
              {d.decisionNote && <p className="mt-2 rounded-[10px] bg-surface-2 p-2 text-sm">{t("decision", { note: d.decisionNote })}</p>}
              {tab === "open" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton action={decideDisputeAction} input={{ id: d.id, outcome: "BUYER" as const }} variant="success" label={t("forBuyer")} reason={{ title: t("forBuyerTitle", { amount: formatUZS(r.amount, locale) }), label: t("decisionNote") }} />
                  <ActionButton action={decideDisputeAction} input={{ id: d.id, outcome: "SELLER" as const }} label={t("forSeller")} reason={{ title: t("forSellerTitle"), label: t("decisionNote") }} />
                  <ActionButton action={disputeNoteAction} input={{ id: d.id }} variant="ghost" label={t("askInfo")} reason={{ title: t("askInfoTitle"), label: t("message") }} />
                </div>
              )}
            </li>
          );
        })}
        {data.rows.length === 0 && <li className="card p-8 text-center text-muted">{t("empty")}</li>}
      </ul>
      <div className="mt-4">
        <Pagination page={page} total={data.total} pageSize={20} />
      </div>
    </div>
  );
}
