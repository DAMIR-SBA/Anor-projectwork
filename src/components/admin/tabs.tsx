import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/** URL-driven tab strip for server-rendered admin lists. */
export function AdminTabs({ tabs, active }: { tabs: Array<{ key: string; href: string; label: ReactNode; count?: number }>; active: string }) {
  return (
    <nav className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Tabs">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined} className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold", t.key === active ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg")}>
          {t.label}
          {t.count ? <span className={cn("rounded-full px-1.5 text-xs", t.key === active ? "bg-primary text-white" : "bg-surface-3 text-fg")}>{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** GET search/filter form; keeps the page shareable and works without JS. */
export function FilterForm({ children, submitLabel }: { children: ReactNode; submitLabel: string }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
      {children}
      <button type="submit" className="h-10 rounded-[12px] border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-2">
        {submitLabel}
      </button>
    </form>
  );
}

export const inputCls = "h-10 rounded-[12px] border border-border bg-surface px-3 text-sm outline-none focus:border-primary";

/**
 * Ranked horizontal bars for one measure (single hue, magnitude only). The value and share are
 * always printed, so the bar is never the only carrier of the number.
 */
export function BarList({ rows, empty }: { rows: Array<{ key: string; label: ReactNode; value: number; display: string; sub?: ReactNode }>; empty: ReactNode }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold">{r.label}</span>
            <span className="shrink-0 tabular">
              {r.display} <span className="text-muted">· {Math.round((r.value / total) * 100)}%</span>
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          {r.sub && <p className="mt-0.5 text-xs text-muted">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
