"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Gavel, MessageSquarePlus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Textarea } from "@/components/ui/form";
import { ImageUploader } from "@/components/ui/uploader";
import { useToast } from "@/components/ui/toast";
import { approveReturnSellerAction, disputeNoteAction, openDisputeAction } from "@/server/actions/seller-orders";
import type { listSellerReturns } from "@/server/services/seller/orders";
import { formatUZS } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";

type Row = Awaited<ReturnType<typeof listSellerReturns>>["items"][number];

export function ReturnsBoard({ rows }: { rows: Row[] }) {
  const t = useTranslations("sellerReturns");
  const tr = useTranslations("returns");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<{ kind: "dispute" | "note"; row: Row } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="card space-y-3 p-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{r.item.imageUrl && <Image src={r.item.imageUrl} alt="" fill sizes="56px" className="object-cover" />}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {r.number} <Badge tone={r.status === "REQUESTED" ? "accent" : r.status === "DISPUTED" ? "info" : r.status === "REJECTED" ? "danger" : "success"}>{tr(`status.${r.status}` as "status.REQUESTED")}</Badge>
                </p>
                <p className="text-sm">
                  {r.item.title}
                  {r.item.variantTitle ? ` · ${r.item.variantTitle}` : ""} × {r.quantity} · №{r.orderNumber}
                </p>
                <p className="text-[13px] text-muted">
                  {r.buyer} · {fmtDateTime(r.createdAt, locale)} · <b className="text-fg">{tr(`reasons.${r.reason}` as "reasons.defect")}</b>
                </p>
                {r.description && <p className="mt-1 text-sm">“{r.description}”</p>}
              </div>
              <p className="tabular font-extrabold">{formatUZS(r.amount, locale)}</p>
            </div>
            {r.photos.length > 0 && (
              <div className="flex gap-2">
                {r.photos.map((p) => (
                  <a key={p} href={p} target="_blank" rel="noopener" className="relative h-16 w-16 overflow-hidden rounded-[10px] bg-surface-2">
                    <Image src={p} alt="" fill sizes="64px" className="object-cover" />
                  </a>
                ))}
              </div>
            )}
            {r.dispute && (
              <div className="rounded-[12px] bg-surface-2 p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <Gavel className="h-4 w-4 text-info" /> {t("dispute")} · {t(`disputeStatus.${r.dispute.status}`)}
                </p>
                <ol className="space-y-2 border-l-2 border-border pl-3 text-sm">
                  {r.dispute.timeline.map((e, i) => (
                    <li key={i}>
                      <p className="text-[12px] text-muted">
                        {fmtDateTime(e.at, locale)} · {t(`actors.${e.actor}`)} · {t(`events.${e.event}` as "events.note")}
                      </p>
                      {e.note && <p>{e.note}</p>}
                      {e.evidence && e.evidence.length > 0 && (
                        <div className="mt-1 flex gap-1.5">
                          {e.evidence.map((u) => (
                            <a key={u} href={u} target="_blank" rel="noopener" className="relative h-12 w-12 overflow-hidden rounded-[8px] bg-surface-3">
                              <Image src={u} alt="" fill sizes="48px" className="object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                {r.dispute.decisionNote && <p className="mt-2 text-sm font-semibold">{r.dispute.decisionNote}</p>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {r.status === "REQUESTED" && (
                <>
                  <Button
                    size="sm"
                    variant="success"
                    loading={pending}
                    leftIcon={<CheckCircle2 className="h-4 w-4" />}
                    onClick={() =>
                      window.confirm(t("approveConfirm", { amount: formatUZS(r.amount, locale) })) &&
                      start(async () => {
                        const res = await approveReturnSellerAction({ returnId: r.id });
                        if (!res.ok) return toast.error(res.error);
                        toast.success(t("approved"));
                        router.refresh();
                      })
                    }
                  >
                    {t("approve")}
                  </Button>
                  <Button size="sm" variant="outline" leftIcon={<Gavel className="h-4 w-4" />} onClick={() => setDialog({ kind: "dispute", row: r })}>
                    {t("contest")}
                  </Button>
                </>
              )}
              {r.dispute && ["OPEN", "UNDER_REVIEW"].includes(r.dispute.status) && (
                <Button size="sm" variant="outline" leftIcon={<MessageSquarePlus className="h-4 w-4" />} onClick={() => setDialog({ kind: "note", row: r })}>
                  {t("addEvidence")}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="card p-8 text-center text-muted">{t("empty")}</p>}
      {dialog && <DisputeDialog kind={dialog.kind} row={dialog.row} onClose={() => setDialog(null)} />}
    </div>
  );
}

function DisputeDialog({ kind, row, onClose }: { kind: "dispute" | "note"; row: Row; onClose: () => void }) {
  const t = useTranslations("sellerReturns");
  const tc = useTranslations("common");
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open
      onClose={onClose}
      title={kind === "dispute" ? t("contestTitle", { number: row.number }) : t("addEvidence")}
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
                const res = kind === "dispute" ? await openDisputeAction({ returnId: row.id, reason: text, evidence: files }) : await disputeNoteAction({ disputeId: row.dispute!.id, note: text, evidence: files });
                if (!res.ok) return setError(res.fieldErrors?.reason ?? res.fieldErrors?.note ?? res.error);
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
      {kind === "dispute" && <p className="mb-3 text-sm text-muted">{t("contestHint")}</p>}
      <Field label={kind === "dispute" ? t("contestReason") : t("note")} htmlFor="d-text">
        <Textarea id="d-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="mt-3">
        <p className="mb-1.5 text-sm font-semibold">{t("evidence")}</p>
        <ImageUploader value={files} onChange={setFiles} folder="evidence" max={8} />
      </div>
      <FormError message={error} />
    </Dialog>
  );
}
