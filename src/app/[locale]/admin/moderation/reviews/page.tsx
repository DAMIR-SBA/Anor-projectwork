import { getTranslations } from "next-intl/server";
import { BarChart3, Inbox } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/server/auth/guards";
import { moderationCounts, moderationHistory, moderationQueue, pendingQA, pendingShopReviews, type ModTab } from "@/server/services/review-queries";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { QAModerationButtons, ReviewModerationQueue, ShopReviewModerationButtons } from "@/components/admin/review-moderation";
import { fmtDateTime } from "@/lib/format-date";
import { cn } from "@/lib/cn";

const TABS: ModTab[] = ["flagged", "reported", "removal", "qa", "shop", "history"];
const PAGE = 20;

export default async function ReviewModerationPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string; page?: string; q?: string; minScore?: string }> }) {
  const { locale } = await params;
  await requireStaff("reviews.moderate");
  const t = await getTranslations("moderation");
  const tc = await getTranslations("common");
  const sp = await searchParams;
  const tab = (TABS as string[]).includes(sp.tab ?? "") ? (sp.tab as ModTab) : "flagged";
  const page = Math.max(1, Number(sp.page) || 1);
  const counts = await moderationCounts();

  let body: React.ReactNode;
  if (tab === "flagged" || tab === "reported" || tab === "removal") {
    const { rows: data, total } = await moderationQueue(tab, page, { q: sp.q?.trim() || undefined, minScore: Number(sp.minScore) || undefined }, PAGE);
    body = (
      <>
        <form className="mb-4 flex flex-wrap gap-2" method="get">
          <input type="hidden" name="tab" value={tab} />
          <Input name="q" defaultValue={sp.q} placeholder={t("search")} className="h-10 max-w-72" />
          {tab === "flagged" && (
            <Input name="minScore" type="number" min={0} max={100} defaultValue={sp.minScore} placeholder={t("minScore")} aria-label={t("minScore")} className="h-10 w-32" />
          )}
          <Button type="submit" size="sm" variant="secondary">
            {tc("apply")}
          </Button>
        </form>
        {data.length ? <ReviewModerationQueue rows={data} tab={tab} /> : <EmptyState className="card" icon={<Inbox className="h-8 w-8" />} title={t("empty")} />}
        <div className="mt-4">
          <Pagination page={page} total={total} pageSize={PAGE} />
        </div>
      </>
    );
  } else if (tab === "qa") {
    const { questions, answers } = await pendingQA();
    body =
      questions.length + answers.length === 0 ? (
        <EmptyState className="card" icon={<Inbox className="h-8 w-8" />} title={t("empty")} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {[
            { title: t("questionsPending"), items: questions.map((q) => ({ id: q.id, kind: "question" as const, text: q.text, login: q.user.login, product: q.product, at: q.createdAt, context: null })) },
            { title: t("answersPending"), items: answers.map((a) => ({ id: a.id, kind: "answer" as const, text: a.text, login: a.user.login, product: a.question.product, at: a.createdAt, context: a.question.text })) },
          ].map((col) => (
            <section key={col.title}>
              <h2 className="mb-2 font-bold">
                {col.title} <span className="text-muted">{col.items.length}</span>
              </h2>
              <ul className="space-y-2">
                {col.items.map((i) => (
                  <li key={i.id} className="card flex flex-wrap items-start justify-between gap-3 p-3.5">
                    <div className="min-w-0 flex-1">
                      <a href={`/p/${i.product.slug}#qa`} target="_blank" rel="noopener" className="line-clamp-1 text-xs font-bold text-primary">
                        {i.product.titleUz}
                      </a>
                      {i.context && <p className="text-xs text-muted">{t("toQuestion", { text: i.context.slice(0, 80) })}</p>}
                      <p className="mt-1 text-[15px]">{i.text}</p>
                      <p className="text-xs text-muted">
                        {i.login} · {fmtDateTime(i.at, locale)}
                      </p>
                    </div>
                    <QAModerationButtons kind={i.kind} id={i.id} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      );
  } else if (tab === "shop") {
    const rows = await pendingShopReviews();
    body = rows.length ? (
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="card flex flex-wrap items-start justify-between gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {r.shop.name} · №{r.order.number}
              </p>
              <p className="text-xs text-muted">{t("shopScores", { speed: r.deliverySpeed, pack: r.packaging, comm: r.communication })}</p>
              {r.comment && <p className="mt-1 text-[15px]">{r.comment}</p>}
              <p className="text-xs text-muted">
                {r.user.login} · {fmtDateTime(r.createdAt, locale)}
              </p>
            </div>
            <ShopReviewModerationButtons id={r.id} />
          </li>
        ))}
      </ul>
    ) : (
      <EmptyState className="card" icon={<Inbox className="h-8 w-8" />} title={t("empty")} />
    );
  } else {
    const { rows, total } = await moderationHistory(page);
    body = (
      <Card className="p-2 md:p-3">
        <Table head={[tc("date"), t("historyActor"), tc("actions"), t("reason"), tc("details")]}>
          {rows.map((h) => (
            <tr key={h.id} className="align-top">
              <td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(h.createdAt, locale)}</td>
              <td className="font-semibold">{h.actor ?? t("system")}</td>
              <td>
                <Badge tone={h.action === "APPROVE" || h.action === "RESTORE" ? "success" : h.action === "AUTO_FLAG" ? "accent" : "danger"}>{t(`actions.${h.action}`)}</Badge>
              </td>
              <td className="max-w-60 text-xs">{h.reason}</td>
              <td className="max-w-80 text-xs">
                <a href={`/p/${h.review.product.slug}#reviews`} target="_blank" rel="noopener" className="font-semibold text-primary">
                  {h.review.product.titleUz}
                </a>
                <span className="line-clamp-2 text-muted">
                  {h.review.rating}★ {h.review.comment}
                </span>
              </td>
            </tr>
          ))}
        </Table>
        <div className="mt-3">
          <Pagination page={page} total={total} pageSize={30} />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Link href="/admin/moderation/reviews/analytics" className="inline-flex h-9 items-center gap-1.5 rounded-[12px] border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-2">
            <BarChart3 className="h-4 w-4" /> {t("analytics")}
          </Link>
        }
      />
      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label={t("title")}>
        {TABS.map((k) => {
          const n = k === "history" ? 0 : counts[k];
          return (
            <Link key={k} href={`/admin/moderation/reviews?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold", tab === k ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>
              {t(`tabs.${k}`)} {n ? <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-[#1A1A1F]">{n}</span> : null}
            </Link>
          );
        })}
      </nav>
      {body}
    </div>
  );
}
