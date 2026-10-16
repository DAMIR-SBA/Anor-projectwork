import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { adminOrders, ORDER_TABS, type OrderTab } from "@/server/services/admin/operations";
import { Badge, PageHeader } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { AdminTabs, FilterForm, inputCls } from "@/components/admin/tabs";
import { ORDER_TONE } from "@/components/admin/tones";
import { formatUZS } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";

export default async function AdminOrdersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; q?: string; page?: string; f?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("orders.view");
  const t = await getTranslations("adminOrders");
  const to = await getTranslations("orders");
  const sp = await searchParams;
  const tab = (ORDER_TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as OrderTab) : "active";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await adminOrders(tab, { q: sp.q, fulfillment: sp.f, page });
  return (
    <div>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AdminTabs active={tab} tabs={ORDER_TABS.map((k) => ({ key: k, href: `/admin/orders?tab=${k}`, label: t(`tabs.${k}`), count: k === "attention" ? data.attention : undefined }))} />
      <FilterForm submitLabel={t("search")}>
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={sp.q} placeholder={t("searchPlaceholder")} aria-label={t("search")} className={`${inputCls} w-full max-w-sm`} />
        <select name="f" defaultValue={sp.f ?? ""} aria-label={t("fulfillment")} className={inputCls}>
          <option value="">{t("allModels")}</option>
          {["FBO", "FBS", "DBS"].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </FilterForm>
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">{t("number")}</th>
              <th className="px-3 py-2.5">{t("status")}</th>
              <th className="px-3 py-2.5">{t("buyer")}</th>
              <th className="px-3 py-2.5">{t("shop")}</th>
              <th className="px-3 py-2.5">{t("delivery")}</th>
              <th className="px-3 py-2.5 text-right">{t("total")}</th>
              <th className="px-3 py-2.5">{t("created")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((o) => (
              <tr key={o.id} className="hover:bg-surface-2">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline">
                    №{o.number}
                  </Link>
                  {o.late && <AlertTriangle className="ml-1.5 inline h-4 w-4 text-danger" aria-label={t("late")} />}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={ORDER_TONE[o.status]}>{to(`status.${o.status}`)}</Badge>
                </td>
                <td className="px-3 py-2.5">{o.buyer}</td>
                <td className="px-3 py-2.5">
                  <Link href={`/admin/moderation/shops/${o.shop.id}`} className="hover:underline">
                    {o.shop.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-[13px]">
                  {o.fulfillment} · {t(`methods.${o.deliveryMethod}`)}
                </td>
                <td className="tabular px-3 py-2.5 text-right font-semibold">{formatUZS(o.total, locale)}</td>
                <td className="px-3 py-2.5 text-[13px] text-muted">{fmtDateTime(o.createdAt, locale)}</td>
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
