import { productArtSvg } from "@/lib/product-art";

// /media/demo/<kind>-<HEX>-<n>.svg — deterministic demo product art, cached forever.
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = file.match(/^([a-z]+)-([0-9A-Fa-f]{6})-(\d+)\.svg$/);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(productArtSvg(m[1], m[2], Number(m[3])), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" },
  });
}
