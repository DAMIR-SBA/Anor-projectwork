import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2, MessageCircleQuestion } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireSeller } from "@/server/auth/guards";
import { sellerQuestions } from "@/server/services/review-queries";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { Pagination } from "@/components/ui/pagination";
import { SellerAnswerBox } from "@/components/seller/review-inbox";
import { fmtDateTime } from "@/lib/format-date";
import { locText } from "@/lib/localized";
import { cn } from "@/lib/cn";

export default async function SellerQuestionsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const { user } = await requireSeller("/seller/questions");
  const t = await getTranslations("seller.questions");
  const tq = await getTranslations("qa");
  const tab = sp.tab === "all" ? "all" : "unanswered";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await sellerQuestions(user.id, tab, page);
  return (
    <div className="max-w-4xl">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <nav className="mb-4 flex gap-1 border-b border-border" aria-label={t("title")}>
        {(["unanswered", "all"] as const).map((k) => (
          <Link key={k} href={`/seller/questions?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold", tab === k ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>
            {t(`tabs.${k}`)} {k === "unanswered" && data.unanswered ? <span className="rounded-full bg-surface-3 px-1.5 text-xs text-fg">{data.unanswered}</span> : null}
          </Link>
        ))}
      </nav>
      {data.items.length === 0 ? (
        <EmptyState className="card" icon={<MessageCircleQuestion className="h-8 w-8" />} title={t("empty")} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((q) => {
            const sellerAnswer = q.answers.find((a) => a.isSeller);
            return (
              <li key={q.id} className="card p-4">
                <Link href={`/p/${q.product.slug}#qa`} className="line-clamp-1 text-sm font-bold text-primary hover:underline">
                  {locText(q.product.titleUz, locale)}
                </Link>
                <p className="mt-1.5 text-[15px] font-semibold">{q.text}</p>
                <p className="text-xs text-muted">
                  {q.user.name?.split(" ")[0]} · {fmtDateTime(q.createdAt, locale)} · {tq("answers", { count: q.answers.length })}
                </p>
                {sellerAnswer ? (
                  <p className="mt-2 flex items-start gap-1.5 rounded-[10px] bg-surface-2 p-2.5 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {sellerAnswer.text}
                  </p>
                ) : (
                  <SellerAnswerBox questionId={q.id} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} total={data.total} pageSize={15} />
    </div>
  );
}
