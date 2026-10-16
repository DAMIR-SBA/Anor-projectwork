"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Crown, Flag, Headset, Loader2, Search, StickyNote, Store, Timer, UserCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Avatar, Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useRealtime } from "@/components/providers/realtime";
import { ChatThread, type ThreadData } from "@/components/chat/chat-thread";
import type { Canned } from "@/components/chat/composer";
import { addNoteAction, listTicketsAction, staffOpenThreadAction, ticketDetailAction, updateTicketAction } from "@/server/actions/chat";
import type { listTickets, ticketCounts } from "@/server/services/support";
import { slaState } from "@/lib/chat";
import { fmtDateTime, fmtDay, fmtTime } from "@/lib/format-date";
import { formatUZS } from "@/lib/money";
import { cn } from "@/lib/cn";

type TicketRow = Awaited<ReturnType<typeof listTickets>>["items"][number];
type Counts = Awaited<ReturnType<typeof ticketCounts>>;
type View = "open" | "mine" | "unassigned" | "waiting" | "resolved" | "all";
type Detail = {
  notes: Array<{ id: string; text: string; author: string; createdAt: string }>;
  customer: {
    id: string; name: string; login: string; phone: string | null; email: string | null; telegram: string | null; since: string; tier: string; isPlus: boolean; bonus: number; chatBanned: boolean; orders: number; spend: number; returns: number;
    shops: Array<{ id: string; name: string; slug: string; status: string }>;
    recentOrders: Array<{ id: string; number: string; status: string; total: number; createdAt: string }>;
    previous: Array<{ id: string; number: number; status: string; subject: string | null; createdAt: string }>;
    flags: Array<{ type: string; score: number }>;
  };
};
type Agent = { id: string; name: string; role: string };

const VIEWS: View[] = ["open", "mine", "unassigned", "waiting", "resolved", "all"];
const STATUS_TONE = { NEW: "primary", IN_PROGRESS: "info", WAITING_CUSTOMER: "accent", RESOLVED: "success" } as const;
const PRIORITY_TONE = { LOW: "neutral", NORMAL: "neutral", HIGH: "accent", URGENT: "danger" } as const;

