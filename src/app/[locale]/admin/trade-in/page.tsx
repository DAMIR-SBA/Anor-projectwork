import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { tradeInQueue } from "@/server/services/tradein";
import { completeTradeInAction, rejectTradeInAction } from "@/server/actions/content";
import { Badge, PageHeader, type BadgeTone } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { AdminTabs } from "@/components/admin/tabs";
import { ActionButton } from "@/components/admin/ui";
import { TradeInOfferForm } from "@/components/content/tradein-tools";
import { formatUZS } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";

const TABS = ["SUBMITTED", "ESTIMATED", "ACCEPTED", "closed"] as const;
const TONE: Record<string, BadgeTone> = { SUBMITTED: "info", ESTIMATED: "accent", ACCEPTED: "primary", COMPLETED: "success", REJECTED: "neutral" };

export default async function AdminTradeInPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("returns.manage");
  const t = await getTranslations("tradein");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "SUBMITTED";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await tradeInQueue(tab, page);
  const fmt = (v: number) => formatUZS(v, locale);
  return (
    <div>
      <PageHeader title={t("adminTitle")} description={t("adminSubtitle")} />
      <AdminTabs active={tab} tabs={TABS.map((k) => ({ key: k, href: `/admin/trade-in?tab=${k}`, label: `${t(`adminTabs.${k}`)}${k !== "closed" && data.counts[k] ? ` (${data.counts[k]})` : ""}` }))} />
      {data.items.length === 0 ? (
        <p className="card p-8 text-center text-muted">{t("adminEmpty")}</p>
      ) : (
        <ul className="space-y-3">
          {data.items.map((r) => {
            const a = r.answers as Record<string, unknown>;
            return (
              <li key={r.id} className="card space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[r.status]}>{t(`status.${r.status}`)}</Badge>
                  <b>{r.deviceModel}</b>
                  <span className="text-xs text-muted">
                    {r.number} · {fmtDateTime(r.createdAt.toISOString(), locale)} · {r.user.name ?? r.user.login}
                    {r.imeiLast4 ? ` · IMEI …${r.imeiLast4}` : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.photos.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener" className="relative h-20 w-20 overflow-hidden rounded-[10px] bg-surface-2">
                      <Image src={url} alt={t("photoAlt", { model: r.deviceModel })} fill sizes="80px" className="object-cover" />
                    </a>
                  ))}
                </div>
                <p className="text-sm text-muted">
                  {t("gradeLabel")}: <b className="text-fg">{t(`grade.${r.conditionGrade}`)}</b> · {t("q.screen")}: {t(`screen.${String(a.screen)}`)} · {t("q.body")}: {t(`body.${String(a.body)}`)} · {t("q.battery")}: {t(`battery.${String(a.battery)}`)} · {t("q.accessories")}: {a.accessories ? t("yes") : t("no")}
                </p>
                <p className="text-sm">
                  {t("estimateShort", { value: fmt(r.estimatedValue) })}
                  {r.offeredValue != null && (
                    <>
                      {" "}
                      · {t("offerLine")}: <b>{fmt(r.offeredValue)}</b>
                    </>
                  )}
                </p>
                {r.staffNote && <p className="text-sm text-muted">{r.staffNote}</p>}
                {r.status === "SUBMITTED" && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <TradeInOfferForm id={r.id} estimateValue={r.estimatedValue} />
                    <ActionButton action={rejectTradeInAction} input={{ id: r.id }} variant="ghost" label={t("reject")} reason={{ title: t("rejectTitle", { number: r.number }), label: t("rejectReason") }} />
                  </div>
                )}
                {r.status === "ACCEPTED" && <ActionButton action={completeTradeInAction} input={{ id: r.id }} variant="primary" label={t("complete", { value: fmt(r.offeredValue ?? 0) })} confirm={t("completeConfirm")} />}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4">
        <Pagination page={page} total={data.total} pageSize={20} />
      </div>
    </div>
  );
}
