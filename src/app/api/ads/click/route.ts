import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { rateLimit } from "@/server/security/rate-limit";
import { ipFromHeaders } from "@/server/security/request";
import { sign } from "@/server/security/crypto";
import { AD_ATTRIBUTION_DAYS, AD_COOKIE, recordClick, verifyClick } from "@/server/services/ads";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";

const PREFIX: Record<string, string> = { uz: "", "uz-Cyrl": "/oz", ru: "/ru" };

/** Sponsored click: verify the signature, charge once per viewer per 30 min, set attribution cookie, redirect. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const c = sp.get("c") ?? "";
  const p = sp.get("p") ?? "";
  const product = await db.product.findUnique({ where: { id: p }, select: { slug: true } });
  const prefix = PREFIX[req.cookies.get("anor_locale")?.value ?? "uz"] ?? "";
  if (!product) return NextResponse.redirect(new URL(`${prefix}/`, req.url));
  const res = NextResponse.redirect(new URL(`${prefix}/p/${product.slug}`, req.url));
  if (!verifyClick(c, p, sp.get("s") ?? "")) return res;
  const viewer = req.cookies.get("anor_aid")?.value ?? ipFromHeaders(req.headers);
  const rl = await rateLimit(`adclick:${c}:${viewer}`, 1, 1800);
  if (rl.success) await recordClick(c);
  // Attribution is marketing: without consent the click is counted but not linked to purchases.
  if (parseConsent(req.cookies.get(CONSENT_COOKIE)?.value)?.marketing) res.cookies.set(AD_COOKIE, sign(JSON.stringify({ campaignId: c, productId: p, at: Date.now() }), AD_ATTRIBUTION_DAYS * 86_400), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: AD_ATTRIBUTION_DAYS * 86_400 });
  return res;
}
