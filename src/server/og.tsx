import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };

export const pickLocale = (v: string | null) => (v === "ru" || v === "uz-Cyrl" ? v : "uz");

/** Metadata entry for a card served by /api/og (stable URL without a locale prefix). */
export const ogImage = (path: string, locale: string, alt: string) => ({ url: `${path}?locale=${encodeURIComponent(locale)}`, width: OG_SIZE.width, height: OG_SIZE.height, alt });

/** DejaVu covers Uzbek Latin/Cyrillic and Russian (the default OG font does not). */
export async function ogFonts() {
  const dir = path.join(process.cwd(), "assets/fonts");
  const [regular, bold] = await Promise.all([readFile(path.join(dir, "DejaVuSans.ttf")), readFile(path.join(dir, "DejaVuSans-Bold.ttf"))]);
  return [
    { name: "DejaVu", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "DejaVu", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}

/** Product art as a data URL the OG renderer can draw (SVG/PNG/JPEG only; others are skipped). */
export async function ogImageData(url: string | null | undefined, origin: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(new URL(url, origin), { signal: AbortSignal.timeout(3000) });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !["image/svg+xml", "image/png", "image/jpeg"].includes(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export function AnorMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <path d="M22.5 19 L23.5 8 L28.5 13 L32 4.5 L35.5 13 L40.5 8 L41.5 19 Z" fill="#8E0B22" />
      <circle cx="32" cy="37" r="23" fill="#C8102E" />
      <circle cx="36" cy="38.5" r="3.4" fill="#F5B301" />
      <circle cx="44" cy="42.5" r="3.4" fill="#F5B301" />
      <circle cx="37.5" cy="47" r="3.4" fill="#F5B301" />
    </svg>
  );
}
