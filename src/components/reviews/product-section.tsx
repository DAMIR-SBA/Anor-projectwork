import { getLocale, getTranslations } from "next-intl/server";
import { PenLine, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";
import { getCurrentUser } from "@/server/auth/session";
import { listProductReviews, listQuestions, pendingReviewFor, productReviewStats } from "@/server/services/review-queries";
import { ReviewBrowser } from "./review-browser";
import { QuestionsSection } from "./questions";

/** Product page: rating breakdown, "What buyers say", filterable reviews, buyer media and Q&A. */
export async function ProductReviewsSection({ productId, productSlug }: { productId: string; productSlug: string }) {
  const t = await getTranslations("reviews");
  const tq = await getTranslations("qa");
  const locale = await getLocale();
  const user = await getCurrentUser();
  const [stats, initial, questions, pending] = await Promise.all([
    productReviewStats(productId, locale),
    listProductReviews({ productId, sort: "helpful", filter: {}, page: 1, viewerId: user?.id ?? null, locale }),
    listQuestions(productId, user?.id ?? null, locale),
    user ? pendingReviewFor(user.id, productId) : null,
  ]);

  const cta = !user ? (
    <Link href={`/auth/login?next=/p/${productSlug}#reviews`} className={buttonClasses("outline", "md", "h-auto min-h-11 w-full whitespace-normal py-2 text-center")}>
      <PenLine className="h-4 w-4" /> {t("loginToWrite")}
    </Link>
  ) : pending && "orderId" in pending ? (
    <Link href={`/account/reviews/new?order=${pending.orderId}&product=${productId}`} className={buttonClasses("primary", "md", "h-auto min-h-11 w-full whitespace-normal py-2 text-center")}>
      <PenLine className="h-4 w-4" /> {t("write")}
    </Link>
  ) : pending?.reviewId ? (
    <Link href={`/account/reviews/${pending.reviewId}/edit`} className={buttonClasses("secondary", "md", "h-auto min-h-11 w-full whitespace-normal py-2 text-center")}>
      {t("alreadyWrote")}
    </Link>
  ) : (
    <p className="text-[13px] text-muted">{t("writeHint")}</p>
  );

  const s = stats.summary;
  const summary =
    s && (s.pros.length || s.cons.length) ? (
      <div className="rounded-[14px] border border-border p-4">
        <p className="flex flex-wrap items-center gap-x-2 text-sm font-bold">
          <Sparkles className="h-4 w-4 text-primary" /> {t("whatBuyersSay")}
          <span className="font-normal text-muted">
            {s.source === "ai" ? t("aiSummary") : t("rulesSummary")} · {t("summaryBasis", { count: s.basedOn })}
          </span>
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {s.pros.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-success">
                <ThumbsUp className="h-3.5 w-3.5" /> {t("likes")}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {s.pros.map((p) => (
                  <li key={p} className="rounded-full bg-success/10 px-2.5 py-1 text-[13px] font-semibold">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.cons.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-danger">
                <ThumbsDown className="h-3.5 w-3.5" /> {t("dislikes")}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {s.cons.map((p) => (
                  <li key={p} className="rounded-full bg-danger/10 px-2.5 py-1 text-[13px] font-semibold">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {s.mentions.length > 0 && (
          <p className="mt-3 text-[13px] text-muted">
            {t("mentions")}: {s.mentions.map((m) => (m.count ? `${m.term} (${m.count})` : m.term)).join(", ")}
          </p>
        )}
      </div>
    ) : null;

  return (
    <>
      <Card id="reviews" className="scroll-mt-20 p-5">
        <h2 className="mb-4 text-xl font-extrabold">
          {t("title")} {stats.count > 0 && <span className="text-muted">{stats.count}</span>}
        </h2>
        <ReviewBrowser productId={productId} stats={stats} initial={initial} signedIn={!!user} summary={summary} cta={cta} />
      </Card>
      <Card id="qa" className="scroll-mt-20 p-5">
        <h2 className="mb-4 text-xl font-extrabold">
          {tq("title")} {questions.total > 0 && <span className="text-muted">{questions.total}</span>}
        </h2>
        <QuestionsSection productId={productId} slug={productSlug} initial={questions} signedIn={!!user} />
      </Card>
    </>
  );
}
