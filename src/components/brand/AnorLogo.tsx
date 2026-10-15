import { useId } from "react";

export type AnorLogoVariant = "full" | "symbol" | "wordmark";
export type AnorLogoTone = "color" | "white" | "dark";

type Props = {
  variant?: AnorLogoVariant;
  tone?: AnorLogoTone;
  /** Rendered height in px; width follows the aspect ratio. */
  height?: number;
  className?: string;
  title?: string;
};

export const BRAND = {
  crimson: "#C8102E",
  crimsonDark: "#8E0B22",
  gold: "#F5B301",
  ink: "#1A1A1F",
} as const;

// Geometry lives in plain constants so the same shapes feed the favicon,
// OG image and PWA icons (see src/lib/brand-svg.ts).
export const SYMBOL_VIEWBOX = "0 0 64 64";
export const SYMBOL_BODY = { cx: 32, cy: 37, r: 23 };
export const SYMBOL_CROWN = "M22.5 19 L23.5 8 L28.5 13 L32 4.5 L35.5 13 L40.5 8 L41.5 19 Z";
export const SYMBOL_SEEDS: Array<[number, number, number]> = [
  [36, 38.5, 3.4],
  [44, 42.5, 3.4],
  [37.5, 47.5, 3.4],
  [29, 44.5, 3.4],
];
export const SYMBOL_SHINE = "M16.5 33 A16 16 0 0 1 25 21.5";

// Wordmark "anor": round-capped strokes on a 24px x-height (stroke 7).
export const WORDMARK_VIEWBOX = "0 12 110 28";
export const WORDMARK_PATHS = [
  // a — bowl + stem
  "M22.5 26 A9.5 9.5 0 1 0 22.5 26.01",
  "M22.5 16.5 V35.5",
  // n
  "M34.5 16.5 V35.5 M34.5 26 A9.5 9.5 0 0 1 53.5 26 V35.5",
  // o
  "M84.5 26 A9.5 9.5 0 1 0 84.5 26.01",
  // r
  "M96.5 16.5 V35.5 M96.5 26 A9.5 9.5 0 0 1 106 16.5",
];
export const WORDMARK_STROKE = 7;

function Symbol({ tone, maskId }: { tone: AnorLogoTone; maskId: string }) {
  if (tone === "color") {
    return (
      <g>
        <path d={SYMBOL_CROWN} fill={BRAND.crimsonDark} stroke={BRAND.crimsonDark} strokeWidth={3} strokeLinejoin="round" />
        <circle {...SYMBOL_BODY} fill={BRAND.crimson} />
        <path d={SYMBOL_SHINE} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" />
        {SYMBOL_SEEDS.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={BRAND.gold} />
        ))}
      </g>
    );
  }
  // Monochrome: one fill with seeds and shine punched out, so it works on any background.
  const fill = tone === "white" ? "#fff" : BRAND.ink;
  return (
    <g>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect width="64" height="64" fill="#fff" />
          <path d={SYMBOL_SHINE} fill="none" stroke="#000" strokeWidth={4} strokeLinecap="round" />
          {SYMBOL_SEEDS.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#000" />
          ))}
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <path d={SYMBOL_CROWN} fill={fill} stroke={fill} strokeWidth={3} strokeLinejoin="round" />
        <circle {...SYMBOL_BODY} fill={fill} />
      </g>
    </g>
  );
}

function Wordmark({ tone }: { tone: AnorLogoTone }) {
  const color = tone === "white" ? "#fff" : tone === "dark" ? BRAND.ink : "currentColor";
  return (
    <g fill="none" stroke={color} strokeWidth={WORDMARK_STROKE} strokeLinecap="round" strokeLinejoin="round">
      {WORDMARK_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  );
}

/**
 * ANOR brand mark. `full` = symbol + wordmark, `symbol` = pomegranate only,
 * `wordmark` = "anor" only. `tone="white"` is the monochrome variant for dark backgrounds.
 */
export function AnorLogo({ variant = "full", tone = "color", height = 32, className, title = "ANOR" }: Props) {
  const maskId = `anor-mask-${useId().replace(/:/g, "")}`;

  if (variant === "symbol") {
    return (
      <svg viewBox={SYMBOL_VIEWBOX} height={height} width={height} role="img" aria-label={title} className={className}>
        <Symbol tone={tone} maskId={maskId} />
      </svg>
    );
  }

  if (variant === "wordmark") {
    const width = (height * 110) / 28;
    return (
      <svg viewBox={WORDMARK_VIEWBOX} height={height} width={width} role="img" aria-label={title} className={className}>
        <Wordmark tone={tone} />
      </svg>
    );
  }

  // Full lockup: 64-unit symbol + wordmark scaled to sit on the symbol's optical center.
  const width = (height * 196) / 64;
  return (
    <svg viewBox="0 0 196 64" height={height} width={width} role="img" aria-label={title} className={className}>
      <Symbol tone={tone} maskId={maskId} />
      <g transform="translate(74 7.4) scale(1.1)">
        <Wordmark tone={tone} />
      </g>
    </svg>
  );
}
