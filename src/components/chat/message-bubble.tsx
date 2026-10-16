"use client";

import Image from "next/image";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bot, Check, CheckCheck, Copy, CornerUpLeft, FileText, Flag, MoreHorizontal, Package, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { MediaLightbox } from "@/components/reviews/media-lightbox";
import { VoicePlayer } from "./voice";
import type { ChatMessage } from "@/server/services/chat";
import { canEdit, formatBytes } from "@/lib/chat";
import { fmtTime } from "@/lib/format-date";
import { formatUZS } from "@/lib/money";
import { locText } from "@/lib/localized";
import { cn } from "@/lib/cn";

export type BubbleActions = {
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onReport: (m: ChatMessage) => void;
};

/** Centered note for system events and the first-line bot. */
function SystemNote({ m }: { m: ChatMessage }) {
  const t = useTranslations("chat.system");
  const tc = useTranslations("chat");
  const locale = useLocale();
  const key = String(m.payload?.key ?? "");
  const values = (m.payload?.values as Record<string, unknown> | undefined) ?? {};
  const articles = (values.articles as Array<{ slug: string; titleUz: string; titleRu: string }> | undefined) ?? [];
  if (m.source === "BOT")
    return (
      <div className="flex items-end gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-fg">
          <Bot className="h-4.5 w-4.5" />
        </span>
        <div className="max-w-[80%] rounded-[16px] rounded-bl-[6px] bg-surface px-3.5 py-2.5 text-[15px] shadow-[0_1px_1px_rgb(var(--shadow-color)/0.08)] dark:bg-surface-3">
          <p className="text-[12px] font-bold text-muted">{tc("botName")}</p>
          <p className="whitespace-pre-line">{key === "bot.ai" ? String(values.text ?? "") : t.has(key) ? t(key as "support.welcome", { minutes: Number(values.minutes ?? 15), number: Number(values.number ?? 0) }) : key}</p>
          {key === "bot.ai" && <p className="mt-1 text-[12px] text-muted">{tc("aiNote")}</p>}
          {articles.length > 0 && (
            <ul className="mt-2 space-y-1">
              {articles.map((a) => (
                <li key={a.slug}>
                  <Link href={`/help/${a.slug}`} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                    <FileText className="h-4 w-4" /> {locale === "ru" ? a.titleRu : locText(a.titleUz, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-right text-[11px] text-muted">{fmtTime(m.createdAt)}</p>
        </div>
      </div>
    );
  return (
    <p className="mx-auto my-1 w-fit max-w-[85%] rounded-full bg-surface-3/80 px-3 py-1 text-center text-[13px] text-muted">
      {t.has(key) ? t(key as "support.resolved", { minutes: Number(values.minutes ?? 15), number: Number(values.number ?? 0) }) : key}
    </p>
  );
}

function ProductCard({ p }: { p: Record<string, unknown> }) {
  const locale = useLocale();
  return (
    <Link href={`/p/${p.slug}`} className="flex w-64 max-w-full items-center gap-3 rounded-[12px] border border-border bg-surface p-2 text-fg">
      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-surface-2">{typeof p.imageUrl === "string" && <Image src={p.imageUrl} alt="" fill sizes="56px" className="object-cover" />}</span>
      <span className="min-w-0">
        <span className="line-clamp-2 text-[13px] font-semibold">{locale === "ru" && p.titleRu ? String(p.titleRu) : locText(String(p.title ?? ""), locale)}</span>
        <span className="tabular block text-sm font-extrabold">{formatUZS(Number(p.price ?? 0), locale)}</span>
      </span>
    </Link>
  );
}

function OrderCard({ o, viewer }: { o: Record<string, unknown>; viewer: "buyer" | "seller" | "staff" }) {
  const t = useTranslations("orders");
  const locale = useLocale();
  const href = viewer === "buyer" ? `/account/orders/${o.id}` : viewer === "seller" ? `/seller/orders/${o.id}` : `/admin/orders/${o.id}`;
  return (
    <Link href={href} className="flex w-64 max-w-full items-center gap-3 rounded-[12px] border border-border bg-surface p-2 text-fg">
      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-surface-2">
        {typeof o.imageUrl === "string" ? <Image src={o.imageUrl} alt="" fill sizes="56px" className="object-cover" /> : <Package className="h-6 w-6 text-muted" />}
      </span>
      <span className="min-w-0 text-[13px]">
        <span className="block font-bold">{t("number", { number: String(o.number) })}</span>
        <span className="block text-muted">{t(`status.${o.status}` as "status.PLACED")}</span>
        <span className="tabular block font-extrabold">{formatUZS(Number(o.total ?? 0), locale)}</span>
      </span>
    </Link>
  );
}

export function MessageBubble({ m, mine, showSender, state, actions, viewer, readOnly, canModerate }: { m: ChatMessage; mine: boolean; showSender: boolean; state: "sent" | "delivered" | "read" | null; actions: BubbleActions; viewer: "buyer" | "seller" | "staff"; readOnly?: boolean; canModerate?: boolean }) {
  const t = useTranslations("chat");
  const [menu, setMenu] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  if (m.kind === "SYSTEM") return <SystemNote m={m} />;
  const images = m.attachments.filter((a) => a.kind === "IMAGE" || a.kind === "VIDEO");
  const files = m.attachments.filter((a) => a.kind === "FILE");
  const voice = m.attachments.find((a) => a.kind === "VOICE");
  const card = m.kind === "PRODUCT" || m.kind === "ORDER";

  return (
    <div className={cn("group flex", mine ? "justify-end" : "justify-start")} onContextMenu={(e) => !m.deleted && !readOnly && (e.preventDefault(), setMenu(true))}>
      <div className={cn("relative max-w-[85%] sm:max-w-[70%]", card && "max-w-[90%]")}>
        <div
          className={cn(
            "rounded-[16px] px-3 py-2 text-[15px] leading-snug",
            mine ? "rounded-br-[6px] bg-primary text-white" : "rounded-bl-[6px] bg-surface shadow-[0_1px_1px_rgb(var(--shadow-color)/0.08)] dark:bg-surface-3",
            m.deleted && "italic opacity-70",
            card && "p-1.5",
            m.flagged && !mine && "ring-1 ring-accent",
          )}
        >
          {showSender && m.sender && !mine && (
            <p className={cn("mb-0.5 flex items-center gap-1 text-[12px] font-bold", m.sender.isStaff ? "text-info" : "text-primary")}>
              {m.sender.isStaff && <ShieldCheck className="h-3.5 w-3.5" />}
              {m.sender.isStaff ? t("supportAgent", { name: m.sender.name }) : m.sender.name}
            </p>
          )}
          {m.replyTo && (
            <div className={cn("mb-1.5 border-l-2 pl-2 text-[13px]", mine ? "border-white/70 text-white/85" : "border-primary text-muted")}>
              <p className="font-semibold">{m.replyTo.senderName ?? "—"}</p>
              <p className="line-clamp-1">{m.replyTo.text ?? t("attachment")}</p>
            </div>
          )}
          {m.deleted ? (
            <p>{t("deleted")}</p>
          ) : (
            <>
              {m.kind === "PRODUCT" && m.payload && <ProductCard p={m.payload} />}
              {m.kind === "ORDER" && m.payload && <OrderCard o={m.payload} viewer={viewer} />}
              {images.length > 0 && (
                <div className={cn("-mx-1.5 -mt-0.5 mb-1 grid gap-1", images.length > 1 && "grid-cols-2")}>
                  {images.map((a, i) => (
                    <button key={a.id} type="button" onClick={() => setLightbox(i)} className="relative block aspect-square w-full min-w-[140px] overflow-hidden rounded-[12px] bg-black/10 sm:min-w-[200px]">
                      {a.kind === "VIDEO" ? <video src={a.url} className="h-full w-full object-cover" muted /> : <Image src={a.url} alt={a.fileName} fill sizes="240px" className="object-cover" />}
                    </button>
                  ))}
                </div>
              )}
              {files.map((a) => (
                <a key={a.id} href={a.url} target="_blank" rel="noopener" download={a.fileName} className={cn("mb-1 flex items-center gap-2.5 rounded-[10px] p-2", mine ? "bg-white/15" : "bg-surface-2")}>
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", mine ? "bg-white text-primary" : "bg-primary text-white")}>
                    <FileText className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{a.fileName}</span>
                    <span className={cn("block text-[12px]", mine ? "text-white/75" : "text-muted")}>{formatBytes(a.size)}</span>
                  </span>
                </a>
              ))}
              {voice && <VoicePlayer url={voice.url} duration={voice.durationSec} waveform={voice.waveform} mine={mine} />}
              {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
            </>
          )}
          <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-[11px]", mine ? "text-white/75" : "text-muted")}>
            {m.masked && <span title={t("maskedHint")}>🔒</span>}
            {m.editedAt && !m.deleted && <span>{t("edited")}</span>}
            <time dateTime={m.createdAt}>{fmtTime(m.createdAt)}</time>
            {mine && state && (state === "sent" ? <Check className="h-3.5 w-3.5" aria-label={t("sent")} /> : <CheckCheck className={cn("h-3.5 w-3.5", state === "read" && "text-accent")} aria-label={state === "read" ? t("read") : t("delivered")} />)}
          </p>
        </div>
        {!m.deleted && !readOnly && (
          <button type="button" onClick={() => setMenu((v) => !v)} className={cn("absolute top-1 rounded-full bg-surface p-1 text-muted opacity-0 shadow transition-opacity focus:opacity-100 group-hover:opacity-100", mine ? "-left-8" : "-right-8")} aria-label={t("messageActions")} aria-expanded={menu}>
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
        {menu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} aria-hidden />
            <ul role="menu" className={cn("absolute z-40 mt-1 w-48 overflow-hidden rounded-[12px] border border-border bg-surface py-1 text-sm shadow-[var(--shadow-lift)]", mine ? "right-0" : "left-0")}>
              <MenuItem icon={<CornerUpLeft className="h-4 w-4" />} label={t("reply")} onClick={() => (setMenu(false), actions.onReply(m))} />
              {m.text && <MenuItem icon={<Copy className="h-4 w-4" />} label={t("copy")} onClick={() => (setMenu(false), void navigator.clipboard?.writeText(m.text ?? ""))} />}
              {mine && m.kind === "TEXT" && canEdit(m.createdAt) && <MenuItem icon={<Pencil className="h-4 w-4" />} label={t("edit")} onClick={() => (setMenu(false), actions.onEdit(m))} />}
              {(mine || canModerate) && <MenuItem icon={<Trash2 className="h-4 w-4" />} label={t("delete")} danger onClick={() => (setMenu(false), actions.onDelete(m))} />}
              {!mine && viewer !== "staff" && <MenuItem icon={<Flag className="h-4 w-4" />} label={t("report")} onClick={() => (setMenu(false), actions.onReport(m))} />}
            </ul>
          </>
        )}
      </div>
      {lightbox !== null && <MediaLightbox items={images.map((a) => ({ url: a.url, type: a.kind === "VIDEO" ? "VIDEO" : "IMAGE" }))} index={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <li>
      <button type="button" role="menuitem" onClick={onClick} className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2", danger && "text-danger")}>
        {icon} {label}
      </button>
    </li>
  );
}
