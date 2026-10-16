// Pure seller-side helpers: legal/bank validation, unit economics, ad metrics, payouts, CSV.
import { cyrillicToLatin } from "./translit";

export type LegalType = "LLC" | "SELF_EMPLOYED" | "INDIVIDUAL_ENTREPRENEUR";

/** STIR (INN) is 9 digits for companies and entrepreneurs; self-employed register with a 14-digit PINFL. */
export function validateTaxId(type: LegalType, value: string): boolean {
  const v = value.replace(/\s/g, "");
  if (type === "SELF_EMPLOYED") return /^\d{14}$/.test(v);
  // Legal entities start with 2/3, entrepreneurs with 4–6 (individual TINs).
  return /^\d{9}$/.test(v) && (type === "LLC" ? /^[23]/.test(v) : /^[4-7]/.test(v));
}

/** Uzbek bank accounts are 20 digits; MFO (bank code) is 5 digits. */
export const validateBankAccount = (v: string) => /^\d{20}$/.test(v.replace(/\s/g, ""));
export const validateMfo = (v: string) => /^\d{5}$/.test(v.replace(/\s/g, ""));

export function maskAccount(v: string | null | undefined): string {
  if (!v) return "—";
  const d = v.replace(/\s/g, "");
  return `•••• ${d.slice(-4)}`;
}

export const DOCUMENTS: Record<LegalType, string[]> = {
  LLC: ["registration_certificate", "director_passport", "charter"],
  INDIVIDUAL_ENTREPRENEUR: ["ie_certificate", "passport"],
  SELF_EMPLOYED: ["self_employed_certificate", "passport"],
};
/** The last LLC document (charter) is optional. */
export const requiredDocuments = (t: LegalType) => (t === "LLC" ? DOCUMENTS.LLC.slice(0, 2) : DOCUMENTS[t]);

