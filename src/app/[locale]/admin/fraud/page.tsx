import { getTranslations, setRequestLocale } from "next-intl/server";
import { Radar } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { FRAUD_TYPES, listFlags } from "@/server/services/admin/fraud";
import { resolveFlagAction, runFraudScanAction } from "@/server/actions/admin-risk";
import { Badge, PageHeader } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { AdminTabs } from "@/components/admin/tabs";
import { ActionButton } from "@/components/admin/ui";
import { formatUZS } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";
import { cn } from "@/lib/cn";

const STATUSES = ["OPEN", "CONFIRMED", "DISMISSED"] as const;

export default async function AdminFraudPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ status?: string; type?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("fraud.manage");
  const t = await getTranslations("adminFraud");
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : "OPEN";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listFlags({ status, type: sp.type, page });
  const fmt = (v: unknown) => formatUZS(Number(v) || 0, locale);
  const qs = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams({ status, ...(sp.type ? { type: sp.type } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) q.delete(k);
      else q.set(k, v);
    }
    return `/admin/fraud?${q}`;
  };
  return (
    <div>
      <PageHeader title={t("title")} description={t("subtitle")} actions={<ActionButton action={runFraudScanAction} input={{}} variant="primary" icon={<Radar className="h-4 w-4" />} label={t("scan")} success={t("scanned")} />} />
      <AdminTabs active={status} tabs={STATUSES.map((s) => ({ key: s, href: `/admin/fraud?status=${s}`, label: t(`statuses.${s}`) }))} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href={qs({ type: undefined })} className={cn("rounded-full border px-3 py-1 text-sm font-semibold", !sp.type ? "border-primary bg-primary text-white" : "border-border hover:bg-surface-2")}>
          {t("allTypes")}
        </Link>
        {FRAUD_TYPES.map((ty) => (
          <Link key={ty} href={qs({ type: ty })} className={cn("rounded-full border px-3 py-1 text-sm font-semibold", sp.type === ty ? "border-primary bg-primary text-white" : "border-border hover:bg-surface-2")}>
            {t(`types.${ty}`)}
            {data.openByType[ty] ? <span className="ml-1 opacity-80">({data.openByType[ty]})</span> : null}
          </Link>
        ))}
      </div>
      <ul className="space-y-3">
        {data.rows.map((f) => {
          const d = f.details as Record<string, unknown>;
          const decision = d.decision as { note: string; action: string; by: string } | undefined;
          return (
            <li key={f.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={f.type === "PRICE_MANIPULATION" || f.type === "FAKE_REVIEW" ? "danger" : f.type === "DUPLICATE_ACCOUNT" ? "info" : "accent"}>{t(`types.${f.type}`)}</Badge>
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {t("score")} <span className="tabular">{f.score}</span>
                  <span className="h-1.5 w-20 rounded-full bg-surface-3">
                    <span className={cn("block h-full rounded-full", f.score >= 75 ? "bg-danger" : f.score >= 50 ? "bg-accent" : "bg-info")} style={{ width: `${f.score}%` }} />
                  </span>
                </span>
                <span className="ml-auto text-[13px] text-muted">{fmtDateTime(f.createdAt.toISOString(), locale)}</span>
              </div>
              <div className="mt-2 text-sm">
                {f.user && (
                  <p>
                    {t("user")}:{" "}
                    <Link href={`/admin/users/${f.user.id}`} className="font-semibold underline">
                      {f.user.name ?? f.user.login}
                    </Link>{" "}
                    {f.user.status === "SUSPENDED" && <Badge tone="danger">{t("suspended")}</Badge>}
                  </p>
                )}
                {f.shop && (
                  <p>
                    {t("shop")}:{" "}
                    <Link href={`/admin/moderation/shops/${f.shop.id}`} className="font-semibold underline">
                      {f.shop.name}
                    </Link>
                  </p>
                )}
                {/* Evidence, worded per signal */}
                <p className="mt-1 text-muted">
                  {d.signal === "device"
                    ? t("evidence.device", { n: (d.logins as string[]).length, logins: (d.logins as string[]).join(", ") })
                    : d.signal === "pre_sale_raise"
                      ? t("evidence.preSale", { title: String(d.title), base: fmt(d.base), peak: fmt(d.peak), pct: String(d.jumpPct), sale: fmt(d.salePrice) })
                      : d.signal === "fake_old_price"
                        ? t("evidence.oldPrice", { title: String(d.title), old: fmt(d.oldPrice), max: fmt(d.maxSeen) })
                        : f.type === "SUSPICIOUS_RETURN"
                          ? t("evidence.returns", { returns: String(d.returns), delivered: String(d.delivered), pct: String(d.ratioPct), amount: fmt(d.amount) })
                          : f.type === "REFERRAL_ABUSE"
                            ? t("evidence.referral")
                            : f.type === "FAKE_REVIEW"
                              ? t("evidence.review", { n: ((d.reviews as string[] | undefined) ?? []).length })
                              : JSON.stringify(d).slice(0, 200)}
                </p>
                {f.entityType === "Product" && (
                  <Link href={`/admin/moderation/products?tab=all&q=${encodeURIComponent(String(d.title ?? ""))}`} className="text-[13px] text-primary underline">
                    {t("openProduct")}
                  </Link>
                )}
                {decision && <p className="mt-1 rounded-[10px] bg-surface-2 p-2 text-[13px]">{t("decision", { note: decision.note, action: t(`actions.${decision.action}`), by: decision.by })}</p>}
              </div>
              {f.status === "OPEN" && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {f.userId && staff.permissions.has("users.manage") && f.type !== "PRICE_MANIPULATION" && <ActionButton action={resolveFlagAction} input={{ id: f.id, decision: "CONFIRMED" as const, action: "suspend_user" as const }} variant="danger" label={t("actions.suspend_user")} reason={{ title: t("confirmTitle") }} />}
                  {f.shopId && staff.permissions.has("shops.moderate") && <ActionButton action={resolveFlagAction} input={{ id: f.id, decision: "CONFIRMED" as const, action: "suspend_shop" as const }} variant="danger" label={t("actions.suspend_shop")} reason={{ title: t("confirmTitle") }} />}
                  {f.entityType === "Product" && f.type === "PRICE_MANIPULATION" && staff.permissions.has("products.moderate") && <ActionButton action={resolveFlagAction} input={{ id: f.id, decision: "CONFIRMED" as const, action: "take_down" as const }} variant="danger" label={t("actions.take_down")} reason={{ title: t("confirmTitle") }} />}
                  {f.type === "FAKE_REVIEW" && <ActionButton action={resolveFlagAction} input={{ id: f.id, decision: "CONFIRMED" as const, action: "hide_review" as const }} variant="danger" label={t("actions.hide_review")} reason={{ title: t("confirmTitle") }} />}
                  <ActionButton action={resolveFlagAction} input={{ id: f.id, decision: "CONFIRMED" as const, action: "none" as const }} label={t("confirmOnly")} reason={{ title: t("confirmTitle") }} />
                  <ActionButton action={resolveFlagAction} input={{ id: f.id, decision: "DISMISSED" as const, action: "none" as const }} variant="ghost" label={t("dismiss")} reason={{ title: t("dismissTitle") }} />
                </div>
              )}
            </li>
          );
        })}
        {data.rows.length === 0 && <li className="card p-8 text-center text-muted">{t("empty")}</li>}
      </ul>
      <div className="mt-4">
        <Pagination page={page} total={data.total} pageSize={25} />
      </div>
    </div>
  );
}
