// String renderers for the ANOR mark (favicon, OG, PWA icons, emails) — same geometry as <AnorLogo />.
import {
  BRAND,
  SYMBOL_BODY,
  SYMBOL_CROWN,
  SYMBOL_SEEDS,
  SYMBOL_SHINE,
  WORDMARK_PATHS,
  WORDMARK_STROKE,
} from "@/components/brand/AnorLogo";

function symbolInner(): string {
  const seeds = SYMBOL_SEEDS.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${BRAND.gold}"/>`).join("");
  return (
    `<path d="${SYMBOL_CROWN}" fill="${BRAND.crimsonDark}" stroke="${BRAND.crimsonDark}" stroke-width="3" stroke-linejoin="round"/>` +
    `<circle cx="${SYMBOL_BODY.cx}" cy="${SYMBOL_BODY.cy}" r="${SYMBOL_BODY.r}" fill="${BRAND.crimson}"/>` +
    `<path d="${SYMBOL_SHINE}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="4" stroke-linecap="round"/>` +
    seeds
  );
}

export function symbolSvg(opts: { size?: number; background?: string; padding?: number } = {}): string {
  const { size = 64, background, padding = 0 } = opts;
  const vb = 64 + padding * 2;
  const bg = background ? `<rect x="${-padding}" y="${-padding}" width="${vb}" height="${vb}" rx="${vb * 0.22}" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-padding} ${-padding} ${vb} ${vb}">${bg}${symbolInner()}</svg>`;
}

export function lockupSvg(opts: { height?: number; textColor?: string } = {}): string {
  const { height = 64, textColor = BRAND.ink } = opts;
  const width = (height * 196) / 64;
  const word = WORDMARK_PATHS.map((d) => `<path d="${d}"/>`).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 196 64">${symbolInner()}` +
    `<g transform="translate(74 7.4) scale(1.1)" fill="none" stroke="${textColor}" stroke-width="${WORDMARK_STROKE}" stroke-linecap="round" stroke-linejoin="round">${word}</g></svg>`
  );
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
