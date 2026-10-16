"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

// One shared 1-second clock for every countdown on the page (they tick together).
const clock = { now: 0, timer: null as ReturnType<typeof setInterval> | null, listeners: new Set<() => void>() };
function subscribeClock(cb: () => void) {
  clock.listeners.add(cb);
  if (!clock.timer) {
    // Fresh reading when the clock (re)starts; React re-reads the snapshot right after subscribing.
    clock.now = Date.now();
    clock.timer = setInterval(() => {
      clock.now = Date.now();
      clock.listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    clock.listeners.delete(cb);
    if (!clock.listeners.size && clock.timer) {
      clearInterval(clock.timer);
      clock.timer = null;
    }
  };
}
const readClock = () => clock.now || (clock.now = Date.now());

/** Countdown to a deadline; renders HH:MM:SS (with days when > 24h). Shows dashes until hydrated. */
export function Countdown({ to, className, onDone, labels }: { to: string | Date; className?: string; onDone?: () => void; labels?: { d: string } }) {
  const target = typeof to === "string" ? new Date(to).getTime() : to.getTime();
  const now = useSyncExternalStore(subscribeClock, readClock, () => null);
  const doneRef = useRef(false);

  const left = now == null ? null : Math.max(0, target - now);
  useEffect(() => {
    if (left === 0 && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  }, [left, onDone]);

  if (left == null) return <span className={cn("tabular", className)}>--:--:--</span>;
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className={cn("tabular", className)} role="timer" aria-live="off">
      {d > 0 && `${d}${labels?.d ?? "d"} `}
      {pad(h)}:{pad(m)}:{pad(sec)}
    </span>
  );
}

export function CopyButton({ value, label, copiedLabel, className }: { value: string; label?: string; copiedLabel?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn("inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-sm font-semibold text-brand-ink hover:bg-primary/10", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard can be blocked; the value stays visible to copy manually */
        }
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? (copiedLabel ?? "OK") : (label ?? "Copy")}
    </button>
  );
}

/** Client-side tabs for in-page panels. Route-level tabs use links instead. */
export function Tabs({ tabs, initial, className }: { tabs: Array<{ key: string; label: ReactNode; content: ReactNode }>; initial?: string; className?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key);
  return (
    <div className={className}>
      <div role="tablist" className="scrollbar-none flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[15px] font-semibold transition-colors",
              active === t.key ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" hidden={active !== t.key} className="pt-4">
          {t.content}
        </div>
      ))}
    </div>
  );
}

/** Password strength meter (0-4) based on length and character variety. */
export function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (kinds >= 2) score++;
  if (kinds >= 3) score++;
  if (/(.)\1{3,}/.test(pw) || /^(?:1234|qwerty|password|parol)/i.test(pw)) score = Math.max(0, score - 2);
  return Math.min(4, score);
}

export function StrengthMeter({ value, labels }: { value: string; labels: [string, string, string, string, string] }) {
  const score = passwordScore(value);
  const colors = ["bg-surface-3", "bg-danger", "bg-accent", "bg-[#8BC34A]", "bg-success"];
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", score >= i ? colors[score] : "bg-surface-3")} />
        ))}
      </div>
      <span className="w-24 text-right text-xs font-semibold text-muted">{labels[score]}</span>
    </div>
  );
}
