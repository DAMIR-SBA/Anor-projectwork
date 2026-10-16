"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Award, BookOpen, Check, CheckCircle2, Circle, Crown, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { FormError, Radio } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { submitQuizAction, upgradeProAction } from "@/server/actions/seller-growth";
import type { academyOverview, tierStatus } from "@/server/services/seller/academy";
import { PRO_KEEP_SCORE, PRO_REQUIREMENTS as requirements, QUIZ_PASS_SCORE } from "@/lib/seller";
import { cn } from "@/lib/cn";

type Course = Awaited<ReturnType<typeof academyOverview>>[number];
type Tier = Awaited<ReturnType<typeof tierStatus>>;
type Result = { score: number; passed: boolean; right: number; total: number; correct: boolean[] };

export function CourseCard({ course }: { course: Course }) {
  const t = useTranslations("sellerAcademy");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Array<number | null>>(() => course.quiz.map(() => null));
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = answers.every((a) => a !== null);
  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]", course.passed ? "bg-success/15 text-success" : "bg-primary/10 text-primary")}>{course.passed ? <Award className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{course.title}</h3>
            {course.required && <Badge tone="primary">{t("requiredForPro")}</Badge>}
            {course.passed && <Badge tone="success">{t("certified")}</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted">{course.summary}</p>
          <p className="mt-1 text-[12px] text-muted">
            {t("meta", { minutes: course.minutes, lessons: course.lessons.length, questions: course.quiz.length })}
            {course.best !== null && ` · ${t("best", { score: course.best })}`}
          </p>
        </div>
        <Button size="sm" variant={open ? "secondary" : course.passed ? "outline" : "primary"} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? t("hide") : course.passed ? t("review") : t("start")}
        </Button>
      </div>
      {open && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <ol className="space-y-3">
            {course.lessons.map((l, i) => (
              <li key={i}>
                <h4 className="font-semibold">
                  {i + 1}. {l.title}
                </h4>
                <p className="mt-0.5 text-[15px] leading-relaxed">{l.body}</p>
              </li>
            ))}
          </ol>
          <form
            className="space-y-4 rounded-[14px] bg-surface-2 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                setError(null);
                const res = await submitQuizAction({ course: course.key, answers });
                if (!res.ok) return setError(res.error);
                setResult(res.data as Result);
                router.refresh();
              });
            }}
          >
            <h4 className="font-bold">{t("quiz", { pass: QUIZ_PASS_SCORE })}</h4>
            {course.quiz.map((q, qi) => (
              <fieldset key={qi} className="space-y-1.5">
                <legend className="flex items-center gap-1.5 font-semibold">
                  {result && (result.correct[qi] ? <Check className="h-4 w-4 text-success" aria-label={t("right")} /> : <X className="h-4 w-4 text-danger" aria-label={t("wrong")} />)}
                  {qi + 1}. {q.q}
                </legend>
                {q.options.map((o, oi) => (
                  <Radio
                    key={oi}
                    className="flex"
                    name={`${course.key}-${qi}`}
                    checked={answers[qi] === oi}
                    onChange={() => {
                      setResult(null);
                      setAnswers((a) => a.map((x, j) => (j === qi ? oi : x)));
                    }}
                    label={o}
                  />
                ))}
              </fieldset>
            ))}
            <FormError message={error} />
            {result && (
              <p role="status" className={cn("rounded-[10px] p-2.5 text-sm font-semibold", result.passed ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
                {result.passed ? t("passed", { score: result.score }) : t("failed", { score: result.score, right: result.right, total: result.total })}
              </p>
            )}
            <Button type="submit" loading={pending} disabled={!done}>
              {result && !result.passed ? t("retry") : t("submit")}
            </Button>
          </form>
        </div>
      )}
    </li>
  );
}

const CHECKS = ["score", "tenure", "orders", "kyc", "certified", "standing"] as const;

export function ProPanel({ tier }: { tier: Tier }) {
  const t = useTranslations("sellerAcademy");
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const values: Record<(typeof CHECKS)[number], string> = {
    score: t("checks.score", { min: requirements.minScore, value: tier.score.toFixed(1) }),
    tenure: t("checks.tenure", { min: requirements.minDays, value: tier.days }),
    orders: t("checks.orders", { min: requirements.minOrders, value: tier.orders90d }),
    kyc: t("checks.kyc", { min: requirements.minKyc, value: tier.kycLevel }),
    certified: t("checks.certified"),
    standing: t("checks.standing"),
  };
  const isPro = tier.tier === "PRO";
  return (
    <section className={cn("card p-5", isPro && "ring-2 ring-accent")} aria-labelledby="pro-title">
      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5 text-accent" />
        <h2 id="pro-title" className="text-lg font-extrabold">
          {isPro ? t("proActive") : t("proTitle")}
        </h2>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {(["commission", "ab", "competitors", "support", "badge"] as const).map((b) => (
          <li key={b} className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {t(`benefits.${b}`)}
          </li>
        ))}
      </ul>
      {!isPro && (
        <>
          <h3 className="mt-4 text-sm font-bold">{t("requirements")}</h3>
          <ul className="mt-1.5 space-y-1 text-sm">
            {CHECKS.map((c) => (
              <li key={c} className={cn("flex gap-2", !tier.checks[c] && "text-muted")}>
                {tier.checks[c] ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label={t("met")} /> : <Circle className="mt-0.5 h-4 w-4 shrink-0" aria-label={t("notMet")} />}
                {values[c]}
              </li>
            ))}
          </ul>
          <Button
            className="mt-4 w-full"
            variant="accent"
            disabled={!tier.eligible}
            loading={pending}
            onClick={() =>
              start(async () => {
                const res = await upgradeProAction({});
                if (!res.ok) return toast.error(res.error);
                toast.success(t("upgraded"));
                router.refresh();
              })
            }
          >
            {t("upgrade")}
          </Button>
        </>
      )}
      {isPro && <p className="mt-3 text-[13px] text-muted">{t("keep", { n: PRO_KEEP_SCORE })}</p>}
    </section>
  );
}
