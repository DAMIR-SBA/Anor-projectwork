import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { campaignDetail } from "@/server/services/admin/marketing";
import { campaignStatusAction } from "@/server/actions/admin-marketing";
import { Badge, PageHeader } from "@/components/ui/display";
import { ActionButton } from "@/components/admin/ui";
import { CampaignEditor, ParticipantsTable, type CampaignForm } from "@/components/admin/marketing-tools";

const TONE = { DRAFT: "neutral", SCHEDULED: "info", ACTIVE: "success", ENDED: "dark" } as const;

export default async function AdminCampaignPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireStaff("promos.manage");
  const t = await getTranslations("adminCampaigns");
  const c = id === "new" ? null : await campaignDetail(id);
  if (id !== "new" && !c) notFound();
  const initial: CampaignForm = c
    ? { id: c.id, slug: c.slug, type: c.type, nameUz: c.nameUz, nameRu: c.nameRu, descriptionUz: c.descriptionUz ?? "", descriptionRu: c.descriptionRu ?? "", season: c.season ?? "", startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString(), minDiscountPercent: c.minDiscountPercent, plusEarlyHours: c.plusEarlyHours, themeColor: c.themeColor, bannerUrl: c.bannerUrl, recurring: c.recurring, spinEnabled: c.spinEnabled, blocks: (c.blocks as CampaignForm["blocks"] | null) ?? [{ type: "hero" }, { type: "countdown" }, { type: "products" }] }
    : { slug: "", type: "SEASONAL", nameUz: "", nameRu: "", descriptionUz: "", descriptionRu: "", season: "", startsAt: null, endsAt: null, minDiscountPercent: 15, plusEarlyHours: 12, themeColor: "#C8102E", bannerUrl: null, recurring: false, spinEnabled: false, blocks: [{ type: "hero" }, { type: "countdown" }, { type: "products" }] };
  const prefix = locale === "uz" ? "" : locale === "uz-Cyrl" ? "/oz" : "/ru";
  return (
    <div className="space-y-5">
      <Link href="/admin/campaigns" className="text-sm font-semibold text-primary hover:underline">
        ← {t("back")}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c ? (locale === "ru" ? c.nameRu : c.nameUz) : t("new")}
            {c && <Badge tone={TONE[c.status]}>{t(`statuses.${c.status}`)}</Badge>}
          </span>
        }
        actions={
          c && (
            <div className="flex flex-wrap gap-2">
              {c.status === "DRAFT" && <ActionButton action={campaignStatusAction} input={{ id: c.id, status: "SCHEDULED" as const }} variant="primary" label={t("publish")} confirm={t("publishConfirm")} />}
              {(c.status === "SCHEDULED" || c.status === "ACTIVE") && <ActionButton action={campaignStatusAction} input={{ id: c.id, status: "ENDED" as const }} variant="danger" label={t("endNow")} confirm={t("endConfirm")} />}
              {c.status === "SCHEDULED" && <ActionButton action={campaignStatusAction} input={{ id: c.id, status: "DRAFT" as const }} label={t("unpublish")} />}
              {c.status !== "DRAFT" && (
                <a href={`${prefix}/campaign/${c.slug}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border px-3 text-sm font-semibold hover:bg-surface-2">
                  <ExternalLink className="h-4 w-4" /> {t("preview")}
                </a>
              )}
            </div>
          )
        }
      />
      <div className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <CampaignEditor key={c?.id ?? "new"} initial={initial} />
        {c && <ParticipantsTable campaignId={c.id} minDiscount={c.minDiscountPercent} rows={c.products.map((p) => ({ id: p.id, status: p.status, salePrice: p.salePrice, stockLimit: p.stockLimit, sold: p.sold, shop: p.shop, product: { titleUz: p.product.titleUz, titleRu: p.product.titleRu, price: p.product.price, slug: p.product.slug, image: p.product.media[0]?.url ?? null } }))} />}
      </div>
    </div>
  );
}
