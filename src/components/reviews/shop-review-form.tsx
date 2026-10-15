"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { FormError, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { StarPicker } from "./review-form";
import { shopReviewAction } from "@/server/actions/reviews";

/** Rate the shop on delivery speed, packaging and communication (one per delivered order). */
export function ShopReviewForm({ orderId, done, compact }: { orderId: string; done?: boolean; compact?: boolean }) {
  const t = useTranslations("reviews.shop");
  const router = useRouter();
  const toast = useToast();
  const [scores, setScores] = useState({ deliverySpeed: 0, packaging: 0, communication: 0 });
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(!!done);
  const [pending, start] = useTransition();
  if (sent)
    return (
      <p className="flex items-center gap-2 text-sm font-semibold text-success">
        <CheckCircle2 className="h-4 w-4" /> {t("done")}
      </p>
    );
  const ready = scores.deliverySpeed && scores.packaging && scores.communication;
  return (
    <div className="space-y-3">
      {(["deliverySpeed", "packaging", "communication"] as const).map((k) => (
        <div key={k} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold">{t(k)}</span>
          <StarPicker name={`${orderId}-${k}`} size={compact ? 24 : 28} value={scores[k]} onChange={(n) => setScores((s) => ({ ...s, [k]: n }))} label={t(k)} />
        </div>
      ))}
      <Textarea rows={2} maxLength={1000} aria-label={t("comment")} placeholder={t("comment")} value={comment} onChange={(e) => setComment(e.target.value)} />
      <FormError message={error} />
      <Button
        size="sm"
        disabled={!ready}
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await shopReviewAction({ orderId, ...scores, comment });
            if (!res.ok) return setError(res.error);
            toast.success(t("thanks"));
            setSent(true);
            router.refresh();
          })
        }
      >
        {t("submit")}
      </Button>
    </div>
  );
}