export function slugify(name: string): string {
  return cyrillicToLatin(name)
    .toLowerCase()
    .replace(/[ʻʼ‘’'`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// ── Unit economics ───────────────────────────────────────────────────────

export type Economics = { price: number; commission: number; logistics: number; ads: number; returnsCost: number; payout: number; cost: number | null; profit: number | null; margin: number | null };

/**
 * Per-unit economics: what the seller keeps after commission, logistics, attributed ad
 * spend and expected return losses, and the profit if a cost price is known.
 */
export function unitEconomics(i: { price: number; commissionRate: number; logisticsFee: number; adSpendPerUnit?: number; returnRate?: number; costPrice?: number | null }): Economics {
  const commission = Math.round(i.price * i.commissionRate);
  const ads = Math.round(i.adSpendPerUnit ?? 0);
  // A returned unit costs the logistics twice (out and back); approximate expected loss per sold unit.
  const returnsCost = Math.round((i.returnRate ?? 0) * i.logisticsFee * 2);
  const payout = i.price - commission - i.logisticsFee - ads - returnsCost;
  const cost = i.costPrice ?? null;
  const profit = cost === null ? null : payout - cost;
  return { price: i.price, commission, logistics: i.logisticsFee, ads, returnsCost, payout, cost, profit, margin: profit === null || !i.price ? null : profit / i.price };
}

// ── Ads ──────────────────────────────────────────────────────────────────

export function adMetrics(s: { impressions: number; clicks: number; orders: number; revenue: number; spend: number }) {
  return {
    ctr: s.impressions ? s.clicks / s.impressions : 0,
    cr: s.clicks ? s.orders / s.clicks : 0,
    cpc: s.clicks ? Math.round(s.spend / s.clicks) : 0,
    roas: s.spend ? s.revenue / s.spend : 0,
    /** Advertising cost of sales: spend / revenue. */
    acos: s.revenue ? s.spend / s.revenue : 0,
  };
}

/** Cost of one event: CPC charges per click, CPM per 1000 impressions (so'm, rounded up). */
export function adCharge(model: "CPC" | "CPM", bid: number, event: "impression" | "click"): number {
  if (model === "CPC") return event === "click" ? bid : 0;
  return event === "impression" ? Math.ceil(bid / 1000) : 0;
}

/** Ranking score for sponsored slots: bid normalized to an expected per-impression value × quality. */
export function adScore(c: { bidModel: "CPC" | "CPM"; bid: number }, quality: { ctr: number; rating: number }): number {
  const perImpression = c.bidModel === "CPM" ? c.bid / 1000 : c.bid * Math.max(quality.ctr, 0.01);
  return perImpression * (0.6 + 0.4 * Math.min(1, quality.rating / 5));
}

// ── Payouts ──────────────────────────────────────────────────────────────

const TZ = 5 * 3_600_000;

/** Monday 00:00 – next Monday 00:00 (Tashkent) of the week containing `d`. */
export function payoutWeek(d: Date): { start: Date; end: Date } {
  const local = new Date(d.getTime() + TZ);
  const day = (local.getUTCDay() + 6) % 7;
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day) - TZ;
  return { start: new Date(start), end: new Date(start + 7 * 86_400_000) };
}

/** Payouts are sent on Wednesdays for the previous week. */
export function nextPayoutDate(now: Date): Date {
  const { start } = payoutWeek(now);
  const wed = new Date(start.getTime() + 2 * 86_400_000 + 10 * 3_600_000);
  return wed > now ? wed : new Date(wed.getTime() + 7 * 86_400_000);
}

export type PayoutInput = { gross: number; commission: number; logistics: number; adSpend: number; penalties: number; refunds: number };
export const payoutNet = (p: PayoutInput) => p.gross - p.commission - p.logistics - p.adSpend - p.penalties - p.refunds;

// ── Rating ───────────────────────────────────────────────────────────────

export function scoreLevel(score: number): "excellent" | "good" | "warning" | "restricted" {
  return score >= 90 ? "excellent" : score >= 80 ? "good" : score >= 65 ? "warning" : "restricted";
}

export const SCORE_WEIGHTS = { sla: 0.35, reviews: 0.35, cancellations: 0.2, returns: 0.1 } as const;
const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/**
 * 0–100 fulfillment score. Each component is normalized to 0–100: cancellations hit zero at 25%
 * seller-initiated cancels, returns at ~33%; a shop without reviews gets a neutral 90.
 */
export function fulfillmentScore(m: { slaCompliance: number; rating: number; reviewCount: number; cancellationRate: number; returnRate: number }) {
  const parts = {
    sla: clamp100(m.slaCompliance),
    reviews: m.reviewCount ? clamp100((m.rating / 5) * 100) : 90,
    cancellations: clamp100((1 - m.cancellationRate * 4) * 100),
    returns: clamp100((1 - m.returnRate * 3) * 100),
  };
  const score = (Object.keys(SCORE_WEIGHTS) as Array<keyof typeof SCORE_WEIGHTS>).reduce((s, k) => s + parts[k] * SCORE_WEIGHTS[k], 0);
  return { score: Math.round(score * 10) / 10, parts };
}

// ── Tiers & academy ──────────────────────────────────────────────────────

export const PRO_REQUIREMENTS = { minScore: 85, minDays: 30, minOrders: 20, minKyc: 2 } as const;
/** Pro sellers fall back to Basic when the score stays below this. */
export const PRO_KEEP_SCORE = 80;

export function proEligibility(s: { score: number; approvedAt: Date | null; orders90d: number; kycLevel: number; certified: boolean; restricted: boolean }, now: Date) {
  const days = s.approvedAt ? Math.floor((now.getTime() - s.approvedAt.getTime()) / 86_400_000) : 0;
  const checks = {
    score: s.score >= PRO_REQUIREMENTS.minScore,
    tenure: days >= PRO_REQUIREMENTS.minDays,
    orders: s.orders90d >= PRO_REQUIREMENTS.minOrders,
    kyc: s.kycLevel >= PRO_REQUIREMENTS.minKyc,
    certified: s.certified,
    standing: !s.restricted,
  };
  return { eligible: Object.values(checks).every(Boolean), checks, days };
}

export const QUIZ_PASS_SCORE = 80;

/** Grades a multiple-choice quiz; unanswered questions count as wrong. */
export function gradeQuiz(correct: number[], answers: Array<number | null | undefined>) {
  const right = correct.filter((c, i) => answers[i] === c).length;
  const score = correct.length ? Math.round((right / correct.length) * 100) : 0;
  return { right, total: correct.length, score, passed: score >= QUIZ_PASS_SCORE };
}

// ── Competitor prices ────────────────────────────────────────────────────

/** Where our price sits among competing offers of the same item. */
export function pricePosition(own: number, others: number[]) {
  if (!others.length) return { status: "alone" as const, min: null, median: null, diff: null, rank: 1, count: 1 };
  const sorted = [...others].sort((a, b) => a - b);
  const min = sorted[0];
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  const rank = sorted.filter((p) => p < own).length + 1;
  const diff = (own - min) / min;
  const status = own <= min ? ("cheapest" as const) : diff <= 0.05 ? ("competitive" as const) : ("expensive" as const);
  return { status, min, median, diff, rank, count: sorted.length + 1 };
}

// ── Seller API ───────────────────────────────────────────────────────────

export const API_SCOPES = ["products:read", "products:write", "orders:read", "orders:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const API_KEY_RE = /^anr_live_[A-Za-z0-9]{40}$/;

export function bearerToken(header: string | null | undefined): string | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  return m && API_KEY_RE.test(m[1]) ? m[1] : null;
}

/** True for loopback, private, link-local, CGNAT, multicast and reserved ranges (IPv4 + IPv6). */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

/** Webhook targets must be public HTTPS URLs without credentials (DNS is re-checked at delivery). */
export function validateWebhookUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^[\d.]+$/.test(host) || host.includes(":")) return !isPrivateIp(host);
  return host.includes(".");
}

