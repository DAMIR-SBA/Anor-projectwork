"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Handler = (data: Record<string, unknown>) => void;
type Ctx = { on: (type: string, fn: Handler) => () => void; mode: "sse" | "poll" | "off"; connected: boolean };

const RealtimeContext = createContext<Ctx>({ on: () => () => {}, mode: "off", connected: false });

const EVENT_TYPES = ["chat.message", "chat.update", "chat.receipt", "chat.typing", "chat.unread", "notification", "notification.broadcast", "support.ticket", "support.note"];

/**
 * One realtime connection per tab. Prefers SSE; after repeated failures (proxies that buffer
 * streams, serverless timeouts) or when the server asks for it, falls back to polling.
 */
export function RealtimeProvider({ enabled, staff = false, driver = "sse", children }: { enabled: boolean; staff?: boolean; driver?: "sse" | "poll"; children: ReactNode }) {
  const handlers = useRef(new Map<string, Set<Handler>>());
  const [mode, setMode] = useState<"sse" | "poll" | "off">(enabled ? driver : "off");
  const [connected, setConnected] = useState(false);
  // 0 = "recent events only" for the first poll; advanced by every event received.
  const lastAt = useRef(0);

  const dispatch = useCallback((type: string, data: Record<string, unknown>) => {
    if (typeof data.at === "number") lastAt.current = Math.max(lastAt.current, data.at);
    handlers.current.get(type)?.forEach((fn) => fn(data));
  }, []);

  useEffect(() => {
    if (!enabled || mode !== "sse" || typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/realtime${staff ? "?as=staff" : ""}`);
    let failures = 0;
    es.addEventListener("ready", () => {
      failures = 0;
      setConnected(true);
    });
    for (const type of EVENT_TYPES) es.addEventListener(type, (e) => dispatch(type, JSON.parse((e as MessageEvent).data)));
    es.onerror = () => {
      setConnected(false);
      if (++failures >= 3) {
        es.close();
        setMode("poll");
      }
    };
    return () => es.close();
  }, [enabled, mode, staff, dispatch]);

  useEffect(() => {
    if (!enabled || mode !== "poll") return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/realtime/poll?since=${lastAt.current}${staff ? "&as=staff" : ""}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { events: Array<{ type: string; data: Record<string, unknown> }>; now: number };
          setConnected(true);
          for (const e of body.events) dispatch(e.type, e.data);
          lastAt.current = Math.max(lastAt.current, body.now - 1000);
        }
      } catch {
        setConnected(false);
      }
      if (!stop) setTimeout(tick, document.hidden ? 15_000 : 4_000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [enabled, mode, staff, dispatch]);

  const on = useCallback((type: string, fn: Handler) => {
    const set = handlers.current.get(type) ?? new Set();
    set.add(fn);
    handlers.current.set(type, set);
    return () => void set.delete(fn);
  }, []);
  const value = useMemo(() => ({ on, mode, connected }), [on, mode, connected]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export const useRealtimeStatus = () => {
  const { mode, connected } = useContext(RealtimeContext);
  return { mode, connected };
};

/** Subscribe to a realtime event type for the lifetime of the component. */
export function useRealtime(type: string, fn: Handler) {
  const { on } = useContext(RealtimeContext);
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => on(type, (d) => ref.current(d)), [on, type]);
}

/** Live counter badge: starts from the server value and follows realtime events. */
export function LiveBadge({ initial, kind, className }: { initial: number; kind: "chat" | "notifications"; className?: string }) {
  const [count, setCount] = useState(initial);
  useRealtime(kind === "chat" ? "chat.unread" : "notification", (d) => {
    if (kind === "chat" && typeof d.total === "number") setCount(d.total);
    if (kind === "notifications") setCount((c) => c + 1);
  });
  if (count <= 0) return null;
  return <span className={className}>{count > 99 ? "99+" : count}</span>;
}
