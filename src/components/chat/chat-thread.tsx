"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowLeft, Ban, BellOff, BellRing, EyeOff, Headset, Loader2, MoreVertical, Pin, PinOff, ShoppingBag } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Avatar } from "@/components/ui/display";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Radio } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useRealtime } from "@/components/providers/realtime";
import { MessageBubble } from "./message-bubble";
import { Composer, type Canned, type OutgoingAttachment } from "./composer";
import * as userApi from "@/server/actions/chat";
import type { ChatMessage, Receipt } from "@/server/services/chat";
import type { openThread } from "@/server/services/chat";
import { dayKey, receiptState } from "@/lib/chat";
import { fmtDay, fmtTime } from "@/lib/format-date";
import { locText } from "@/lib/localized";
import { cn } from "@/lib/cn";

export type ThreadData = Awaited<ReturnType<typeof openThread>>;
type Viewer = "buyer" | "seller" | "staff";

function api(viewer: Viewer) {
  return viewer === "staff"
    ? { send: userApi.staffSendAction, edit: userApi.staffEditAction, del: userApi.staffDeleteAction, older: userApi.staffLoadOlderAction, typing: userApi.staffTypingAction, read: userApi.staffMarkReadAction }
    : { send: userApi.sendMessageAction, edit: userApi.editMessageAction, del: userApi.deleteMessageAction, older: userApi.loadOlderAction, typing: userApi.typingAction, read: userApi.markReadAction };
}

