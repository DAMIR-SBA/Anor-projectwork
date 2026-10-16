import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { AnorMark, OG_SIZE, ogFonts, pickLocale } from "@/server/og";

/** GET /api/og?locale= — default social card: brand, tagline and the three promises. */
export async function GET(req: NextRequest) {
  const locale = pickLocale(req.nextUrl.searchParams.get("locale"));
  const t = await getTranslations({ locale, namespace: "brand" });
  const tags = locale === "ru" ? ["Доставка от 1 дня", "Рассрочка 0–24 мес.", "Возврат 14 дней"] : ["1 kunda yetkazish", "Nasiya 0–24 oy", "14 kunda qaytarish"];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #C8102E 0%, #8E0B22 100%)", color: "#fff", fontFamily: "DejaVu" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 104, height: 104, borderRadius: 28, background: "#fff", alignItems: "center", justifyContent: "center" }}>
            <AnorMark size={84} />
          </div>
          <span style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>anor</span>
        </div>
        <div style={{ display: "flex", fontSize: 58, fontWeight: 700, lineHeight: 1.1, maxWidth: 960 }}>{t("tagline")}</div>
        <div style={{ display: "flex", gap: 16 }}>
          {tags.map((x) => (
            <span key={x} style={{ display: "flex", padding: "12px 22px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: 28 }}>
              {x}
            </span>
          ))}
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts(), headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
