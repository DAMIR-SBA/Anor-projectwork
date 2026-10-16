import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, Ban, CheckCircle2, ExternalLink, FileText, RotateCcw, XCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { shopDetail } from "@/server/services/admin/shops";
import { approveShopAction, rejectShopAction, reviewDocumentAction, suspendShopAction, unsuspendShopAction, warnShopAction } from "@/server/actions/admin-marketplace";
import { Avatar, Badge, Card, KeyValue, PageHeader } from "@/components/ui/display";
import { ActionButton } from "@/components/admin/ui";
import { PenaltyForm, ShopTermsForm } from "@/components/admin/shop-tools";
import { formatUZS } from "@/lib/money";
import { fmtDateTime, fmtDay } from "@/lib/format-date";

const STATUS_TONE = { DRAFT: "neutral", PENDING: "accent", APPROVED: "success", REJECTED: "danger", SUSPENDED: "dark" } as const;
const DOC_TONE = { PENDING: "info", APPROVED: "success", REJECTED: "danger" } as const;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default async function AdminShopPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const staff = await requireStaff("shops.view");
  const t = await getTranslations("adminShops");
  const td = await getTranslations("sellerOnboarding.documents");
  const s = await shopDetail(id);
  if (!s) notFound();
  const canModerate = staff.permissions.has("shops.moderate");
  const fmt = (v: number) => formatUZS(v, locale);
  return (
    <div className="space-y-5">
      <Link href="/admin/moderation/shops" className="text-sm font-semibold text-primary hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={s.name} src={s.logoUrl} size={44} />
            <span>
              {s.name}
              <span className="mt-1 flex flex-wrap gap-1.5 text-sm font-normal">
                <Badge tone={STATUS_TONE[s.status]}>{t(`statuses.${s.status}`)}</Badge>
                <Badge tone={s.tier === "PRO" ? "accent" : "neutral"}>{s.tier}</Badge>
                {s.isOfficial && <Badge tone="info">{t("official")}</Badge>}
                {s.restrictedAt && <Badge tone="danger">{t("restricted")}</Badge>}
              </span>
            </span>
          </span>
        }
        actions={
          canModerate && (
            <div className="flex flex-wrap gap-2">
              {s.status === "PENDING" && (
                <>
                  <ActionButton action={approveShopAction} input={{ id: s.id }} variant="success" icon={<CheckCircle2 className="h-4 w-4" />} label={t("approve")} success={t("approved")} />
                  <ActionButton action={rejectShopAction} input={{ id: s.id }} variant="danger" icon={<XCircle className="h-4 w-4" />} label={t("reject")} reason={{ title: t("rejectTitle"), placeholder: t("rejectPlaceholder") }} />
                </>
              )}
              {s.status === "APPROVED" && <ActionButton action={suspendShopAction} input={{ id: s.id }} variant="danger" icon={<Ban className="h-4 w-4" />} label={t("suspend")} reason={{ title: t("suspendTitle"), hint: t("suspendHint") }} />}
              {s.status === "SUSPENDED" && <ActionButton action={unsuspendShopAction} input={{ id: s.id }} icon={<RotateCcw className="h-4 w-4" />} label={t("unsuspend")} confirm={t("unsuspendConfirm")} />}
              {s.status === "APPROVED" && <ActionButton action={warnShopAction} input={{ id: s.id }} icon={<AlertTriangle className="h-4 w-4" />} label={t("warn")} reason={{ title: t("warnTitle") }} />}
              {s.status === "APPROVED" && (
                <a href={`/${locale === "uz" ? "" : locale === "uz-Cyrl" ? "oz/" : "ru/"}shop/${s.slug}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border px-3 text-sm font-semibold hover:bg-surface-2">
                  <ExternalLink className="h-4 w-4" /> {t("storefront")}
                </a>
              )}
            </div>
          )
        }
      />
      {s.moderationNote && <p className="rounded-[12px] bg-accent/15 p-3 text-sm">{t("note", { note: s.moderationNote })}</p>}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("legalCard")}</h2>
            <KeyValue
              items={[
                [t("legalType"), s.legalType ? t(`legalTypes.${s.legalType}`) : "—"],
                [t("legalName"), s.legalName ?? "—"],
                [t("taxId"), s.taxId ?? "—"],
                [t("bank"), `${s.bankName ?? "—"} · ${s.bankAccount ?? "—"} · MFO ${s.bankMfo ?? "—"}`],
                [t("owner"), `${s.owner.name ?? s.owner.login} · ${s.owner.phone ?? "—"} · ${s.owner.email ?? "—"}`],
                [t("created"), fmtDay(s.createdAt.toISOString(), locale)],
                [t("approvedAt"), s.approvedAt ? fmtDay(s.approvedAt.toISOString(), locale) : "—"],
                [t("warehouse"), s.warehouses.map((w) => `${w.code}: ${w.city}, ${w.address}`).join("; ") || "—"],
              ]}
            />
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 font-bold">{t("documents")}</h2>
            <p className="mb-3 text-[13px] text-muted">{t("documentsHint")}</p>
            <ul className="divide-y divide-border">
              {s.required
                .filter((r) => !s.documents.some((d) => d.type === r))
                .map((r) => (
                  <li key={r} className="flex items-center gap-2 py-2.5 text-sm">
                    <FileText className="h-4 w-4 text-muted" /> <span className="flex-1 font-semibold">{td(`types.${r}`)}</span> <Badge tone="danger">{t("missing")}</Badge>
                  </li>
                ))}
              {s.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                  <FileText className="h-4 w-4 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{td.has(`types.${d.type}`) ? td(`types.${d.type}`) : d.type}</span>
                    <a href={`/api/admin/documents/${d.id}`} target="_blank" rel="noopener" className="block truncate text-[12px] text-primary underline">
                      {d.fileName}
                    </a>
                    {d.note && <span className="block text-[12px] text-danger">{d.note}</span>}
                  </span>
                  <Badge tone={DOC_TONE[d.status]}>{td(`status.${d.status}`)}</Badge>
                  {canModerate && d.status !== "APPROVED" && <ActionButton action={reviewDocumentAction} input={{ id: d.id, status: "APPROVED" as const }} label={t("docApprove")} variant="ghost" />}
                  {canModerate && d.status !== "REJECTED" && <ActionButton action={reviewDocumentAction} input={{ id: d.id, status: "REJECTED" as const }} label={t("docReject")} variant="ghost" className="text-danger" reason={{ title: t("docRejectTitle") }} />}
                </li>
              ))}
              {!s.documents.length && !s.required.length && <li className="py-2.5 text-sm text-muted">{t("noDocuments")}</li>}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("performance")}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  [t("score"), s.status === "APPROVED" ? s.fulfillmentScore.toFixed(1) : "—"],
                  [t("sla"), `${s.metrics.slaCompliance.toFixed(0)}%`],
                  [t("cancellations"), pct(s.metrics.cancellationRate)],
                  [t("returns"), pct(s.metrics.returnRate)],
                  [t("rating"), s.reviewCount ? `${s.rating.toFixed(2)} (${s.reviewCount})` : "—"],
                  [t("gmv90"), fmt(s.gmv90)],
                  [t("orders90"), String(s.orders90)],
                  [t("productsActive"), `${s.products.ACTIVE ?? 0} / ${Object.values(s.products).reduce((a, b) => a + b, 0)}`],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-[12px] bg-surface-2 p-3">
                  <p className="text-[12px] text-muted">{k}</p>
                  <p className="tabular font-bold">{v}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("history")}</h2>
            <ul className="space-y-2 text-sm">
              {s.audits.map((a) => (
                <li key={a.id} className="flex flex-wrap gap-x-2">
                  <span className="text-muted">{fmtDateTime(a.createdAt, locale)}</span>
                  <b>{a.action}</b>
                  <span className="text-muted">{a.actorLogin ?? "system"}</span>
                  {a.meta && typeof a.meta === "object" && "reason" in a.meta && <span>— {String((a.meta as { reason: unknown }).reason)}</span>}
                </li>
              ))}
              {!s.audits.length && <li className="text-muted">—</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-5">
          {canModerate && (
            <Card className="p-5">
              <h2 className="mb-3 font-bold">{t("terms")}</h2>
              <ShopTermsForm shop={{ id: s.id, tier: s.tier, isOfficial: s.isOfficial, commissionRate: s.commissionRate, kycLevel: s.kycLevel }} />
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("warnings")}</h2>
            <ul className="space-y-2 text-sm">
              {s.warnings.map((w) => (
                <li key={w.id}>
                  <b>{w.type}</b> · <span className="text-muted">{fmtDay(w.createdAt.toISOString(), locale)}</span>
                  {w.resolvedAt && <span className="text-success"> · {t("resolved")}</span>}
                  <span className="block text-[13px]">{w.message}</span>
                </li>
              ))}
              {!s.warnings.length && <li className="text-muted">—</li>}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-bold">{t("penalties")}</h2>
            <ul className="mb-4 space-y-1.5 text-sm">
              {s.penalties.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>
                    {t.has(`penaltyTypes.${p.type}`) ? t(`penaltyTypes.${p.type}`) : p.type}
                    {p.order && ` · №${p.order.number}`}
                    <span className="block text-[12px] text-muted">{fmtDay(p.createdAt.toISOString(), locale)}</span>
                  </span>
                  <b className="tabular text-danger">−{fmt(p.amount)}</b>
                </li>
              ))}
              {!s.penalties.length && <li className="text-muted">—</li>}
            </ul>
            {staff.permissions.has("finance.manage") && <PenaltyForm shopId={s.id} />}
          </Card>
          {s.flags.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-bold">{t("fraudFlags")}</h2>
              <ul className="space-y-1.5 text-sm">
                {s.flags.map((f) => (
                  <li key={f.id}>
                    <Link href={`/admin/fraud?id=${f.id}`} className="font-semibold underline">
                      {f.type}
                    </Link>{" "}
                    · {f.status} · {f.score}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