export function SupportDesk({ me, initial, counts: initialCounts, agents, canned, initialActive }: { me: { id: string }; initial: { items: TicketRow[]; total: number }; counts: Counts; agents: Agent[]; canned: Canned[]; initialActive: { ticketId: string; thread: ThreadData; detail: Detail } | null }) {
  const t = useTranslations("support");
  const locale = useLocale();
  const toast = useToast();
  const [view, setView] = useState<View>("open");
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState("");
  const [items, setItems] = useState(initial.items);
  const [counts, setCounts] = useState(initialCounts);
  const [active, setActive] = useState(initialActive);
  const [loading, setLoading] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filters = useRef({ view, q, priority });
  useEffect(() => {
    filters.current = { view, q, priority };
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const refresh = async (f = filters.current) => {
    const res = await listTicketsAction({ view: f.view, q: f.q || undefined, priority: (f.priority || undefined) as "HIGH" | undefined });
    if (res.ok && res.data) {
      const d = res.data as { items: TicketRow[]; counts: Counts };
      setItems(d.items);
      setCounts(d.counts);
    }
  };
  const refreshSoon = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void refresh(), 500);
  };

  const loadDetail = async (ticketId: string) => {
    const res = await ticketDetailAction({ ticketId });
    if (res.ok && res.data) setActive((a) => (a && a.ticketId === ticketId ? { ...a, detail: res.data as Detail } : a));
  };

  const reopen = async (ticketId: string, conversationId: string, keepThread = false) => {
    if (!keepThread) setLoading(ticketId);
    const [th, det] = await Promise.all([keepThread ? null : staffOpenThreadAction({ conversationId }), ticketDetailAction({ ticketId })]);
    setLoading(null);
    if (th && (!th.ok || !th.data)) return toast.error(th.ok ? "" : th.error);
    if (!det.ok || !det.data) return;
    setActive((a) => ({ ticketId, thread: th?.data ? (th.data as ThreadData) : a!.thread, detail: det.data as Detail }));
    if (!keepThread) window.history.replaceState(null, "", `${window.location.pathname}?t=${ticketId}`);
  };

  useRealtime("support.ticket", (d) => {
    refreshSoon();
    if (active && d.ticketId === active.ticketId) void reopen(active.ticketId, active.thread.conversation.id, true);
  });
  useRealtime("chat.message", () => refreshSoon());
  useRealtime("support.note", (d) => {
    if (active && d.ticketId === active.ticketId) {
      const note = d.note as Detail["notes"][number];
      setActive((a) => (a ? { ...a, detail: { ...a.detail, notes: a.detail.notes.some((n) => n.id === note.id) ? a.detail.notes : [...a.detail.notes, note] } } : a));
    }
  });

  const update = async (patch: { status?: string; priority?: string; assigneeId?: string | null; tags?: string[] }) => {
    if (!active) return;
    const res = await updateTicketAction({ ticketId: active.ticketId, ...(patch as object) });
    if (!res.ok) return toast.error(res.error);
    await refresh();
    await reopen(active.ticketId, active.thread.conversation.id, true);
  };

  const row = items.find((i) => i.id === active?.ticketId) ?? null;

  return (
    <div className="grid h-[calc(100dvh-64px)] min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)_340px]">
      {/* Queue */}
      <aside className={cn("min-h-0 flex-col border-r border-border bg-surface", active ? "hidden lg:flex" : "flex")}>
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h1 className="flex items-center gap-2 text-lg font-extrabold">
              <Headset className="h-5 w-5 text-primary" /> {t("title")}
            </h1>
            <span className="ml-auto flex items-center gap-2">
              {counts.breached > 0 && (
                <Badge tone="danger">
                  <AlertTriangle className="h-3 w-3" /> {t("breached", { count: counts.breached })}
                </Badge>
              )}
              <Link href="/admin/support/canned" className="text-[13px] font-semibold text-primary hover:underline">
                {t("cannedLink")}
              </Link>
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {VIEWS.map((v) => {
              const n = v === "open" ? counts.open : v === "mine" ? counts.mine : v === "unassigned" ? counts.unassigned : v === "waiting" ? counts.waiting : null;
              return (
                <button key={v} type="button" onClick={() => (setView(v), void refresh({ ...filters.current, view: v }))} aria-pressed={view === v} className={cn("rounded-full px-2.5 py-1 text-[13px] font-semibold", view === v ? "bg-primary text-white" : "bg-surface-2 text-muted hover:text-fg")}>
                  {t(`views.${v}`)}
                  {n ? <span className="ml-1 opacity-80">{n}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <label className="relative flex-1">
              <span className="sr-only">{t("search")}</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={q}
                placeholder={t("search")}
                onChange={(e) => {
                  setQ(e.target.value);
                  if (refreshTimer.current) clearTimeout(refreshTimer.current);
                  refreshTimer.current = setTimeout(() => void refresh(), 350);
                }}
                className="h-9 w-full rounded-[10px] border border-border bg-surface-2 pl-8 pr-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <Select aria-label={t("priority")} value={priority} onChange={(e) => (setPriority(e.target.value), void refresh({ ...filters.current, priority: e.target.value }))} className="h-9 w-28 text-sm">
              <option value="">{t("anyPriority")}</option>
              {(["URGENT", "HIGH", "NORMAL", "LOW"] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`priorities.${p}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {items.length === 0 && <li className="p-6 text-center text-sm text-muted">{t("empty")}</li>}
          {items.map((it) => {
            const sla = slaState(it, now);
            return (
              <li key={it.id}>
                <button type="button" onClick={() => void reopen(it.id, it.conversationId)} aria-current={active?.ticketId === it.id ? "true" : undefined} className={cn("block w-full px-3 py-2.5 text-left hover:bg-surface-2", active?.ticketId === it.id && "bg-primary/8")}>
                  <div className="flex items-center gap-2">
                    <Avatar name={it.customer.name} src={it.customer.avatarUrl} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-bold">
                        <span className="truncate">{it.customer.name}</span>
                        {it.customer.isPlus && <Crown className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="Plus" />}
                        {it.kind === "SELLER_SUPPORT" && <Store className="h-3.5 w-3.5 shrink-0 text-info" aria-label={t("seller")} />}
                        <span className="ml-auto shrink-0 text-[11px] font-normal text-muted">#{it.number}</span>
                      </p>
                      <p className="truncate text-[13px] text-muted">{it.preview ?? it.subject}</p>
                    </div>
                    {loading === it.id && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <Badge tone={STATUS_TONE[it.status]}>{t(`statuses.${it.status}`)}</Badge>
                    {it.priority !== "NORMAL" && <Badge tone={PRIORITY_TONE[it.priority]}>{t(`priorities.${it.priority}`)}</Badge>}
                    {it.awaitingAgent && <span className="h-2 w-2 rounded-full bg-primary" aria-label={t("awaitingReply")} />}
                    {sla.state !== "met" && it.status !== "RESOLVED" && (
                      <span className={cn("ml-auto inline-flex items-center gap-1 text-[12px] font-semibold", sla.state === "breached" ? "text-danger" : sla.state === "warning" ? "text-accent-ink" : "text-muted")}>
                        <Timer className="h-3.5 w-3.5" /> {sla.state === "breached" ? t("slaBreached") : t("slaLeft", { min: sla.minutesLeft })}
                      </span>
                    )}
                    {it.assignee && <span className="ml-auto text-[12px] text-muted">{it.assignee.id === me.id ? t("me") : it.assignee.name}</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Conversation */}
      <section className={cn("min-h-0 flex-col bg-surface-2", active ? "flex" : "hidden lg:flex")}>
        {active ? (
          <ChatThread
            key={active.ticketId}
            initial={active.thread}
            me={me}
            viewer="staff"
            canned={canned}
            onBack={() => setActive(null)}
            headerExtra={
              <div className="flex items-center gap-1.5">
                {active.thread.conversation.ticket && <Badge tone={STATUS_TONE[active.thread.conversation.ticket.status as keyof typeof STATUS_TONE]}>#{active.thread.conversation.ticket.number}</Badge>}
                {row && row.assignee?.id !== me.id && (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => void update({ assigneeId: me.id })}>
                    <UserCheck className="h-4 w-4" /> {t("takeIt")}
                  </Button>
                )}
                {row && row.status !== "RESOLVED" && (
                  <Button size="sm" variant="success" className="h-8" onClick={() => void update({ status: "RESOLVED" })}>
                    <CheckCircle2 className="h-4 w-4" /> <span className="max-sm:hidden">{t("resolve")}</span>
                  </Button>
                )}
              </div>
            }
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted">
            <Headset className="h-12 w-12" />
            <p>{t("pickTicket")}</p>
          </div>
        )}
      </section>

      {/* Ticket + customer card */}
      {active && (
        <aside className="hidden min-h-0 overflow-y-auto border-l border-border bg-surface p-4 2xl:block">
          <TicketPanel key={active.ticketId} ticketId={active.ticketId} row={row} detail={active.detail} agents={agents} onUpdate={update} onNote={() => loadDetail(active.ticketId)} locale={locale} />
        </aside>
      )}
    </div>
  );
}

function TicketPanel({ ticketId, row, detail, agents, onUpdate, onNote, locale }: { ticketId: string; row: TicketRow | null; detail: Detail; agents: Agent[]; onUpdate: (p: { status?: string; priority?: string; assigneeId?: string | null; tags?: string[] }) => Promise<void>; onNote: () => Promise<void>; locale: string }) {
  const t = useTranslations("support");
  const toast = useToast();
  const [note, setNote] = useState("");
  const [tags, setTags] = useState((row?.tags ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const c = detail.customer;
  return (
    <div className="space-y-5 text-sm">
      {row && (
        <section className="space-y-2">
          <h2 className="font-bold">{t("ticket", { number: row.number })}</h2>
          <label className="block">
            <span className="text-[12px] font-semibold text-muted">{t("status")}</span>
            <Select value={row.status} onChange={(e) => void onUpdate({ status: e.target.value })} className="mt-1 h-9 text-sm">
              {(["NEW", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED"] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[12px] font-semibold text-muted">{t("priority")}</span>
              <Select value={row.priority} onChange={(e) => void onUpdate({ priority: e.target.value })} className="mt-1 h-9 text-sm">
                {(["URGENT", "HIGH", "NORMAL", "LOW"] as const).map((p) => (
                  <option key={p} value={p}>
                    {t(`priorities.${p}`)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-muted">{t("assignee")}</span>
              <Select value={row.assignee?.id ?? ""} onChange={(e) => void onUpdate({ assigneeId: e.target.value || null })} className="mt-1 h-9 text-sm">
                <option value="">{t("unassigned")}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="block">
            <span className="text-[12px] font-semibold text-muted">{t("tags")}</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => tags !== row.tags.join(", ") && void onUpdate({ tags: tags.split(",") })} placeholder="yetkazish, qaytarish" className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface-2 px-2.5 outline-none focus:border-primary" />
          </label>
          <p className="text-[12px] text-muted">
            {t("opened")}: {fmtDateTime(row.createdAt, locale)}
            {row.firstResponseAt && ` · ${t("firstReply")}: ${fmtTime(row.firstResponseAt)}`}
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 font-bold">
          <StickyNote className="h-4 w-4 text-accent" /> {t("notes")}
        </h2>
        <p className="mb-2 text-[12px] text-muted">{t("notesHint")}</p>
        <ul className="space-y-2">
          {detail.notes.map((n) => (
            <li key={n.id} className="rounded-[10px] bg-accent/12 p-2.5">
              <p className="whitespace-pre-line">{n.text}</p>
              <p className="mt-1 text-[11px] text-muted">
                {n.author} · {fmtDateTime(n.createdAt, locale)}
              </p>
            </li>
          ))}
        </ul>
        <Textarea rows={2} className="mt-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} aria-label={t("notes")} />
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          loading={busy}
          disabled={!note.trim()}
          onClick={async () => {
            setBusy(true);
            const res = await addNoteAction({ ticketId, text: note });
            setBusy(false);
            if (!res.ok) return toast.error(res.error);
            setNote("");
            await onNote();
          }}
        >
          {t("addNote")}
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">{t("customer")}</h2>
        <div className="flex items-center gap-2.5">
          <Avatar name={c.name} size={40} />
          <div className="min-w-0">
            <p className="flex items-center gap-1 font-bold">
              {c.name} {c.isPlus && <Badge tone="accent">Plus</Badge>}
            </p>
            <p className="text-[12px] text-muted">
              @{c.login} · {t("since", { date: fmtDay(c.since, locale, { year: true }) })}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <Stat label={t("orders")} value={c.orders} />
          <Stat label={t("spend")} value={formatUZS(c.spend, locale)} />
          <Stat label={t("returns")} value={c.returns} />
          <Stat label={t("tier")} value={c.tier} />
        </dl>
        {(c.phone || c.email || c.telegram) && (
          <p className="text-[13px] text-muted">
            {[c.phone, c.email, c.telegram && `@${c.telegram}`].filter(Boolean).join(" · ")}
          </p>
        )}
        {c.shops.length > 0 && (
          <p className="flex items-center gap-1.5 text-[13px]">
            <Store className="h-4 w-4 text-info" /> {c.shops.map((s) => s.name).join(", ")}
          </p>
        )}
        {c.flags.length > 0 && (
          <div className="rounded-[10px] bg-danger/8 p-2.5 text-[13px] text-danger">
            <p className="flex items-center gap-1.5 font-bold">
              <Flag className="h-4 w-4" /> {t("flags")}
            </p>
            {c.flags.map((f) => `${f.type} (${f.score})`).join(", ")}
          </div>
        )}
        {c.chatBanned && <Badge tone="danger">{t("chatBanned")}</Badge>}
        {c.recentOrders.length > 0 && (
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted">{t("recentOrders")}</p>
            <ul className="space-y-1">
              {c.recentOrders.map((o) => (
                <li key={o.id} className="flex justify-between gap-2 text-[13px]">
                  <span>
                    №{o.number} · <span className="text-muted">{o.status}</span>
                  </span>
                  <span className="tabular">{formatUZS(o.total, locale)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {c.previous.length > 0 && (
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted">{t("previous")}</p>
            <ul className="space-y-1 text-[13px]">
              {c.previous.map((p) => (
                <li key={p.id}>
                  #{p.number} · {p.subject ?? "—"} <span className="text-muted">({t(`statuses.${p.status}` as "statuses.NEW")})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[10px] bg-surface-2 p-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="tabular font-bold">{value}</dd>
    </div>
  );
}
