import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { db } from "@/server/db";
import { listCoupons } from "@/server/services/admin/marketing";
import { Badge, PageHeader } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { FilterForm, inputCls } from "@/components/admin/tabs";
import { BulkCoupons, CouponEditor } from "@/components/admin/marketing-tools";
import { formatUZS } from "@/lib/money";
import { fmtDay } from "@/lib/format-date";

export default async function AdminCouponsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("promos.manage");
  const t = await getTranslations("adminCoupons");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [data, cats, shops] = await Promise.all([
    listCoupons(sp.q, page),
    db.category.findMany({ where: { isActive: true }, orderBy: [{ parentId: "asc" }, { sort: "asc" }], select: { id: true, nameUz: true, nameRu: true } }),
    db.shop.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const categories = cats.map((c) => ({ id: c.id, label: locale === "ru" ? c.nameRu : c.nameUz }));
  const shopOpts = shops.map((s) => ({ id: s.id, label: s.name }));
  const now = new Date();
  return (
    <div>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className="flex gap-2">
            <BulkCoupons categories={categories} shops={shopOpts} />
            <CouponEditor categories={categories} shops={shopOpts} />
          </div>
        }
      />
      <FilterForm submitLabel={t("search")}>
        <input name="q" defaultValue={sp.q} placeholder={t("searchPlaceholder")} aria-label={t("search")} className={`${inputCls} w-full max-w-xs font-mono uppercase`} />
      </FilterForm>
      <div tabIndex={0} className="card overflow-x-auto p-0">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">{t("code")}</th>
              <th className="px-3 py-2.5">{t("discount")}</th>
              <th className="px-3 py-2.5">{t("conditions")}</th>
              <th className="px-3 py-2.5 text-right">{t("used")}</th>
              <th className="px-3 py-2.5">{t("validity")}</th>
              <th className="px-3 py-2.5">{t("statusCol")}</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((c) => {
              const expired = !!c.endsAt && c.endsAt < now;
              const exhausted = c.usageLimit !== null && c.usedCount >= c.usageLimit;
              return (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-mono font-bold">{c.code}</td>
                  <td className="px-3 py-2">
                    {c.type === "PERCENT" ? `${c.value}%` : c.type === "FIXED" ? formatUZS(c.value, locale) : t("types.FREE_DELIVERY")}
                    {c.maxDiscount ? <span className="block text-[12px] text-muted">{t("upTo", { amount: formatUZS(c.maxDiscount, locale) })}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-[13px]">
                    {[c.minCartTotal ? t("min", { amount: formatUZS(c.minCartTotal, locale) }) : null, c.category ? (locale === "ru" ? c.category.nameRu : c.category.nameUz) : null, c.shop?.name, c.firstOrderOnly ? t("firstOrder") : null].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="tabular px-3 py-2 text-right">
                    {c.usedCount}
                    {c.usageLimit !== null && ` / ${c.usageLimit}`}
                  </td>
                  <td className="px-3 py-2 text-[13px]">{c.startsAt || c.endsAt ? `${c.startsAt ? fmtDay(c.startsAt.toISOString(), locale) : "…"} — ${c.endsAt ? fmtDay(c.endsAt.toISOString(), locale) : "…"}` : "—"}</td>
                  <td className="px-3 py-2">{!c.isActive ? <Badge>{t("off")}</Badge> : expired ? <Badge tone="dark">{t("expired")}</Badge> : exhausted ? <Badge tone="accent">{t("exhausted")}</Badge> : <Badge tone="success">{t("live")}</Badge>}</td>
                  <td className="px-3 py-2 text-right">
                    <CouponEditor
                      categories={categories}
                      shops={shopOpts}
                      initial={{ id: c.id, code: c.code, type: c.type, value: c.value, maxDiscount: c.maxDiscount, minCartTotal: c.minCartTotal, categoryId: c.categoryId, shopId: c.shopId, firstOrderOnly: c.firstOrderOnly, usageLimit: c.usageLimit, perUserLimit: c.perUserLimit, startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null, isActive: c.isActive, descriptionUz: c.descriptionUz ?? "", descriptionRu: c.descriptionRu ?? "" }}
                    />
                  </td>
                </tr>
              );
            })}
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
