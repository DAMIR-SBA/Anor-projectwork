"use client";

import Image from "next/image";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/display";
import { ActionButton } from "@/components/admin/ui";
import { approveProductsAction, rejectProductsAction } from "@/server/actions/admin-marketplace";
import type { moderationQueue } from "@/server/services/admin/products";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";

type Row = Awaited<ReturnType<typeof moderationQueue>>["rows"][number];
const SIGNAL_TONE: Record<string, "danger" | "accent" | "info" | "neutral"> = { terms: "danger", inflatedOldPrice: "danger", newShop: "info", noPhotos: "accent", shortDescription: "neutral" };

export function ProductModeration({ rows, canModerate }: { rows: Row[]; canModerate: boolean }) {
  const t = useTranslations("adminProducts");
  const ts = useTranslations("sellerProducts.statuses");
  const locale = useLocale();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const ids = [...sel];
  const prefix = locale === "uz" ? "" : locale === "uz-Cyrl" ? "/oz" : "/ru";
  return (
    <div>
      {canModerate && rows.length > 0 && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-border bg-surface/95 p-2.5 text-sm shadow-sm backdrop-blur">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-[#C8102E]" checked={sel.size === rows.length} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
            {sel.size ? t("selected", { count: sel.size }) : t("selectAll")}
          </label>
          {sel.size > 0 && (
            <>
              <ActionButton action={approveProductsAction} input={{ ids }} variant="success" icon={<CheckCircle2 className="h-4 w-4" />} label={t("approve")} success={t("approved", { count: sel.size })} onDone={() => setSel(new Set())} />
              <ActionButton action={rejectProductsAction} input={{ ids }} variant="danger" icon={<XCircle className="h-4 w-4" />} label={t("reject")} reason={{ title: t("rejectTitle", { count: sel.size }), placeholder: t("rejectPlaceholder") }} onDone={() => setSel(new Set())} />
            </>
          )}
        </div>
      )}
      <ul className="space-y-3">
        {rows.map((p) => (
          <li key={p.id} className={cn("card p-4", sel.has(p.id) && "ring-2 ring-primary")}>
            <div className="flex flex-wrap items-start gap-3">
              {canModerate && <input type="checkbox" aria-label={p.titleUz} className="mt-1 h-4 w-4 accent-[#C8102E]" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />}
              <div className="flex gap-1.5">
                {p.images.slice(0, 3).map((src) => (
                  <span key={src} className="relative h-20 w-16 overflow-hidden rounded-[10px] bg-surface-2">
                    <Image src={src} alt="" fill sizes="64px" className="object-cover" />
                  </span>
                ))}
                {!p.images.length && <span className="flex h-20 w-16 items-center justify-center rounded-[10px] bg-surface-2 text-xs text-muted">—</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{locale === "ru" ? p.titleRu : p.titleUz}</p>
                  <Badge tone={p.status === "ACTIVE" ? "success" : p.status === "PENDING" ? "accent" : p.status === "REJECTED" ? "danger" : "neutral"}>{ts(p.status)}</Badge>
                </div>
                <p className="mt-0.5 text-[13px] text-muted">
                  <Link href={`/admin/moderation/shops/${p.shop.id}`} className="font-semibold text-fg underline">
                    {p.shop.name}
                  </Link>{" "}
                  · {locale === "ru" ? p.category.nameRu : p.category.nameUz}
                  {p.brand && ` · ${p.brand}`} · {t("variants", { count: p.variants })}
                </p>
                <p className="mt-1 line-clamp-2 text-[13px]">{p.description || <span className="text-muted">{t("noDescription")}</span>}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="tabular text-sm font-bold">{formatUZS(p.price, locale)}</span>
                  {p.oldPrice && <span className="tabular text-[13px] text-muted line-through">{formatUZS(p.oldPrice, locale)}</span>}
                  {p.signals.map((s) => (
                    <Badge key={s.key} tone={SIGNAL_TONE[s.key] ?? "neutral"}>
                      {t(`signals.${s.key}`)}
                      {s.value && `: ${s.value}`}
                    </Badge>
                  ))}
                </div>
                {p.note && <p className="mt-1 text-[13px] text-danger">{t("note", { note: p.note })}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {canModerate && p.status !== "ACTIVE" && <ActionButton action={approveProductsAction} input={{ ids: [p.id] }} variant="success" label={t("approve")} success={t("approved", { count: 1 })} />}
                {canModerate && p.status !== "REJECTED" && <ActionButton action={rejectProductsAction} input={{ ids: [p.id] }} variant="ghost" className="text-danger" label={p.status === "ACTIVE" ? t("takeDown") : t("reject")} reason={{ title: t("rejectTitle", { count: 1 }), placeholder: t("rejectPlaceholder") }} />}
                {p.status === "ACTIVE" && (
                  <a href={`${prefix}/p/${p.slug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> {t("open")}
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="card p-8 text-center text-muted">{t("empty")}</p>}
    </div>
  );
}
