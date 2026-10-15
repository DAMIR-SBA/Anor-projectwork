// Rule-based content moderation for reviews, questions and chat (pure; AI is an optional extra layer).

export type Flag = "PROFANITY" | "LINK" | "PHONE" | "CONTACT" | "SPAM" | "DUPLICATE" | "NEW_ACCOUNT_5STAR" | "BURST_5STAR" | "AI_FLAGGED";

// Small curated stems (uz Latin/Cyrillic + ru). Matched on word starts to limit false positives.
const PROFANITY_STEMS = [
  "блять", "бля", "сука", "хуй", "хуё", "пизд", "ебат", "ёбан", "ебан", "мудак", "долбо", "гандон", "шлюх",
  "jalab", "qanjiq", "harom", "sharmanda", "ahmoq", "iflos", "dalbayob", "suka", "blyat",
  "жалаб", "қанжиқ", "аҳмоқ", "ифлос",
];

// Whole URL including its path, so masking leaves nothing usable behind.
const LINK = /(https?:\/\/\S+|www\.\S+|t\.me\/\S+|\b[a-z0-9-]+\.(uz|ru|com|net|org|io|me|shop|store)\b(\/\S*)?)/i;
const PHONE = /(\+?998[\s-]?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})|(\b\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b)/;
const HANDLE = /(^|\s)@[a-z0-9_]{5,32}\b/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ʻʼ‘’`]/g, "'")
    .replace(/[0@]/g, (c) => (c === "0" ? "o" : "a"))
    .replace(/\s+/g, " ");
}

export function hasProfanity(text: string): boolean {
  const words = normalizeForMatch(text).split(/[^\p{L}']+/u).filter(Boolean);
  return words.some((w) => PROFANITY_STEMS.some((stem) => w.startsWith(stem)));
}

export function hasContacts(text: string): { link: boolean; phone: boolean; contact: boolean } {
  return { link: LINK.test(text), phone: PHONE.test(text), contact: HANDLE.test(text) || EMAIL.test(text) };
}

/** Spam heuristics: long char repeats, shouting, emoji/punctuation floods, promo keywords. */
export function looksLikeSpam(text: string): boolean {
  const t = text.trim();
  if (/(.)\1{6,}/u.test(t)) return true;
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length > 20 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) return true;
  if ((t.match(/[!?]{4,}/g) ?? []).length > 0) return true;
  if (/(skidka|chegirma kodi|promokod|заработ|earn money|casino|kazino|ставк)/i.test(t)) return true;
  return false;
}

/** Replace phones, links, handles and emails with a neutral placeholder. */
export function maskContacts(text: string, mask = "•••"): string {
  return text
    .replace(new RegExp(LINK.source, "gi"), mask)
    .replace(new RegExp(PHONE.source, "g"), mask)
    .replace(new RegExp(EMAIL.source, "gi"), mask)
    .replace(new RegExp(HANDLE.source, "gi"), (m, lead: string) => `${lead}${mask}`);
}

export type ReviewSignals = {
  text: string;
  rating: number;
  accountAgeDays: number;
  duplicateOfOwn: boolean;
  duplicateAcrossUsers: boolean;
  recentNewAccount5StarsOnProduct: number;
};

/** Flags + a weighted score; anything flagged goes to the moderation queue instead of auto-publishing. */
export function evaluateReview(s: ReviewSignals): { flags: Flag[]; score: number } {
  const flags: Flag[] = [];
  if (hasProfanity(s.text)) flags.push("PROFANITY");
  const c = hasContacts(s.text);
  if (c.link) flags.push("LINK");
  if (c.phone) flags.push("PHONE");
  if (c.contact) flags.push("CONTACT");
  if (looksLikeSpam(s.text)) flags.push("SPAM");
  if (s.duplicateOfOwn || s.duplicateAcrossUsers) flags.push("DUPLICATE");
  if (s.rating === 5 && s.accountAgeDays < 7) flags.push("NEW_ACCOUNT_5STAR");
  if (s.rating === 5 && s.recentNewAccount5StarsOnProduct >= 3) flags.push("BURST_5STAR");
  const weights: Record<Flag, number> = { PROFANITY: 40, LINK: 30, PHONE: 30, CONTACT: 25, SPAM: 35, DUPLICATE: 30, NEW_ACCOUNT_5STAR: 15, BURST_5STAR: 40, AI_FLAGGED: 30 };
  return { flags, score: Math.min(100, flags.reduce((sum, f) => sum + weights[f], 0)) };
}

// ── "What buyers say" (rule-based summary) ─────────────────────────────

const STOP = new Set(
  ("va bilan uchun lekin juda ham bu shu bir biroz yaxshi zo'r emas edi ekan menga mahsulot narx narxi sotuvchi keldi bo'ldi ochiq yana ancha " +
    "yoqdi oldim rahmat tavsiya qilaman qilyapman xursand bo'lishdi haftadan kundan kunimning ertasiga buyurtma ishlatyapman hammasi umuman kerak " +
    "и в на не что это очень но с по для как все всё товар он она было есть мне так за у же из к то спасибо отлично пользуюсь заказал a the").split(" "),
);

type Row = { pros?: string | null; cons?: string | null; comment?: string | null; rating: number; lang?: string | null };

/** Word 1–2-grams for "often mentioned" topics. */
function grams(texts: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of texts) {
    const words = normalizeForMatch(t).split(/[^\p{L}']+/u).filter((w) => w.length > 2 && !STOP.has(w));
    const seen = new Set<string>();
    for (let i = 0; i < words.length; i++) {
      for (const n of [1, 2]) {
        const gram = words.slice(i, i + n).join(" ");
        if (gram.split(" ").length !== n || seen.has(gram)) continue;
        seen.add(gram);
        counts.set(gram, (counts.get(gram) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** Whole clauses from pros/cons fields ("Batareya uzoq ushlaydi, Ekrani tiniq" → two clauses). */
function clauses(texts: string[]): Map<string, { n: number; display: string }> {
  const out = new Map<string, { n: number; display: string }>();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const raw of t.split(/[,.;!?\n]+/)) {
      const display = raw.trim();
      if (display.length < 3 || display.length > 60) continue;
      const key = normalizeForMatch(display);
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = out.get(key);
      out.set(key, { n: (cur?.n ?? 0) + 1, display: cur?.display ?? display[0].toUpperCase() + display.slice(1) });
    }
  }
  return out;
}

/** Keep the best-ranked entries and drop ones that overlap an already chosen phrase. */
function distinct<T>(ranked: T[], key: (x: T) => string, k: number): T[] {
  const chosen: T[] = [];
  for (const x of ranked) {
    const kx = key(x);
    if (chosen.some((c) => key(c).includes(kx) || kx.includes(key(c)))) continue;
    chosen.push(x);
    if (chosen.length === k) break;
  }
  return chosen;
}

/** normalizeForMatch folds Uzbek apostrophes to ASCII; restore o‘/g‘ and the tutuq belgisi for display. */
const prettyApostrophes = (t: string) => t.replace(/([og])'/gi, "$1‘").replace(/'/g, "’");

export type SummaryPart = { pros: string[]; cons: string[]; mentions: Array<{ term: string; count: number }> };
export type ReviewSummary = SummaryPart & { source: "rules" | "ai"; basedOn: number; ru?: SummaryPart };

function part(rows: Row[]): SummaryPart {
  const top = (field: "pros" | "cons", k: number) => {
    const m = clauses(rows.map((r) => r[field] ?? "").filter(Boolean));
    const ranked = [...m.entries()].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n || a[0].length - b[0].length);
    return distinct(ranked, ([key]) => key, k).map(([, v]) => v.display);
  };
  const ranked = [...grams(rows.map((r) => `${r.pros ?? ""} ${r.cons ?? ""} ${r.comment ?? ""}`)).entries()].filter(([t, n]) => n >= 3 && t.includes(" ")).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  // Two-word topics that don't share words, so "tez ishlaydi" and "ishlaydi qotmaydi" don't both appear.
  const mentions: Array<{ term: string; count: number }> = [];
  for (const [term, count] of ranked) {
    const words = term.split(" ");
    if (mentions.some((m) => m.term.split(" ").some((w) => words.includes(w)))) continue;
    mentions.push({ term, count });
    if (mentions.length === 6) break;
  }
  return { pros: top("pros", 4), cons: top("cons", 3), mentions: mentions.map((m) => ({ ...m, term: prettyApostrophes(m.term) })) };
}

/** Rule-based "What buyers say": recurring pros/cons clauses + frequent topics, per review language. */
export function summarizeReviews(reviews: Row[]): ReviewSummary {
  const ru = reviews.filter((r) => r.lang === "ru");
  const uz = reviews.filter((r) => r.lang !== "ru");
  const main = part(uz.length >= 3 ? uz : reviews);
  const ruPart = ru.length >= 3 ? part(ru) : null;
  // Russian readers fall back to the main summary unless Russian reviews say enough on their own.
  return { ...main, ...(ruPart && ruPart.pros.length + ruPart.cons.length >= 2 ? { ru: ruPart } : {}), source: "rules", basedOn: reviews.length };
}

export const REVIEW_EDIT_DAYS = 14;
export const PHOTO_REVIEW_BONUS = 5_000;
export const VIDEO_REVIEW_BONUS = 10_000;
export const REVIEW_BONUS_MONTHLY_CAP = 10;

export const REPORT_REASONS = ["spam", "offensive", "fake", "personal", "irrelevant", "other"] as const;
export const REMOVAL_REASONS = ["fake", "offensive", "wrongProduct", "personal", "extortion", "other"] as const;
