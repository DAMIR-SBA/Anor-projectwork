"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BellOff, Headset, Loader2, MessageCircle, Pin, Search } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Avatar } from "@/components/ui/display";
import { useRealtime } from "@/components/providers/realtime";
import { ChatThread, type ThreadData } from "./chat-thread";
import { listChatsAction, openThreadAction } from "@/server/actions/chat";
import type { ChatMessage, ListItem } from "@/server/services/chat";
import { fmtDay, fmtTime } from "@/lib/format-date";
import { dayKey } from "@/lib/chat";
import { cn } from "@/lib/cn";

type Props = {
  me: { id: string };
  viewer: "buyer" | "seller";
  initialList: ListItem[];
  initialThread: ThreadData | null;
  basePath: "/chat" | "/seller/chats";
  supportHref: string;
};

const preview = (m: ChatMessage) => m.text?.slice(0, 120) ?? ({ IMAGE: "📷", FILE: "📎", VOICE: "🎤", PRODUCT: "🛍", ORDER: "📦", SYSTEM: "ℹ️", TEXT: "" } as const)[m.kind];

export function ChatApp({ me, viewer, initialList, initialThread, basePath, supportHref }: Props) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const router = useRouter();
  const [list, setList] = useState(initialList);
  const [thread, setThread] = useState<ThreadData | null>(initialThread);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [today] = useState(() => dayKey(new Date().toISOString()));
  const activeId = thread?.conversation.id ?? null;

  const urlFor = (id: string | null) => {
    // Keep the locale prefix (/ru, /oz) of the current URL.
    const path = window.location.pathname;
    const prefix = path.slice(0, path.indexOf(basePath === "/chat" ? "/chat" : "/seller"));
    if (basePath === "/chat") return `${prefix}/chat${id ? `/${id}` : ""}`;
    return `${prefix}/seller/chats${id ? `?c=${id}` : ""}`;
  };

  const refreshList = async (query = q) => {
    const res = await listChatsAction({ q: query || undefined, shopOnly: viewer === "seller" });
    if (res.ok && res.data) setList(res.data as ListItem[]);
  };

  const open = async (id: string) => {
    if (id === activeId) return;
    setLoadingId(id);
    const res = await openThreadAction({ conversationId: id });
    setLoadingId(null);
    if (!res.ok || !res.data) return;
    setThread(res.data as ThreadData);
    setList((l) => l.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    window.history.pushState(null, "", urlFor(id));
  };

  useRealtime("chat.message", (d) => {
    const m = d.message as ChatMessage;
    const id = String(d.conversationId);
    if (!list.some((c) => c.id === id)) return void refreshList();
    setList((prev) => {
      const cur = prev.find((c) => c.id === id);
      if (!cur) return prev;
      const updated: ListItem = { ...cur, preview: m.kind === "SYSTEM" ? cur.preview : preview(m), lastMessageAt: m.createdAt, unread: id === activeId || m.sender?.id === me.id || m.kind === "SYSTEM" ? cur.unread : cur.unread + 1 };
      const rest = prev.filter((c) => c.id !== id);
      return [updated, ...rest].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    });
  });

  const hasSupport = list.some((c) => c.kind === (viewer === "seller" ? "SELLER_SUPPORT" : "SUPPORT"));

  return (
    <div className="grid h-full min-h-0 overflow-hidden md:grid-cols-[340px_minmax(0,1fr)]">
      <aside className={cn("min-h-0 flex-col border-r border-border bg-surface", thread ? "hidden md:flex" : "flex")} aria-label={t("chats")}>
        <div className="border-b border-border p-3">
          <h1 className="mb-2 text-xl font-extrabold">{viewer === "seller" ? t("sellerTitle") : t("title")}</h1>
          <label className="relative block">
            <span className="sr-only">{t("search")}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                const v = e.target.value;
                setQ(v);
                if (searchTimer.current) clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => void refreshList(v), 300);
              }}
              placeholder={t("search")}
              className="h-10 w-full rounded-full border border-border bg-surface-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:bg-surface"
            />
          </label>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {!hasSupport && !q && (
            <li>
              <button type="button" onClick={() => router.push(supportHref)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-2">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                  <Headset className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{viewer === "seller" ? t("sellerSupportTitle") : t("supportTitle")}</span>
                  <span className="block truncate text-sm text-muted">{t("supportHint")}</span>
                </span>
              </button>
            </li>
          )}
          {list.map((c) => {
            const isSupport = c.kind === "SUPPORT" || c.kind === "SELLER_SUPPORT";
            const title = isSupport ? (c.kind === "SELLER_SUPPORT" ? t("sellerSupportTitle") : t("supportTitle")) : c.title;
            const when = dayKey(c.lastMessageAt) === today ? fmtTime(c.lastMessageAt) : fmtDay(c.lastMessageAt, locale, { short: true });
            return (
              <li key={c.id}>
                <button type="button" onClick={() => void open(c.id)} aria-current={c.id === activeId ? "true" : undefined} className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2", c.id === activeId && "bg-primary/8 hover:bg-primary/10")}>
                  {isSupport ? (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                      <Headset className="h-6 w-6" />
                    </span>
                  ) : (
                    <Avatar name={title} src={c.avatarUrl} size={48} online={c.online} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-bold">{title}</span>
                      {c.muted && <BellOff className="h-3.5 w-3.5 shrink-0 text-muted" aria-label={t("muted")} />}
                      <span className="ml-auto shrink-0 text-[12px] text-muted">{when}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm text-muted">
                        {isSupport && c.ticket ? `#${c.ticket.number} · ${t(`ticketStatus.${c.ticket.status}` as "ticketStatus.NEW")} · ` : c.subtitle ? `${c.subtitle} · ` : ""}
                        {c.preview ?? ""}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        {c.pinned && !c.unread && <Pin className="h-3.5 w-3.5 text-muted" aria-label={t("pinned")} />}
                        {loadingId === c.id && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
                        {c.unread > 0 && <span className={cn("min-w-5 rounded-full px-1.5 text-center text-[12px] font-bold leading-5 text-white", c.muted ? "bg-muted" : "bg-primary")}>{c.unread}</span>}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && q && <li className="p-6 text-center text-sm text-muted">{t("noResults")}</li>}
        </ul>
      </aside>
      <section className={cn("min-h-0 bg-surface-2", thread ? "flex flex-col" : "hidden md:flex md:flex-col")}>
        {thread ? (
          <ChatThread
            key={thread.conversation.id}
            initial={thread}
            me={me}
            viewer={viewer}
            onBack={() => {
              setThread(null);
              window.history.pushState(null, "", urlFor(null));
            }}
            onMoved={(id) => {
              setThread(null);
              void refreshList().then(() => open(id));
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted">
            <MessageCircle className="h-12 w-12" />
            <p className="max-w-xs">{t("pickChat")}</p>
          </div>
        )}
      </section>
    </div>
  );
}