// ── CSV ──────────────────────────────────────────────────────────────────

/** RFC 4180-ish CSV parser (quoted fields, escaped quotes, CRLF), auto-detects ";" or ",". */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export const IMPORT_COLUMNS = ["sku", "title_uz", "title_ru", "category", "price", "old_price", "stock", "description_uz", "description_ru", "brand", "weight_g", "barcode", "cost_price"] as const;
export type ImportRow = { line: number; sku: string; titleUz: string; titleRu: string; category: string; price: number; oldPrice: number | null; stock: number; descriptionUz: string; descriptionRu: string; brand: string | null; weightGrams: number; barcode: string | null; costPrice: number | null };
export type ImportIssue = { line: number; field: string; code: "required" | "number" | "range" | "unknownCategory" | "duplicateSku" | "oldPrice" | "header" };

const num = (v: string | undefined) => {
  const s = (v ?? "").replace(/[\s ]/g, "").replace(",", ".");
  return s === "" ? null : Number(s);
};

/** Validate an import sheet; `categories` maps known slugs. Returns parsed rows and per-cell issues. */
export function validateImport(rows: string[][], categories: Set<string>): { rows: ImportRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const idx = (c: string) => header.indexOf(c);
  for (const c of ["sku", "title_uz", "title_ru", "category", "price", "stock"]) if (idx(c) < 0) issues.push({ line: 1, field: c, code: "header" });
  if (issues.length) return { rows: [], issues };
  const out: ImportRow[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((r, k) => {
    const line = k + 2;
    const get = (c: string) => (idx(c) >= 0 ? (r[idx(c)] ?? "").trim() : "");
    const sku = get("sku");
    const price = num(get("price"));
    const oldPrice = num(get("old_price"));
    const stock = num(get("stock"));
    const weight = num(get("weight_g"));
    const cost = num(get("cost_price"));
    const before = issues.length;
    if (!sku) issues.push({ line, field: "sku", code: "required" });
    else if (seen.has(sku)) issues.push({ line, field: "sku", code: "duplicateSku" });
    if (!get("title_uz")) issues.push({ line, field: "title_uz", code: "required" });
    if (!get("title_ru")) issues.push({ line, field: "title_ru", code: "required" });
    if (!categories.has(get("category"))) issues.push({ line, field: "category", code: "unknownCategory" });
    if (price === null || !Number.isInteger(price)) issues.push({ line, field: "price", code: "number" });
    else if (price < 1000 || price > 1_000_000_000) issues.push({ line, field: "price", code: "range" });
    if (stock === null || !Number.isInteger(stock) || stock < 0) issues.push({ line, field: "stock", code: "number" });
    if (oldPrice !== null && (!Number.isInteger(oldPrice) || (price !== null && oldPrice <= price))) issues.push({ line, field: "old_price", code: "oldPrice" });
    if (weight !== null && (!Number.isInteger(weight) || weight <= 0)) issues.push({ line, field: "weight_g", code: "number" });
    if (cost !== null && (!Number.isInteger(cost) || cost < 0)) issues.push({ line, field: "cost_price", code: "number" });
    seen.add(sku);
    if (issues.length === before)
      out.push({ line, sku, titleUz: get("title_uz"), titleRu: get("title_ru"), category: get("category"), price: price!, oldPrice, stock: stock!, descriptionUz: get("description_uz"), descriptionRu: get("description_ru"), brand: get("brand") || null, weightGrams: weight ?? 500, barcode: get("barcode") || null, costPrice: cost });
  });
  return { rows: out, issues };
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Leading = + - @ would be evaluated as formulas by spreadsheet apps.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

// ── Rule-based product pre-moderation ────────────────────────────────────

const PROHIBITED = /(qurol|оружи|narkot|наркот|spays|спайс|replika|реплика|копия|kopiya|1:1|контрафакт|поддел|qalbaki|soxta brend|vape|вейп|alkogol|алкогол|tamaki|табак)/i;

/** Listings that mention restricted goods or counterfeits go to manual moderation. */
export function productNeedsReview(text: string): boolean {
  return PROHIBITED.test(text);
}
