"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Ban, Check, EyeOff, Scissors, Undo2, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Checkbox, FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { Stars } from "@/components/product/rating";
import { moderateQAAction, moderateReviewsAction, moderateShopReviewAction } from "@/server/actions/reviews";
import { fmtDateTime } from "@/lib/format-date";
import type { ModRow } from "@/server/services/review-queries";
import { cn } from "@/lib/cn";

type Act = "APPROVE" | "REJECT" | "HIDE" | "STRIP_CONTACTS" | "BAN_REVIEWER" | "RESTORE" | "REMOVAL_APPROVED" | "REMOVAL_REJECTED" | "DISMISS_REPORTS";

const ACTIONS_BY_TAB: Record<string, Act[]> = {
  flagged: ["APPROVE", "REJECT", "STRIP_CONTACTS", "HIDE", "BAN_REVIEWER"],
  reported: ["DISMISS_REPORTS", "HIDE", "STRIP_CONTACTS", "REJECT", "BAN_REVIEWER"],
  removal: ["REMOVAL_REJECTED", "REMOVAL_APPROVED", "STRIP_CONTACTS"],
};

const ICON: Partial<Record<Act, React.ReactNode>> = {
  APPROVE: <Check className="h-4 w-4" />,
  REJECT: <X className="h-4 w-4" />,
  HIDE: <EyeOff className="h-4 w-4" />,
  STRIP_CONTACTS: <Scissors className="h-4 w-4" />,
  BAN_REVIEWER: <Ban className="h-4 w-4" />,
  DISMISS_REPORTS: <Undo2 className="h-4 w-4" />,
  REMOVAL_APPROVED: <EyeOff className="h-4 w-4" />,
  REMOVAL_REJECTED: <Check className="h-4 w-4" />,
};

const variantFor = (a: Act) => (a === "APPROVE" || a === "DISMISS_REPORTS" || a === "REMOVAL_REJECTED" ? "success" : a === "BAN_REVIEWER" || a === "REJECT" ? "danger" : "outline");

