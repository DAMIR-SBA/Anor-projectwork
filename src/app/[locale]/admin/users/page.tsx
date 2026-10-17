import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { listUsers } from "@/server/services/admin/fraud";
import { Avatar, Badge, PageHeader } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { AdminTabs, FilterForm, inputCls } from "@/components/admin/tabs";
import { fmtDay } from "@/lib/format-date";

const TABS = ["all", "flagged", "suspended", "plus", "sellers"] as const;

export default async function AdminUsersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("users.view");
  const t = await getTranslations("adminUsers");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listUsers({ q: sp.q, status: tab === "suspended" ? "SUSPENDED" : tab, page });
  return (
    <div>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AdminTabs active={tab} tabs={TABS.map((k) => ({ key: k, href: `/admin/users?tab=${k}`, label: t(`tabs.${k}`) }))} />
      <FilterForm submitLabel={t("search")}>
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={sp.q} placeholder={t("searchPlaceholder")} aria-label={t("search")} className={`${inputCls} w-full max-w-sm`} />
      </FilterForm>
      <div tabIndex={0} className="card overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">{t("user")}</th>
              <th className="px-3 py-2.5">{t("contacts")}</th>
              <th className="px-3 py-2.5">{t("tier")}</th>
              <th className="px-3 py-2.5 text-right">{t("orders")}</th>
              <th className="px-3 py-2.5">{t("registered")}</th>
              <th className="px-3 py-2.5">{t("status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((u) => (
              <tr key={u.id} className="hover:bg-surface-2">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/users/${u.id}`} className="flex items-center gap-2.5 font-semibold hover:underline">
                    <Avatar name={u.name ?? u.login} size={30} />
                    <span>
                      {u.name ?? u.login}
                      <span className="block text-xs font-normal text-muted">@{u.login}</span>
                    </span>
                    {u._count.fraudFlags > 0 && <ShieldAlert className="h-4 w-4 text-danger" aria-label={t("flagged")} />}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-[13px]">
                  {u.phone ?? "—"}
                  <span className="block text-muted">{u.email ?? ""}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex flex-wrap gap-1">
                    <Badge>{u.loyaltyTier}</Badge>
                    {u.subscriptions.length > 0 && <Badge tone="accent">Plus</Badge>}
                    {u._count.shops > 0 && <Badge tone="info">{t("seller")}</Badge>}
                  </span>
                </td>
                <td className="tabular px-3 py-2.5 text-right">{u._count.orders}</td>
                <td className="px-3 py-2.5 text-[13px] text-muted">{fmtDay(u.createdAt.toISOString(), locale)}</td>
                <td className="px-3 py-2.5">
                  <Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>{t(`statuses.${u.status}`)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 && <p className="p-8 text-center text-muted">{t("empty")}</p>}
      </div>
      <div className="mt-4">
        <Pagination page={page} total={data.total} pageSize={30} />
      </div>
    </div>
  );
}
