"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, Flag, Reply, Store } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Avatar, Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError, Radio, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { Stars } from "@/components/product/rating";
import { MediaLightbox, MediaThumb } from "@/components/reviews/media-lightbox";
import { answerQuestionAction, replyReviewAction, requestRemovalAction } from "@/server/actions/reviews";
import { REMOVAL_REASONS } from "@/lib/review-moderation";
import type { ReviewView } from "@/server/services/review-queries";
import { fmtDay } from "@/lib/format-date";

type SellerReview = ReviewView & { status: string; product: { slug: string; title: string }; removal: { status: "OPEN" | "RESOLVED" | "DISMISSED"; reason: string; decisionNote: string | null } | null };

export function SellerReviewItem({ review }: { review: SellerReview }) {
  const t = useTranslations("seller.reviews");
  const tr = useTranslations("reviews");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(review.reply?.text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [removal, setRemoval] = useState(false);
  const [pending, start] = useTransition();

  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link href={`/p/${review.product.slug}#reviews`} className="line-clamp-1 text-sm font-bold text-primary hover:underline">
          {review.product.title}
        </Link>
        <div className="flex gap-1.5">
          {review.status === "PENDING" && <Badge tone="accent">{t("pendingModeration")}</Badge>}
          {review.removal && <Badge tone={review.removal.status === "OPEN" ? "info" : review.removal.status === "RESOLVED" ? "success" : "neutral"}>{t(`removalStatus.${review.removal.status}`)}</Badge>}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <Avatar name={review.author ?? "?"} size={32} />
        <div className="text-[13px] leading-tight">
          <p className="font-bold">{review.author ?? tr("anonymous")}</p>
          <p className="flex items-center gap-2 text-muted">
            <Stars value={review.rating} size={12} /> {fmtDay(review.createdAt, locale)}
            <BadgeCheck className="h-3.5 w-3.5 text-success" aria-label={tr("verified")} />
          </p>
        </div>
      </div>
      <div className="mt-2 space-y-1.5 text-[15px]">
        {review.variant && <p className="text-[13px] text-muted">{tr("variantLabel", { name: review.variant })}</p>}
        {review.pros && (
          <p>
            <b>{tr("pros")}:</b> {review.pros}
          </p>
        )}
        {review.cons && (
          <p>
            <b>{tr("cons")}:</b> {review.cons}
          </p>
        )}
        {review.comment && <p className="whitespace-pre-line">{review.comment}</p>}
      </div>
      {review.media.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {review.media.map((m, i) => (
            <MediaThumb key={m.url + i} item={m} size={56} onClick={() => setLightbox(i)} label={tr("photoN", { n: i + 1 })} />
          ))}
        </div>
      )}
      {lightbox !== null && <MediaLightbox items={review.media} index={lightbox} onClose={() => setLightbox(null)} />}

      {review.status === "APPROVED" && (
        <div className="mt-3 border-t border-border pt-3">
          {editing ? (
            <div>
              <Textarea rows={3} maxLength={2000} aria-label={t("reply")} placeholder={t("replyPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
              <p className="mt-1 text-xs text-muted">{t("replyHint")}</p>
              <FormError message={error} />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  loading={pending}
                  disabled={text.trim().length < 2}
                  onClick={() =>
                    start(async () => {
                      const res = await replyReviewAction({ reviewId: review.id, text });
                      if (!res.ok) return setError(res.fieldErrors?.text ?? res.error);
                      toast.success(t("replySaved"));
                      setEditing(false);
                      router.refresh();
                    })
                  }
                >
                  <Reply className="h-4 w-4" /> {review.reply ? t("editReply") : t("reply")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  ✕
                </Button>
              </div>
            </div>
          ) : !review.reply ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Reply className="h-4 w-4" /> {t("reply")}
            </Button>
          ) : review.reply ? (
            <div className="rounded-[12px] bg-surface-2 p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-bold">
                <Store className="h-3.5 w-3.5 text-primary" /> {tr("sellerReply")} · {fmtDay(review.reply.createdAt, locale)}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{review.reply.text}</p>
              <button type="button" onClick={() => setEditing(true)} className="mt-1 text-sm font-semibold text-primary hover:underline">
                {t("editReply")}
              </button>
            </div>
          ) : null}
          {!review.removal && (
            <button type="button" onClick={() => setRemoval(true)} className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
              <Flag className="h-3.5 w-3.5" /> {t("requestRemoval")}
            </button>
          )}
          {review.removal?.decisionNote && <p className="mt-2 text-[13px] text-muted">{review.removal.decisionNote}</p>}
        </div>
      )}
      {removal && <RemovalDialog reviewId={review.id} onClose={() => setRemoval(false)} />}
    </li>
  );
}

function RemovalDialog({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const t = useTranslations("seller.reviews");
  const tc = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState<(typeof REMOVAL_REASONS)[number]>("fake");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("removalTitle")}
      closeLabel={tc("close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            loading={pending}
            disabled={details.trim().length < 10}
            onClick={() =>
              start(async () => {
                const res = await requestRemovalAction({ reviewId, reason, details });
                if (!res.ok) return setError(res.fieldErrors?.details ?? res.error);
                toast.success(t("removalSent"));
                onClose();
                router.refresh();
              })
            }
          >
            {tc("submit")}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">{t("removalHint")}</p>
      <fieldset className="space-y-2">
        {REMOVAL_REASONS.map((r) => (
          <Radio key={r} className="flex" name="removal" value={r} checked={reason === r} onChange={() => setReason(r)} label={t(`removalReasons.${r}`)} />
        ))}
      </fieldset>
      <label htmlFor="removal-details" className="mt-4 block text-sm font-bold">
        {t("removalDetails")}
      </label>
      <Textarea id="removal-details" className="mt-1.5" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      <FormError message={error} />
    </Dialog>
  );
}

export function SellerAnswerBox({ questionId }: { questionId: string }) {
  const t = useTranslations("qa");
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-2">
      <Textarea rows={2} maxLength={2000} aria-label={t("answer")} placeholder={t("answerPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
      <FormError message={error} />
      <Button
        size="sm"
        className="mt-2"
        loading={pending}
        disabled={text.trim().length < 2}
        onClick={() =>
          start(async () => {
            const res = await answerQuestionAction({ questionId, text });
            if (!res.ok) return setError(res.fieldErrors?.text ?? res.error);
            toast.success(t("answerSent"));
            setText("");
            router.refresh();
          })
        }
      >
        {t("answer")}
      </Button>
    </div>
  );
}