export function ReviewModerationQueue({ rows, tab }: { rows: ModRow[]; tab: "flagged" | "reported" | "removal" }) {
  const t = useTranslations("moderation");
  const tr = useTranslations("reviews");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const actions = ACTIONS_BY_TAB[tab];
  const flagNames = (action: string, reason: string) => (action === "AUTO_FLAG" ? reason.split(",").map((f) => (t.has(`flags.${f}`) ? t(`flags.${f}` as "flags.SPAM") : f)).join(", ") : reason);

  const run = (act: Act, ids: string[]) => {
    if (act === "BAN_REVIEWER" && !window.confirm(t("confirmBan"))) return;
    start(async () => {
      setError(null);
      const res = await moderateReviewsAction({ ids, act, reason: reason || undefined });
      if (!res.ok) return setError(res.fieldErrors?.reason ?? res.error);
      toast.success(t("done", { count: ids.length }));
      setSelected(new Set());
      setReason("");
      router.refresh();
    });
  };

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div>
      <div className="sticky top-16 z-20 -mx-1 mb-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-border bg-surface/95 p-2.5 backdrop-blur">
        <Checkbox label={selected.size ? t("selected", { count: selected.size }) : t("selectAll")} checked={selected.size > 0 && selected.size === rows.length} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} aria-label={t("reason")} className="h-9 min-w-48 flex-1 text-sm" maxLength={500} />
        <div className="flex flex-wrap gap-1.5">
          {actions.map((a) => (
            <Button key={a} size="sm" variant={variantFor(a)} disabled={!selected.size} loading={pending} onClick={() => run(a, [...selected])}>
              {ICON[a]} {t(`actions.${a}`)}
            </Button>
          ))}
        </div>
        <FormError message={error} />
      </div>

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className={cn("card p-4 transition-shadow", selected.has(r.id) && "ring-2 ring-primary")}>
            <div className="flex gap-3">
              <input type="checkbox" aria-label={r.id} className="mt-1 h-5 w-5 shrink-0 accent-[#C8102E]" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <a href={`/p/${r.product.slug}#reviews`} target="_blank" rel="noopener" className="line-clamp-1 text-sm font-bold text-primary hover:underline">
                      {r.product.title}
                    </a>
                    <p className="text-xs text-muted">
                      {r.product.shop} · {fmtDateTime(r.createdAt, locale)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {r.flagScore > 0 && (
                      <Badge tone={r.flagScore >= 50 ? "danger" : "accent"}>
                        <AlertTriangle className="h-3 w-3" /> {t("score", { score: r.flagScore })}
                      </Badge>
                    )}
                    {r.flags.map((f) => (
                      <Badge key={f} tone="neutral">
                        {t.has(`flags.${f}`) ? t(`flags.${f}` as "flags.SPAM") : f}
                      </Badge>
                    ))}
                  </div>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <Stars value={r.rating} size={13} />
                  <span className="font-semibold">{t("author", { login: r.author.login })}</span>
                  <span className="text-muted">
                    {t("accountAge", { days: r.author.ageDays })} · {t("authorReviews", { count: r.author.reviews })}
                  </span>
                  {r.author.banned && <Badge tone="danger">{t("banned")}</Badge>}
                </p>
                <div className="mt-2 space-y-1 text-[15px]">
                  {r.pros && (
                    <p>
                      <b>{tr("pros")}:</b> {r.pros}
                    </p>
                  )}
                  {r.cons && (
                    <p>
                      <b>{tr("cons")}:</b> {r.cons}
                    </p>
                  )}
                  {r.comment && <p className="whitespace-pre-line">{r.comment}</p>}
                </div>
                {r.media.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {r.media.map((m, i) => (
                      <a key={`${m.url}-${i}`} href={m.url} target="_blank" rel="noopener" className="relative h-14 w-14 overflow-hidden rounded-[8px] bg-surface-2">
                        {m.type === "VIDEO" ? <video src={m.url} className="h-full w-full object-cover" muted /> : <Image src={m.url} alt="" fill sizes="56px" className="object-cover" />}
                      </a>
                    ))}
                  </div>
                )}
                {r.reports.length > 0 && (
                  <div className="mt-3 rounded-[10px] bg-danger/5 p-2.5 text-[13px]">
                    <p className="font-bold text-danger">{t("reports", { count: r.reports.length })}</p>
                    <ul className="mt-1 space-y-0.5">
                      {r.reports.map((rep) => (
                        <li key={rep.id}>
                          {rep.source === "SELLER" && <Badge tone="info" className="mr-1">{t("sellerRequest")}</Badge>}
                          <b>{rep.login}</b>: {rep.source === "SELLER" ? rep.reason : tr.has(`reasons.${rep.reason}`) ? tr(`reasons.${rep.reason}` as "reasons.spam") : rep.reason}
                          {rep.details && <span className="text-muted"> — {rep.details}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.history.length > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    {r.history.map((h) => `${t(`actions.${h.action}` as "actions.APPROVE")}${h.reason ? ` (${flagNames(h.action, h.reason)})` : ""} · ${fmtDateTime(h.createdAt, locale)}`).join(" → ")}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {actions.slice(0, 3).map((a) => (
                    <Button key={a} size="sm" variant={variantFor(a)} className="h-8" disabled={pending} onClick={() => run(a, [r.id])}>
                      {ICON[a]} {t(`actions.${a}`)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QAModerationButtons({ kind, id }: { kind: "question" | "answer"; id: string }) {
  const t = useTranslations("moderation");
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (publish: boolean) =>
    start(async () => {
      await moderateQAAction({ kind, id, publish });
      router.refresh();
    });
  return (
    <div className="flex shrink-0 gap-1.5">
      <Button size="sm" variant="success" className="h-8" loading={pending} onClick={() => go(true)}>
        <Check className="h-4 w-4" /> {t("publish")}
      </Button>
      <Button size="sm" variant="outline" className="h-8" disabled={pending} onClick={() => go(false)}>
        <EyeOff className="h-4 w-4" /> {t("hide")}
      </Button>
    </div>
  );
}

export function ShopReviewModerationButtons({ id }: { id: string }) {
  const t = useTranslations("moderation");
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (approve: boolean) =>
    start(async () => {
      await moderateShopReviewAction({ id, approve });
      router.refresh();
    });
  return (
    <div className="flex shrink-0 gap-1.5">
      <Button size="sm" variant="success" className="h-8" loading={pending} onClick={() => go(true)}>
        <Check className="h-4 w-4" /> {t("actions.APPROVE")}
      </Button>
      <Button size="sm" variant="danger" className="h-8" disabled={pending} onClick={() => go(false)}>
        <X className="h-4 w-4" /> {t("actions.REJECT")}
      </Button>
    </div>
  );
}
