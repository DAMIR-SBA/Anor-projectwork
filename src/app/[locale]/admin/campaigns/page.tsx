import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus, Repeat } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { listCampaigns } from "@/server/services/admin/marketing";
import { Badge, PageHeader } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format-date";

const TONE = { DRAFT: "neutral", SCHEDULED: "info", ACTIVE: "success", ENDED: "dark" } as const;

export default async function AdminCampaignsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("promos.manage");
  const t = await getTranslations("adminCampaigns");
  const rows = await listCampaigns();
  return (
    <div>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Link href="/admin/campaigns/new" className={buttonClasses("primary")}>
            <Plus className="h-4 w-4" /> {t("new")}
          </Link>
        }
      />
      <div tabIndex={0} className="card overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">{t("name")}</th>
              <th className="px-3 py-2.5">{t("type")}</th>
              <th className="px-3 py-2.5">{t("dates")}</th>
              <th className="px-3 py-2.5">{t("status")}</th>
              <th className="px-3 py-2.5 text-right">{t("minDiscountShort")}</th>
              <th className="px-3 py-2.5 text-right">{t("participantsCol")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-surface-2">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/campaigns/${c.id}`} className="flex items-center gap-2 font-semibold hover:underline">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.themeColor }} aria-hidden />
                    {locale === "ru" ? c.nameRu : c.nameUz}
                    {c.recurring && <Repeat className="h-3.5 w-3.5 text-muted" aria-label={t("recurring")} />}
                  </Link>
                  <span className="block pl-5 font-mono text-[12px] text-muted">/{c.slug}</span>
                </td>
                <td className="px-3 py-2.5">{t(`types.${c.type}`)}</td>
                <td className="px-3 py-2.5 text-[13px]">
                  {fmtDateTime(c.startsAt.toISOString(), locale)} — {fmtDateTime(c.endsAt.toISOString(), locale)}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={TONE[c.status]}>{t(`statuses.${c.status}`)}</Badge>
                </td>
                <td className="tabular px-3 py-2.5 text-right">{c.minDiscountPercent}%</td>
                <td className="tabular px-3 py-2.5 text-right">
                  {c.participants.approved}
                  {c.participants.pending > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-[11px] font-bold text-[#1A1A1F]">+{c.participants.pending}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-muted">{t("empty")}</p>}
      </div>
    </div>
  );
}
