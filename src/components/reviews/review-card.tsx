"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, Flag, Languages, Store, ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Avatar } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Radio, Textarea, FormError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { Stars } from "@/components/product/rating";
import { MediaLightbox, MediaThumb } from "./media-lightbox";
import { reportReviewAction, translateReviewAction, voteReviewAction } from "@/server/actions/reviews";
import { REPORT_REASONS } from "@/lib/review-moderation";
import type { ReviewView } from "@/server/services/review-queries";
import { fmtDay } from "@/lib/format-date";
import { cn } from "@/lib/cn";

type Translation = { pros?: string | null; cons?: string | null; comment?: string | null };

function Block({ label, text }: { label?: string; text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div>
      {label && <p className="text-[13px] font-bold">{label}</p>}
      <p className="whitespace-pre-line text-[15px] leading-relaxed">{text}</p>
    </div>
  );
}

export function ReviewCard({ review, signedIn }: { review: ReviewView; signedIn: boolean }) {
  const t = useTranslations("reviews");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [votes, setVotes] = useState({ helpful: review.helpful, notHelpful: review.notHelpful, mine: review.myVote });
  const [pending, start] = useTransition();
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [showTr, setShowTr] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const vote = (value: 1 | -1) => {
    if (!signedIn) return router.push(`/auth/login?next=${encodeURIComponent(window.location.pathname)}#reviews`);
    const prev = votes;
    // Optimistic toggle; server returns the authoritative counts.
    const undo = prev.mine === value;
    setVotes({
      helpful: prev.helpful + (value === 1 ? (undo ? -1 : 1) : prev.mine === 1 ? -1 : 0),
      notHelpful: prev.notHelpful + (value === -1 ? (undo ? -1 : 1) : prev.mine === -1 ? -1 : 0),
      mine: undo ? 0 : value,
    });
    start(async () => {
      const res = await voteReviewAction({ reviewId: review.id, value });
      if (res.ok && res.data) setVotes(res.data as typeof votes);
      else {
        setVotes(prev);
        if (!res.ok) toast.error(res.error);
      }
    });
  };

  const translate = () => {
    if (translation) return setShowTr((s) => !s);
    start(async () => {
      const res = await translateReviewAction({ reviewId: review.id });
      if (res.ok && res.data) {
        setTranslation(res.data as Translation);
        setShowTr(true);
      } else if (!res.ok) toast.error(res.error);
    });
  };

  const shown = showTr && translation ? translation : review;

  return (
    <article className="py-5 first:pt-0">
      <header className="flex items-start gap-3">
        <Avatar name={review.author ?? "?"} size={40} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-[15px] font-bold">
            {review.author ?? t("anonymous")}
            {review.mine && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{t("yourReview")}</span>}
            {review.pending && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-bold">{t("mine.status.PENDING")}</span>}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted">
            <Stars value={review.rating} size={13} />
            <time dateTime={review.createdAt}>{fmtDay(review.createdAt, locale)}</time>
            <span className="inline-flex items-center gap-1 text-success">
              <BadgeCheck className="h-3.5 w-3.5" /> {t("verified")}
            </span>
          </p>
        </div>
      </header>

      <div className="mt-3 space-y-2.5">
        {review.variant && <p className="text-[13px] text-muted">{t("variantLabel", { name: review.variant })}</p>}
        <Block label={t("pros")} text={shown.pros} />
        <Block label={t("cons")} text={shown.cons} />
        <Block label={shown.pros || shown.cons ? t("comment") : undefined} text={shown.comment} />
        {showTr && translation && <p className="text-xs font-semibold text-muted">{t("translated")}</p>}
      </div>

      {review.media.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {review.media.map((m, i) => (
            <MediaThumb key={m.url + i} item={m} onClick={() => setLightbox(i)} label={t("photoN", { n: i + 1 })} />
          ))}
        </div>
      )}

      {review.reply && (
        <div className="mt-3 rounded-[12px] bg-surface-2 p-3.5">
          <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-bold">
            <Store className="h-4 w-4 text-primary" /> {t("sellerReply")} · {review.reply.shop}
            <span className="font-normal text-muted">{fmtDay(review.reply.createdAt, locale)}</span>
          </p>
          <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{review.reply.text}</p>
        </div>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-1 text-[13px]">
        <span className="mr-1 text-muted max-sm:hidden">{t("helpfulQuestion")}</span>
        <button type="button" onClick={() => vote(1)} disabled={pending || review.mine} aria-pressed={votes.mine === 1} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-semibold hover:bg-surface-3 disabled:opacity-60", votes.mine === 1 && "bg-success/10 text-success")}>
          <ThumbsUp className="h-4 w-4" /> <span className="sr-only">{t("helpful")}</span> {votes.helpful}
        </button>
        <button type="button" onClick={() => vote(-1)} disabled={pending || review.mine} aria-pressed={votes.mine === -1} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-semibold hover:bg-surface-3 disabled:opacity-60", votes.mine === -1 && "bg-danger/10 text-danger")}>
          <ThumbsDown className="h-4 w-4" /> <span className="sr-only">{t("notHelpful")}</span> {votes.notHelpful}
        </button>
        {review.translatable && (
          <button type="button" onClick={translate} disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-semibold text-info hover:bg-surface-3">
            <Languages className="h-4 w-4" /> {showTr ? t("showOriginal") : t("translate")}
          </button>
        )}
        {!review.mine && (
          <button
            type="button"
            onClick={() => (signedIn ? setReportOpen(true) : router.push(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`))}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-muted hover:bg-surface-3 hover:text-fg"
          >
            <Flag className="h-3.5 w-3.5" /> {t("report")}
          </button>
        )}
      </footer>

      {lightbox !== null && <MediaLightbox items={review.media} index={lightbox} onClose={() => setLightbox(null)} />}
      {reportOpen && <ReportDialog reviewId={review.id} onClose={() => setReportOpen(false)} />}
    </article>
  );
}

function ReportDialog({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const t = useTranslations("reviews");
  const tc = useTranslations("common");
  const toast = useToast();
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>("spam");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("reportTitle")}
      variant="sheet"
      closeLabel={tc("close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await reportReviewAction({ reviewId, reason, details });
                if (res.ok) {
                  toast.success(t("reportSent"));
                  onClose();
                } else setError(res.error);
              })
            }
          >
            {tc("submit")}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-bold">{t("reportReason")}</legend>
        {REPORT_REASONS.map((r) => (
          <Radio key={r} className="flex" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} label={t(`reasons.${r}`)} />
        ))}
      </fieldset>
      <label className="mt-4 block text-sm font-bold" htmlFor="report-details">
        {t("reportDetails")}
      </label>
      <Textarea id="report-details" className="mt-1.5" rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
      <FormError message={error} />
    </Dialog>
  );
}