export function ChatThread({ initial, me, viewer, canned, onBack, onMoved, headerExtra, readOnly, canModerate }: { initial: ThreadData; me: { id: string }; viewer: Viewer; canned?: Canned[]; onBack?: () => void; onMoved?: (id: string) => void; headerExtra?: ReactNode; readOnly?: boolean; canModerate?: boolean }) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const toast = useToast();
  const a = api(viewer);
  const conv = initial.conversation;
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [receipts, setReceipts] = useState<Receipt[]>(initial.receipts);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [report, setReport] = useState<ChatMessage | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [presence, setPresence] = useState({ online: conv.online, lastSeenAt: conv.lastSeenAt });
  const [flags, setFlags] = useState({ pinned: conv.pinned, muted: conv.muted, blocked: conv.blocked.byMe });
  const [menu, setMenu] = useState(false);
  const [days] = useState(() => ({ today: dayKey(new Date().toISOString()), yesterday: dayKey(new Date(Date.now() - 86_400_000).toISOString()) }));
  const scroller = useRef<HTMLDivElement>(null);
  const keepOffset = useRef<number | null>(null);
  const stick = useRef(true);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nearBottom = () => {
    const el = scroller.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // Keep the view pinned to the bottom for new messages, or anchored when older ones load.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepOffset.current !== null) {
      el.scrollTop = el.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    } else if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, typingName]);

  const scheduleRead = () => {
    if (readOnly || (viewer === "staff" && conv.myRole !== "AGENT")) return;
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => void a.read({ conversationId: conv.id }), 600);
  };

  useRealtime("chat.message", (d) => {
    if (d.conversationId !== conv.id) return;
    const m = d.message as ChatMessage;
    stick.current = nearBottom() || m.sender?.id === me.id;
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    if (m.sender?.id !== me.id) {
      setTypingName(null);
      if (!stick.current) setNewCount((n) => n + 1);
      if (!document.hidden) scheduleRead();
    }
  });
  useRealtime("chat.update", (d) => {
    if (d.conversationId !== conv.id) return;
    const m = d.message as ChatMessage;
    stick.current = false;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
  });
  useRealtime("chat.receipt", (d) => {
    if (d.conversationId !== conv.id) return;
    const r = d.receipt as Receipt;
    setReceipts((prev) => {
      const cur = prev.find((x) => x.userId === r.userId);
      const merged: Receipt = { userId: r.userId, lastReadAt: r.lastReadAt ?? cur?.lastReadAt ?? null, lastDeliveredAt: r.lastDeliveredAt ?? cur?.lastDeliveredAt ?? null };
      return [...prev.filter((x) => x.userId !== r.userId), merged];
    });
  });
  useRealtime("chat.typing", (d) => {
    if (d.conversationId !== conv.id || d.userId === me.id) return;
    stick.current = nearBottom();
    setTypingName(String(d.name ?? ""));
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTypingName(null), 4500);
  });

  // Presence of the other side (cheap poll; SSE carries messages, not presence).
  useEffect(() => {
    if (!conv.counterpartId || (conv.kind !== "BUYER_SELLER" && viewer !== "staff")) return;
    const id = setInterval(async () => {
      const r = await userApi.presenceAction({ userId: conv.counterpartId! });
      if (r.ok && r.data) setPresence(r.data as typeof presence);
    }, 45_000);
    return () => clearInterval(id);
  }, [conv.counterpartId, conv.kind, viewer]);

  useEffect(() => {
    const onFocus = () => scheduleRead();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  });

  const loadOlder = async () => {
    if (olderBusy || !messages.length) return;
    setOlderBusy(true);
    const res = await a.older({ conversationId: conv.id, before: messages[0].id });
    if (res.ok && res.data) {
      const d = res.data as { messages: ChatMessage[]; hasMore: boolean };
      keepOffset.current = (scroller.current?.scrollHeight ?? 0) - (scroller.current?.scrollTop ?? 0);
      setMessages((prev) => [...d.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHasMore(d.hasMore);
    }
    setOlderBusy(false);
  };

  const send = async (text: string, attachments: OutgoingAttachment[]) => {
    const res = await a.send({ conversationId: conv.id, text: text || undefined, replyToId: replyTo?.id, attachments });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    const d = res.data as { message: ChatMessage; conversationId: string };
    if (d.conversationId !== conv.id) {
      onMoved?.(d.conversationId);
      return true;
    }
    stick.current = true;
    setMessages((prev) => (prev.some((x) => x.id === d.message.id) ? prev : [...prev, d.message]));
    setReplyTo(null);
    return true;
  };

  const edit = async (m: ChatMessage, text: string) => {
    const res = await a.edit({ messageId: m.id, text });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setEditing(null);
    return true;
  };

  const flag = async (patch: { pinned?: boolean; muteHours?: number | null; hidden?: boolean }) => {
    setMenu(false);
    const res = await userApi.chatFlagsAction({ conversationId: conv.id, ...patch });
    if (!res.ok) return toast.error(res.error);
    setFlags((f) => ({ ...f, ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}), ...(patch.muteHours !== undefined ? { muted: !!patch.muteHours } : {}) }));
    if (patch.hidden) onBack?.();
  };

  const isSupport = conv.kind === "SUPPORT" || conv.kind === "SELLER_SUPPORT";
  const title = isSupport && viewer !== "staff" ? (conv.kind === "SELLER_SUPPORT" ? t("sellerSupportTitle") : t("supportTitle")) : conv.title;
  const status = isSupport && viewer !== "staff" ? (conv.ticket ? `#${conv.ticket.number} · ${t(`ticketStatus.${conv.ticket.status}` as "ticketStatus.NEW")}` : t("supportHint")) : presence.online ? t("online") : presence.lastSeenAt ? t("lastSeen", { time: `${fmtDay(presence.lastSeenAt, locale, { short: true })}, ${fmtTime(presence.lastSeenAt)}` }) : "";
  const others = receipts.filter((r) => r.userId !== me.id);
  const rows = messages.map((m, i) => {
    const prev = messages[i - 1];
    const sep = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
    return { m, sep, showSender: sep || (prev?.sender?.id ?? null) !== (m.sender?.id ?? null) };
  });

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2.5">
        {onBack && (
          <button type="button" onClick={onBack} className="rounded-full p-2 hover:bg-surface-3 md:hidden" aria-label={t("back")}>
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {isSupport && viewer !== "staff" ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white">
            <Headset className="h-5 w-5" />
          </span>
        ) : (
          <Avatar name={title} src={conv.avatarUrl} size={40} online={presence.online} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">{title}</p>
          <p className={cn("truncate text-[13px]", typingName ? "text-primary" : presence.online && !isSupport ? "text-success" : "text-muted")}>{typingName ? t("typing", { name: typingName }) : status}</p>
        </div>
        {conv.product && viewer !== "staff" && (
          <Link href={`/p/${conv.product.slug}`} className="hidden max-w-48 items-center gap-1.5 truncate rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-semibold lg:flex">
            <ShoppingBag className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{locText(conv.product.title, locale)}</span>
          </Link>
        )}
        {headerExtra}
        {viewer !== "staff" && !readOnly && (
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} className="rounded-full p-2 text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("chatMenu")} aria-expanded={menu}>
              <MoreVertical className="h-5 w-5" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} aria-hidden />
                <ul role="menu" className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-[12px] border border-border bg-surface py-1 text-sm shadow-[var(--shadow-lift)]">
                  <MenuButton icon={flags.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} label={flags.pinned ? t("unpin") : t("pin")} onClick={() => void flag({ pinned: !flags.pinned })} />
                  {flags.muted ? (
                    <MenuButton icon={<BellRing className="h-4 w-4" />} label={t("unmute")} onClick={() => void flag({ muteHours: null })} />
                  ) : (
                    <>
                      <MenuButton icon={<BellOff className="h-4 w-4" />} label={t("mute8h")} onClick={() => void flag({ muteHours: 8 })} />
                      <MenuButton icon={<BellOff className="h-4 w-4" />} label={t("muteForever")} onClick={() => void flag({ muteHours: 24 * 365 })} />
                    </>
                  )}
                  {conv.kind === "BUYER_SELLER" && conv.counterpartId && (
                    <MenuButton
                      icon={<Ban className="h-4 w-4" />}
                      label={flags.blocked ? t("unblock") : t("block")}
                      danger={!flags.blocked}
                      onClick={async () => {
                        setMenu(false);
                        if (!flags.blocked && !window.confirm(t("blockConfirm"))) return;
                        const res = await userApi.blockUserAction({ userId: conv.counterpartId!, block: !flags.blocked });
                        if (res.ok) setFlags((f) => ({ ...f, blocked: !f.blocked }));
                      }}
                    />
                  )}
                  {!isSupport && <MenuButton icon={<EyeOff className="h-4 w-4" />} label={t("hideChat")} onClick={() => void flag({ hidden: true })} />}
                </ul>
              </>
            )}
          </div>
        )}
      </header>

      <div
        ref={scroller}
        className="chat-wallpaper relative min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3 sm:px-5"
        onScroll={() => {
          stick.current = nearBottom();
          if (stick.current && newCount) setNewCount(0);
          if (hasMore && !olderBusy && (scroller.current?.scrollTop ?? 1) < 60) void loadOlder();
        }}
        aria-live="polite"
        aria-label={t("messages")}
      >
        {hasMore && (
          <div className="flex justify-center py-1">
            <button type="button" onClick={() => void loadOlder()} className="rounded-full bg-surface px-3 py-1 text-[13px] font-semibold text-muted shadow-sm">
              {olderBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("loadOlder")}
            </button>
          </div>
        )}
        {rows.map(({ m, sep, showSender }) => {
          const mine = m.sender?.id === me.id;
          return (
            <Fragment key={m.id}>
              {sep && (
                <p className="sticky top-0 z-10 mx-auto my-2 w-fit rounded-full bg-surface/90 px-3 py-0.5 text-[12px] font-semibold text-muted shadow-sm backdrop-blur">
                  {dayLabel(m.createdAt, locale, t, days)}
                </p>
              )}
              <MessageBubble
                m={m}
                mine={mine}
                showSender={showSender && (isSupport || viewer === "staff")}
                state={mine ? receiptState(m.createdAt, others) : null}
                viewer={viewer}
                readOnly={readOnly}
                canModerate={canModerate}
                actions={{
                  onReply: (x) => (setEditing(null), setReplyTo(x)),
                  onEdit: (x) => (setReplyTo(null), setEditing(x)),
                  onDelete: async (x) => {
                    if (!window.confirm(t("deleteConfirm"))) return;
                    const res = await a.del({ messageId: x.id });
                    if (!res.ok) toast.error(res.error);
                  },
                  onReport: (x) => setReport(x),
                }}
              />
            </Fragment>
          );
        })}
        {typingName && (
          <div className="flex w-fit items-center gap-1 rounded-[16px] bg-surface px-3 py-2.5 dark:bg-surface-3" aria-label={t("typing", { name: typingName })}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        )}
      </div>
      {newCount > 0 && (
        <button
          type="button"
          onClick={() => {
            const el = scroller.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            setNewCount(0);
          }}
          className="absolute bottom-24 right-6 flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-white shadow-lg"
        >
          <ArrowDown className="h-4 w-4" /> {newCount}
        </button>
      )}
      {conv.blocked.byThem && <p className="bg-surface-2 px-4 py-2 text-center text-sm text-muted">{t("blockedByThem")}</p>}
      {!readOnly && (
        <Composer
          disabled={!conv.canWrite || flags.blocked}
          replyTo={replyTo}
          editing={editing}
          canned={canned}
          onCancelContext={() => (setReplyTo(null), setEditing(null))}
          onSend={send}
          onEdit={edit}
          onTyping={() => void a.typing({ conversationId: conv.id })}
        />
      )}
      {report && <ReportDialog message={report} onClose={() => setReport(null)} />}
    </div>
  );
}

