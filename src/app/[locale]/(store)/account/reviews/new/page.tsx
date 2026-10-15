import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { reviewEligibility } from "@/server/services/reviews";
import { Card, PageHeader } from "@/components/ui/display";
import { ReviewForm } from "@/components/reviews/review-form";
import { loc } from "@/lib/localized";

export default async function NewReviewPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ order?: string; product?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { order, product } = await searchParams;
  const user = await requireUser(`/account/reviews/new?order=${order ?? ""}&product=${product ?? ""}`);
  if (!order || !product) notFound();
  const t = await getTranslations("reviews");
  const e = await reviewEligibility(user.id, order, product);
  if (!e.ok) {
    if (e.reason === "alreadyReviewed" && e.reviewId) redirect({ href: `/account/reviews/${e.reviewId}/edit`, locale });
    notFound();
  }
  const p = await db.product.findUniqueOrThrow({ where: { id: product }, include: { media: { take: 1, orderBy: { sort: "asc" } } } });
  const item = e.order.items[0];
  return (
    <div className="max-w-2xl">
      <PageHeader title={t("form.newTitle")} />
      <Card className="mb-4 flex items-center gap-3 p-4">
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{p.media[0] && <Image src={p.media[0].url} alt="" fill sizes="64px" className="object-cover" />}</span>
        <div className="min-w-0">
          <p className="font-semibold">{loc(p, "title", locale)}</p>
          <p className="text-sm text-muted">
            {item.variantTitle ? `${item.variantTitle} · ` : ""}
            {t("form.fromOrder", { number: e.order.number })}
          </p>
        </div>
      </Card>
      <Card className="p-5">
        <ReviewForm mode="new" orderId={order} productId={product} productSlug={p.slug} />
      </Card>
    </div>
  );
}
