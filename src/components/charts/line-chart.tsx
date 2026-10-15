"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type LinePoint = { x: string; y: number; label: string };

type Props = {
  points: LinePoint[];
  formatY: (v: number) => string;
  formatTick?: (v: number) => string;
  height?: number;
  title: string;
  /** Mark and label the minimum value (e.g. "lowest price"). */
  minLabel?: string;
  tableLabels?: { x: string; y: string; show: string };
  /** Start the y-axis at zero (magnitude) or fit to data (change over time). */
  zeroBased?: boolean;
};

const PAD = { top: 16, right: 16, bottom: 26, left: 56 };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v));
  return ticks;
}

/**
 * Single-series line chart: 2px line, 10% area wash, hairline grid, end + min markers with
 * surface rings, crosshair tooltip on pointer and keyboard, and a table view.
 */
export function LineChart({ points, formatY, formatTick, height = 220, title, minLabel, tableLabels, zeroBased = false }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId().replace(/:/g, "");

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const ys = points.map((p) => p.y);
    const lo = zeroBased ? 0 : Math.min(...ys);
    const hi = Math.max(...ys);
    const ticks = niceTicks(zeroBased ? 0 : lo - (hi - lo) * 0.15, hi + (hi - lo) * 0.1);
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    const iw = width - PAD.left - PAD.right;
    const ih = height - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const y = (v: number) => PAD.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
    const minIdx = ys.indexOf(Math.min(...ys));
    return { ticks, x, y, iw, ih, minIdx };
  }, [points, width, height, zeroBased]);

  if (!points.length) return null;
  const path = points.map((p, i) => `${i ? "L" : "M"}${geo.x(i).toFixed(1)},${geo.y(p.y).toFixed(1)}`).join("");
  const area = `${path}L${geo.x(points.length - 1)},${PAD.top + geo.ih}L${geo.x(0)},${PAD.top + geo.ih}Z`;
  const last = points.length - 1;
  const h = hover ?? null;
  const xLabels = [0, Math.floor(last / 2), last].filter((v, i, a) => a.indexOf(v) === i);

  const onMove = (clientX: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    const rel = clientX - rect.left - PAD.left;
    const i = Math.round((rel / geo.iw) * last);
    setHover(Math.max(0, Math.min(last, i)));
  };

  return (
    <figure className="m-0">
      <div
        ref={wrap}
        className="relative select-none outline-none"
        style={{ height }}
        tabIndex={0}
        role="img"
        aria-label={`${title}: ${points.map((p) => `${p.label} ${formatY(p.y)}`).slice(-1)[0]}`}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(last)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? last) - 1));
          if (e.key === "ArrowRight") setHover((v) => Math.min(last, (v ?? 0) + 1));
        }}
      >
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.12" />
              <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {geo.ticks.map((tk) => (
            <g key={tk}>
              <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(tk)} y2={geo.y(tk)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={PAD.left - 8} y={geo.y(tk)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[11px] tabular">
                {(formatTick ?? formatY)(tk)}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text key={i} x={geo.x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} className="fill-muted text-[11px]">
              {points[i].label}
            </text>
          ))}
          <path d={area} fill={`url(#${gradId})`} />
          <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {minLabel && points[geo.minIdx].y < points[last].y && (
            <g>
              <circle cx={geo.x(geo.minIdx)} cy={geo.y(points[geo.minIdx].y)} r={4} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
              <text x={geo.x(geo.minIdx)} y={geo.y(points[geo.minIdx].y) + 18} textAnchor={geo.x(geo.minIdx) > width * 0.7 ? "end" : geo.x(geo.minIdx) < width * 0.3 ? "start" : "middle"} className="fill-muted text-[11px] font-semibold">
                {minLabel}
              </text>
            </g>
          )}
          <circle cx={geo.x(last)} cy={geo.y(points[last].y)} r={4.5} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
          {h != null && (
            <g>
              <line x1={geo.x(h)} x2={geo.x(h)} y1={PAD.top} y2={PAD.top + geo.ih} stroke="var(--muted)" strokeOpacity={0.5} strokeWidth={1} />
              <circle cx={geo.x(h)} cy={geo.y(points[h].y)} r={5} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
        {h != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-[10px] bg-[#1A1A1F] px-3 py-2 text-white shadow-[var(--shadow-lift)]"
            style={{ left: Math.min(Math.max(geo.x(h) - 70, 0), width - 150), maxWidth: 160 }}
          >
            <p className="tabular text-sm font-bold">{formatY(points[h].y)}</p>
            <p className="text-xs text-white/70">{points[h].label}</p>
          </div>
        )}
      </div>
      {tableLabels && (
        <details className="mt-1 text-sm">
          <summary className="cursor-pointer text-muted">{tableLabels.show}</summary>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1 font-semibold">{tableLabels.x}</th>
                <th className="py-1 text-right font-semibold">{tableLabels.y}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.x} className="border-t border-border">
                  <td className="py-1">{p.label}</td>
                  <td className="tabular py-1 text-right">{formatY(p.y)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  );
}
