import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Trash2 } from "lucide-react";
import { requireStaff } from "@/server/auth/guards";
import { listBanners } from "@/server/services/admin/marketing";
import { deleteBannerAction } from "@/server/actions/admin-marketing";
import { Badge, PageHeader } from "@/components/ui/display";
import { ActionButton } from "@/components/admin/ui";
import { BannerEditor } from "@/components/admin/marketing-tools";
import { fmtDateTime } from "@/lib/format-date";

const STATE_TONE = { live: "success", scheduled: "info", expired: "dark", off: "neutral" } as const;

export default async function AdminBannersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStaff("banners.manage");
  const t = await getTranslations("adminBanners");
  const rows = await listBanners();
  const groups = (["HOME_HERO", "HOME_STRIP", "CATEGORY"] as const).map((p) => ({ p, rows: rows.filter((r) => r.placement === p) }));
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} actions={<BannerEditor />} />
      {groups.map((g) => (
        <section key={g.p}>
          <h2 className="mb-2 text-lg font-bold">{t(`placements.${g.p}`)}</h2>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {g.rows.map((b) => (
              <li key={b.id} className="card overflow-hidden p-0">
                <div className="flex min-h-24 items-center gap-3 p-4 text-white" style={{ background: b.bgColor }}>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold">{locale === "ru" ? b.titleRu : b.titleUz}</p>
                    {(locale === "ru" ? b.subtitleRu : b.subtitleUz) && <p className="text-sm text-white/85">{locale === "ru" ? b.subtitleRu : b.subtitleUz}</p>}
                  </div>
                  {b.imageUrl && (
                    <span className="relative h-16 w-24 shrink-0">
                      <Image src={b.imageUrl} alt="" fill sizes="96px" className="object-contain" />
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 p-3 text-[13px]">
                  <Badge tone={STATE_TONE[b.state]}>{t(`states.${b.state}`)}</Badge>
                  <span className="font-mono text-muted">{b.href}</span>
                  <span className="text-muted">
                    {b.startsAt || b.endsAt ? `${b.startsAt ? fmtDateTime(b.startsAt, locale) : "…"} — ${b.endsAt ? fmtDateTime(b.endsAt, locale) : "…"}` : t("always")}
                  </span>
                  <span className="ml-auto flex gap-1">
                    <BannerEditor initial={{ id: b.id, titleUz: b.titleUz, titleRu: b.titleRu, subtitleUz: b.subtitleUz ?? "", subtitleRu: b.subtitleRu ?? "", imageUrl: b.imageUrl, href: b.href, placement: b.placement, bgColor: b.bgColor, sort: b.sort, startsAt: b.startsAt, endsAt: b.endsAt, isActive: b.isActive }} />
                    <ActionButton action={deleteBannerAction} input={{ id: b.id }} variant="ghost" className="h-8 px-1.5 text-muted hover:text-danger" label={<Trash2 className="h-4 w-4" aria-label={t("delete")} />} confirm={t("deleteConfirm")} />
                  </span>
                </div>
              </li>
            ))}
            {!g.rows.length && <li className="card p-6 text-center text-sm text-muted">{t("empty")}</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}
