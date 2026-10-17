import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { listShops, SHOP_TABS, type ShopTab } from "@/server/services/admin/shops";
import { Avatar, Badge, PageHeader } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { AdminTabs, FilterForm, inputCls } from "@/components/admin/tabs";
import { fmtDay } from "@/lib/format-date";

const STATUS_TONE = { DRAFT: "neutral", PENDING: "accent", APPROVED: "success", REJECTED: "danger", SUSPENDED: "dark" } as const;

export default async function AdminShopsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("shops.view");
  const t = await getTranslations("adminShops");
  const sp = await searchParams;
  const tab = (SHOP_TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as ShopTab) : "pending";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listShops(tab, { q: sp.q, page });
  return (
    <div>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AdminTabs active={tab} tabs={SHOP_TABS.map((k) => ({ key: k, href: `/admin/moderation/shops?tab=${k}`, label: t(`tabs.${k}`), count: k === "pending" || k === "restricted" ? data.counts[k] : undefined }))} />
      <FilterForm submitLabel={t("search")}>
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={sp.q} placeholder={t("searchPlaceholder")} aria-label={t("search")} className={`${inputCls} w-full max-w-sm`} />
      </FilterForm>
      <div tabIndex={0} className="card overflow-x-auto p-0">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">{t("shop")}</th>
              <th className="px-3 py-2.5">{t("owner")}</th>
              <th className="px-3 py-2.5">{t("legal")}</th>
              <th className="px-3 py-2.5">{t("status")}</th>
              <th className="px-3 py-2.5 text-right">{t("score")}</th>
              <th className="px-3 py-2.5 text-right">{t("products")}</th>
              <th className="px-3 py-2.5">{tab === "pending" ? t("submitted") : t("created")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((s) => (
              <tr key={s.id} className="hover:bg-surface-2">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/moderation/shops/${s.id}`} className="flex items-center gap-2.5 font-semibold hover:underline">
                    <Avatar name={s.name} src={s.logoUrl} size={32} />
                    <span>
                      {s.name}
                      <span className="block text-xs font-normal text-muted">
                        /{s.slug} · {s.city ?? "—"}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  {s.owner.name ?? s.owner.login}
                  <span className="block text-xs text-muted">{s.owner.phone ?? s.owner.login}</span>
                </td>
                <td className="px-3 py-2.5 text-[13px]">
                  {s.legalType ? t(`legalTypes.${s.legalType}`) : "—"}
                  <span className="block text-xs text-muted">{s.taxId ?? "—"}</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={STATUS_TONE[s.status]}>{t(`statuses.${s.status}`)}</Badge>
                    {s.tier === "PRO" && <Badge tone="accent">PRO</Badge>}
                    {s.restricted && (
                      <span title={t("restricted")}>
                        <ShieldAlert className="h-4 w-4 text-danger" aria-label={t("restricted")} />
                      </span>
                    )}
                  </div>
                </td>
                <td className="tabular px-3 py-2.5 text-right">{s.status === "APPROVED" ? s.score.toFixed(0) : "—"}</td>
                <td className="tabular px-3 py-2.5 text-right">{s.products}</td>
                <td className="px-3 py-2.5 text-[13px] text-muted">{fmtDay(tab === "pending" ? s.updatedAt : s.createdAt, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 && <p className="p-8 text-center text-muted">{t("empty")}</p>}
      </div>
      <div className="mt-4">
        <Pagination page={page} total={data.total} pageSize={25} />
      </div>
    </div>
  );
}
