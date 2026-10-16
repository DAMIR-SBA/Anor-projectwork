import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { db } from "@/server/db";
import { AnorMark, OG_SIZE, ogFonts, ogImageData, pickLocale } from "@/server/og";
import { loc, locText } from "@/lib/localized";
import { formatUZS } from "@/lib/money";

/** GET /api/og/p/:slug?locale= — product share card: picture, title, price, rating and shop. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const locale = pickLocale(req.nextUrl.searchParams.get("locale"));
  const p = await db.product.findFirst({
    where: { slug, status: "ACTIVE", deletedAt: null },
    select: { titleUz: true, titleRu: true, titleCyrl: true, price: true, oldPrice: true, rating: true, reviewCount: true, shop: { select: { name: true } }, media: { where: { type: "IMAGE" }, orderBy: { sort: "asc" }, take: 1, select: { url: true } } },
  });
  const origin = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const image = p ? await ogImageData(p.media[0]?.url, origin) : null;
  const title = p ? loc(p, "title", locale) : "ANOR";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#F6F6F8", fontFamily: "DejaVu", color: "#1A1A1F" }}>
        <div style={{ width: 560, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og, not the browser */}
          {image ? <img src={image} width={480} height={480} style={{ objectFit: "contain" }} alt="" /> : <AnorMark size={260} />}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 56px 48px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AnorMark size={52} />
            <span style={{ fontSize: 40, fontWeight: 700, color: "#C8102E" }}>anor</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 700, lineHeight: 1.15 }}>{title.length > 70 ? `${title.slice(0, 68)}…` : title}</div>
            {p && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                <span style={{ fontSize: 56, fontWeight: 700, color: "#C8102E" }}>{formatUZS(p.price, locale)}</span>
                {p.oldPrice && p.oldPrice > p.price ? <span style={{ fontSize: 30, color: "#6B6B73", textDecoration: "line-through" }}>{formatUZS(p.oldPrice, locale)}</span> : null}
              </div>
            )}
          </div>
          {p && (
            <div style={{ display: "flex", gap: 14, fontSize: 26, color: "#4A4A52" }}>
              {p.reviewCount > 0 ? <span style={{ display: "flex" }}>★ {p.rating.toFixed(1)} ({p.reviewCount})</span> : null}
              <span style={{ display: "flex" }}>{locText(p.shop.name, locale)}</span>
            </div>
          )}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts(), headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
