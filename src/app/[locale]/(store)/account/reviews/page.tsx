import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Gift, MessageSquareQuote, PenLine, Store, ThumbsUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/guards";
import { myReviews } from "@/server/services/review-queries";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { Stars } from "@/components/product/rating";
import { ShopReviewForm } from "@/components/reviews/shop-review-form";
import { fmtDay } from "@/lib/format-date";

const TONE = { PENDING: "accent", APPROVED: "success", REJECTED: "danger", HIDDEN: "neutral" } as const;

export default async function MyReviewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser("/account/reviews");
  const t = await getTranslations("reviews");
  const data = await myReviews(user.id, locale);

  return (
    <div className="space-y-6">
      <PageHeader title={t("mine.title")} />

      <section aria-labelledby="awaiting">
        <h2 id="awaiting" className="mb-3 text-lg font-extrabold">
          {t("mine.awaiting")} {data.awaiting.length > 0 && <span className="text-muted">{data.awaiting.length}</span>}
        </h2>
        {data.awaiting.length === 0 ? (
          <p className="card p-4 text-sm text-muted">{t("mine.awaitingEmpty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.awaiting.map((i) => (
              <li key={`${i.orderId}:${i.productId}`} className="card flex items-center gap-3 p-3">
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="64px" className="object-cover" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold">{i.title}</p>
                  <p className="text-xs text-muted">
                    {t("form.fromOrder", { number: i.orderNumber })}
                    {i.deliveredAt && ` · ${t("mine.deliveredOn", { date: fmtDay(i.deliveredAt, locale) })}`}
                  </p>
                  <Link href={`/account/reviews/new?order=${i.orderId}&product=${i.productId}`} className={buttonClasses("primary", "sm", "mt-2 h-8")}>
                    <PenLine className="h-3.5 w-3.5" /> {t("write")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.shopsToRate.length > 0 && (
        <section aria-labelledby="shops">
          <h2 id="shops" className="mb-3 text-lg font-extrabold">
            {t("mine.rateShops")}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.shopsToRate.slice(0, 4).map((s) => (
              <li key={s.orderId} className="card p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <Store className="h-4 w-4 text-primary" /> {t("shop.subtitle", { shop: s.shop, number: s.number })}
                </p>
                <ShopReviewForm orderId={s.orderId} compact />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="written">
        <h2 id="written" className="mb-3 text-lg font-extrabold">
          {t("mine.written")}
        </h2>
        {data.reviews.length === 0 ? (
          <EmptyState className="card" icon={<MessageSquareQuote className="h-8 w-8" />} title={t("mine.writtenEmpty")} />
        ) : (
          <ul className="space-y-3">
            {data.reviews.map((r) => (
              <li key={r.id}>
                <Card className="flex gap-3 p-4">
                  <Link href={`/p/${r.productSlug}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">
                    {r.imageUrl && <Image src={r.imageUrl} alt="" fill sizes="64px" className="object-cover" />}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link href={`/p/${r.productSlug}#reviews`} className="line-clamp-1 font-semibold hover:underline">
                        {r.title}
                      </Link>
                      <Badge tone={TONE[r.status]}>{t(`mine.status.${r.status}`)}</Badge>
                    </div>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      <Stars value={r.rating} size={12} /> {fmtDay(r.createdAt, locale)}
                    </p>
                    {r.text && <p className="mt-1.5 line-clamp-2 text-sm">{r.text}</p>}
                    {r.rejectReason && r.status !== "APPROVED" && <p className="mt-1 text-sm text-danger">{t("mine.rejectReason", { reason: r.rejectReason })}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      {r.helpful > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUp className="h-3.5 w-3.5" /> {t("mine.helpfulN", { count: r.helpful })}
                        </span>
                      )}
                      {r.bonus && (
                        <span className="inline-flex items-center gap-1 font-semibold text-success">
                          <Gift className="h-3.5 w-3.5" /> {t("mine.bonusAwarded")}
                        </span>
                      )}
                      {r.reply && <span className="font-semibold text-primary">{t("mine.hasReply")}</span>}
                      {r.editable && (
                        <Link href={`/account/reviews/${r.id}/edit`} className="font-semibold text-fg hover:underline">
                          {t("form.editTitle")} · {t("form.editableUntil", { date: fmtDay(r.editableUntil, locale) })}
                        </Link>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
