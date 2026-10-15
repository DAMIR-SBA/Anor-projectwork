"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MessageCircleQuestion, Store } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Textarea, FormError } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { answerQuestionAction, askQuestionAction, loadQuestionsAction } from "@/server/actions/reviews";
import { fmtDay } from "@/lib/format-date";

type Answer = { id: string; text: string; isSeller: boolean; author: string | null; createdAt: string; pending: boolean };
type Question = { id: string; text: string; author: string | null; createdAt: string; pending: boolean; answers: Answer[] };
type Data = { canAnswer: boolean; total: number; hasMore: boolean; items: Question[] };

export function QuestionsSection({ productId, slug, initial, signedIn }: { productId: string; slug: string; initial: Data; signedIn: boolean }) {
  const t = useTranslations("qa");
  const toast = useToast();
  const [data, setData] = useState(initial);
  const [page, setPage] = useState(1);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reload = (p = 1) =>
    start(async () => {
      const res = await loadQuestionsAction({ productId, page: p });
      if (!res.ok || !res.data) return;
      const d = res.data as Data;
      setData((prev) => (p === 1 ? d : { ...d, items: [...prev.items, ...d.items] }));
      setPage(p);
    });

  const ask = () =>
    start(async () => {
      setError(null);
      const res = await askQuestionAction({ productId, text });
      if (!res.ok) return setError(res.fieldErrors?.text ?? res.error);
      setText("");
      toast.success(t("sent"));
      reload();
    });

  return (
    <div>
      {signedIn ? (
        <div className="rounded-[14px] bg-surface-2 p-4">
          <label htmlFor="qa-ask" className="text-sm font-bold">
            {t("ask")}
          </label>
          <Textarea id="qa-ask" rows={2} maxLength={1000} className="mt-1.5 bg-surface" placeholder={t("askPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-muted">{t("askHint")}</p>
            <Button size="sm" onClick={ask} loading={pending} disabled={text.trim().length < 5}>
              {t("ask")}
            </Button>
          </div>
          <FormError message={error} />
        </div>
      ) : (
        <Link href={`/auth/login?next=/p/${slug}#qa`} className="flex items-center gap-2 rounded-[14px] bg-surface-2 p-4 text-sm font-semibold text-primary hover:underline">
          <MessageCircleQuestion className="h-5 w-5" /> {t("askLogin")}
        </Link>
      )}

      {data.items.length === 0 ? (
        <p className="py-6 text-center text-muted">{t("empty")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {data.items.map((q) => (
            <QuestionItem key={q.id} q={q} canAnswer={data.canAnswer} onAnswered={() => reload()} />
          ))}
        </ul>
      )}
      {data.hasMore && (
        <div className="mt-2 text-center">
          <Button variant="outline" onClick={() => reload(page + 1)} loading={pending}>
            {t("more")}
          </Button>
        </div>
      )}
    </div>
  );
}

function QuestionItem({ q, canAnswer, onAnswered }: { q: Question; canAnswer: boolean; onAnswered: () => void }) {
  const t = useTranslations("qa");
  const locale = useLocale();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li className="py-4">
      <p className="text-[15px] font-semibold">
        <span className="mr-1.5 text-primary">Q:</span>
        {q.text}
      </p>
      <p className="mt-0.5 text-[13px] text-muted">
        {q.author ?? "—"} · {fmtDay(q.createdAt, locale)}
        {q.pending && <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-fg">{t("pendingNote")}</span>}
      </p>
      {q.answers.length > 0 ? (
        <ul className="mt-2.5 space-y-2 border-l-2 border-border pl-3.5">
          {q.answers.map((a) => (
            <li key={a.id}>
              <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
                {a.isSeller ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">
                    <Store className="h-3 w-3" /> {t("sellerBadge")}
                  </span>
                ) : (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 font-bold text-success">{t("buyerBadge")}</span>
                )}
                <span className="font-semibold">{a.author}</span>
                <span className="text-muted">{fmtDay(a.createdAt, locale)}</span>
                {a.pending && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-bold">{t("pendingNote")}</span>}
              </p>
              <p className="mt-0.5 whitespace-pre-line text-[15px] leading-relaxed">{a.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[13px] text-muted">{t("noAnswer")}</p>
      )}
      {canAnswer && !q.pending && (
        <div className="mt-2">
          {open ? (
            <div>
              <Textarea rows={2} maxLength={2000} aria-label={t("answer")} placeholder={t("answerPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  loading={pending}
                  disabled={text.trim().length < 2}
                  onClick={() =>
                    start(async () => {
                      const res = await answerQuestionAction({ questionId: q.id, text });
                      if (!res.ok) return setError(res.fieldErrors?.text ?? res.error);
                      toast.success(t("answerSent"));
                      setOpen(false);
                      setText("");
                      onAnswered();
                    })
                  }
                >
                  {t("answer")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  ✕
                </Button>
              </div>
              <FormError message={error} />
            </div>
          ) : (
            <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-primary hover:underline">
              {t("answer")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
