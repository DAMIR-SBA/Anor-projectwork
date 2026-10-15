"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Gift, Star } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Field, FormError, Switch, Textarea } from "@/components/ui/form";
import { ImageUploader } from "@/components/ui/uploader";
import { useToast } from "@/components/ui/toast";
import { createReviewAction, updateReviewAction } from "@/server/actions/reviews";
import { PHOTO_REVIEW_BONUS, VIDEO_REVIEW_BONUS } from "@/lib/review-moderation";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";

type Initial = { rating: number; pros: string; cons: string; comment: string; isAnonymous: boolean; images: string[]; video: string[] };

/** Accessible 1–5 star picker built on a radio group (arrow keys move between stars). */
export function StarPicker({ value, onChange, name, label, size = 34 }: { value: number; onChange: (v: number) => void; name: string; label: string; size?: number }) {
  const t = useTranslations("reviews");
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="peer sr-only" />
            <Star className={cn("rounded-[6px] transition-transform peer-focus-visible:ring-4 peer-focus-visible:ring-primary/30", n <= shown ? "text-accent" : "text-surface-3", hover === n && "scale-110")} style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            <span className="sr-only">{t(`ratingLabels.${n}` as "ratingLabels.5")}</span>
          </label>
        ))}
        {shown > 0 && <span className="ml-2 text-sm font-bold">{t(`ratingLabels.${shown}` as "ratingLabels.5")}</span>}
      </div>
    </fieldset>
  );
}

export function ReviewForm({ mode, orderId, productId, reviewId, productSlug, initial }: { mode: "new" | "edit"; orderId?: string; productId?: string; reviewId?: string; productSlug: string; initial?: Initial }) {
  const t = useTranslations("reviews");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<Initial>(initial ?? { rating: 0, pros: "", cons: "", comment: "", isAnonymous: false, images: [], video: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Initial>(k: K, val: Initial[K]) => setV((p) => ({ ...p, [k]: val }));

  const submit = () => {
    if (!v.rating) return setErrors({ rating: t("form.ratingRequired") });
    start(async () => {
      setErrors({});
      setError(null);
      const payload = { rating: v.rating, pros: v.pros, cons: v.cons, comment: v.comment, isAnonymous: v.isAnonymous, media: [...v.images, ...v.video] };
      const res = mode === "new" ? await createReviewAction({ ...payload, orderId: orderId!, productId: productId! }) : await updateReviewAction({ ...payload, reviewId: reviewId! });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        return setError(res.error);
      }
      const status = (res.data as { status: string }).status;
      toast.success(status === "APPROVED" ? t("form.published") : t("form.pending"));
      router.push(status === "APPROVED" ? `/p/${productSlug}#reviews` : "/account/reviews");
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <Field label={t("form.rating")} error={errors.rating} required>
        <StarPicker
          name="rating"
          value={v.rating}
          onChange={(n) => {
            set("rating", n);
            setErrors({});
            setError(null);
          }}
          label={t("form.rating")}
        />
      </Field>
      <Field label={t("pros")} htmlFor="r-pros" error={errors.pros}>
        <Textarea id="r-pros" rows={2} maxLength={1000} placeholder={t("form.prosPlaceholder")} value={v.pros} onChange={(e) => set("pros", e.target.value)} />
      </Field>
      <Field label={t("cons")} htmlFor="r-cons" error={errors.cons}>
        <Textarea id="r-cons" rows={2} maxLength={1000} placeholder={t("form.consPlaceholder")} value={v.cons} onChange={(e) => set("cons", e.target.value)} />
      </Field>
      <Field label={t("comment")} htmlFor="r-comment" error={errors.comment}>
        <Textarea id="r-comment" rows={4} maxLength={3000} placeholder={t("form.commentPlaceholder")} value={v.comment} onChange={(e) => set("comment", e.target.value)} />
      </Field>
      <Field label={t("form.media")} hint={t("form.mediaHint")}>
        <div className="flex flex-wrap items-start gap-3">
          <ImageUploader value={v.images} onChange={(urls) => set("images", urls)} folder="reviews" max={6} />
          <ImageUploader value={v.video} onChange={(urls) => set("video", urls)} folder="reviews" max={1} kind="video" accept="video/mp4,video/webm,video/quicktime" />
        </div>
      </Field>
      <p className="flex items-start gap-2 rounded-[12px] bg-accent/15 p-3 text-sm">
        <Gift className="mt-0.5 h-4 w-4 shrink-0" /> {t("form.bonusHint", { photo: formatUZS(PHOTO_REVIEW_BONUS, locale), video: formatUZS(VIDEO_REVIEW_BONUS, locale) })}
      </p>
      <Switch label={<span>{t("form.anonymous")} <span className="block text-[13px] text-muted">{t("form.anonymousHint")}</span></span>} checked={v.isAnonymous} onChange={(e) => set("isAnonymous", e.target.checked)} />
      <p className="text-[13px] text-muted">{t("form.rules")}</p>
      <FormError message={error} />
      <Button size="lg" className="w-full sm:w-auto" loading={pending} onClick={submit}>
        {mode === "new" ? t("form.submit") : t("form.update")}
      </Button>
    </div>
  );
}
