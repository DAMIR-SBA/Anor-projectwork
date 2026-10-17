import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 p-4 pb-0 md:p-5 md:pb-0", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-bold leading-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export type BadgeTone = "neutral" | "primary" | "accent" | "success" | "danger" | "info" | "dark";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-3 text-fg",
  primary: "bg-primary text-white",
  accent: "bg-accent text-[#1A1A1F]",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
  dark: "bg-[#1A1A1F] text-white",
};

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold leading-5", tones[tone], className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      {icon && <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary dark:bg-primary/15">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, trend }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; trend?: number | null }) {
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between text-sm font-medium text-muted">
        <span>{label}</span>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <div className="tabular text-2xl font-extrabold tracking-tight">{value}</div>
      {(hint || trend != null) && (
        <div className="flex items-center gap-2 text-xs text-muted">
          {trend != null && <span className={cn("font-bold", trend >= 0 ? "text-success" : "text-danger")}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%</span>}
          {hint}
        </div>
      )}
    </div>
  );
}

export function Avatar({ name, src, size = 40, className, online }: { name?: string | null; src?: string | null; size?: number; className?: string; online?: boolean }) {
  const initials = (name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  // Stable hue from the name so avatars are distinguishable in chat lists.
  const hue = [...(name || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        // Initials are decoration (the name is always next to or around the avatar), drawn via CSS so
        // they do not become part of a button's or link's accessible name.
        <span data-initials={initials} className="flex h-full w-full items-center justify-center rounded-full font-bold text-white before:content-[attr(data-initials)]" style={{ background: `hsl(${hue} 50% 30%)`, fontSize: size * 0.38 }} aria-hidden="true" />
      )}
      {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-success" aria-label="online" />}
    </span>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-border", className)} />;
}

export function KeyValue({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(120px,40%)_1fr] gap-x-4 gap-y-2 text-sm", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ head, children, className, empty }: { head: ReactNode[]; children: ReactNode; className?: string; empty?: ReactNode }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-border [&>tr:last-child]:border-0 [&_td]:px-3 [&_td]:py-3 [&_td]:align-middle">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

/** `label` names the bar for screen readers (what is filling up), e.g. the mission title. */
export function ProgressBar({ value, max = 100, label, className, tone = "primary" }: { value: number; max?: number; label: string; className?: string; tone?: "primary" | "accent" | "success" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = tone === "accent" ? "bg-accent" : tone === "success" ? "bg-success" : "bg-primary";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width]", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