function dayLabel(iso: string, locale: string, t: ReturnType<typeof useTranslations<"chat">>, today: { today: string; yesterday: string }) {
  const k = dayKey(iso);
  return k === today.today ? t("today") : k === today.yesterday ? t("yesterday") : fmtDay(iso, locale);
}

function MenuButton({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <li>
      <button type="button" role="menuitem" onClick={onClick} className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2", danger && "text-danger")}>
        {icon} {label}
      </button>
    </li>
  );
}

const REPORT_REASONS = ["spam", "offensive", "fraud", "personal", "other"] as const;

function ReportDialog({ message, onClose }: { message: ChatMessage; onClose: () => void }) {
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const toast = useToast();
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>("spam");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("reportTitle")}
      variant="sheet"
      closeLabel={tc("close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const res = await userApi.reportMessageAction({ messageId: message.id, reason });
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              toast.success(t("reportSent"));
              onClose();
            }}
          >
            {tc("submit")}
          </Button>
        </>
      }
    >
      <p className="mb-3 line-clamp-3 rounded-[10px] bg-surface-2 p-2.5 text-sm">{message.text ?? t("attachment")}</p>
      <fieldset className="space-y-2">
        {REPORT_REASONS.map((r) => (
          <Radio key={r} className="flex" name="chat-report" value={r} checked={reason === r} onChange={() => setReason(r)} label={t(`reportReasons.${r}`)} />
        ))}
      </fieldset>
    </Dialog>
  );
}
