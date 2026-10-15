import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/auth/guards";
import { reviewForEdit } from "@/server/services/review-queries";
import { Card, PageHeader } from "@/components/ui/display";
import { ReviewForm } from "@/components/reviews/review-form";
import { loc } from "@/lib/localized";
import { fmtDay } from "@/lib/format-date";

export default async function EditReviewPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/account/reviews/${id}/edit`);
  const r = await reviewForEdit(user.id, id);
  if (!r) notFound();
  const t = await getTranslations("reviews");
  const locked = r.editableUntil < new Date();
  return (
    <div className="max-w-2xl">
      <PageHeader title={t("form.editTitle")} description={locked ? (await getTranslations("errors"))("reviewLocked") : t("form.editableUntil", { date: fmtDay(r.editableUntil, locale) })} />
      <Card className="mb-4 flex items-center gap-3 p-4">
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{r.product.media[0] && <Image src={r.product.media[0].url} alt="" fill sizes="64px" className="object-cover" />}</span>
        <p className="font-semibold">{loc(r.product, "title", locale)}</p>
      </Card>
      {!locked && (
        <Card className="p-5">
          <ReviewForm
            mode="edit"
            reviewId={r.id}
            productSlug={r.product.slug}
            initial={{
              rating: r.rating,
              pros: r.pros ?? "",
              cons: r.cons ?? "",
              comment: r.comment ?? "",
              isAnonymous: r.isAnonymous,
              images: r.media.filter((m) => m.type === "IMAGE").map((m) => m.url),
              video: r.media.filter((m) => m.type === "VIDEO").map((m) => m.url),
            }}
          />
        </Card>
      )}
    </div>
  );
}
