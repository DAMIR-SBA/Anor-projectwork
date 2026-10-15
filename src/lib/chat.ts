// Pure chat helpers shared by server and client: privacy filter, SLA, grouping, presence.
import { hasContacts, hasProfanity, looksLikeSpam, maskContacts, normalizeForMatch } from "./review-moderation";

export const SUPPORT_FIRST_REPLY_MINUTES = 15;
export const EDIT_WINDOW_HOURS = 48;
export const ONLINE_WINDOW_MS = 75_000;
export const MAX_MESSAGE_LENGTH = 4000;

export type ConversationKind = "SUPPORT" | "BUYER_SELLER" | "SELLER_SUPPORT" | "STAFF_CHANNEL";

const PROFANITY_MASK = /\S+/g;

/**
 * Privacy + safety filter applied to every outgoing message.
 * Buyer↔seller chats mask phones, links, @handles and emails (keeps deals on the platform);
 * support chats keep contacts so customers can share e.g. a courier's number.
 */
export function filterMessage(text: string, kind: ConversationKind, recentOwn: string[] = []): { text: string; masked: boolean; flagged: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let out = text.trim().slice(0, MAX_MESSAGE_LENGTH);
  let masked = false;
  if (kind === "BUYER_SELLER") {
    const c = hasContacts(out);
    if (c.link || c.phone || c.contact) {
      out = maskContacts(out);
      masked = true;
      reasons.push("contacts");
    }
  }
  if (hasProfanity(out)) {
    // Replace only the offending words, keep the rest readable.
    out = out.replace(PROFANITY_MASK, (w) => (hasProfanity(w) ? "*".repeat(Math.min(6, w.length)) : w));
    reasons.push("profanity");
  }
  const norm = normalizeForMatch(out);
  if (looksLikeSpam(out) || recentOwn.filter((r) => normalizeForMatch(r) === norm).length >= 2) reasons.push("spam");
  return { text: out, masked, flagged: reasons.includes("profanity") || reasons.includes("spam"), reasons };
}

export type SlaState = { state: "met" | "ok" | "warning" | "breached"; minutesLeft: number };

/** First-reply SLA for support tickets (15 minutes by default). */
export function slaState(t: { slaDueAt: Date | string; firstResponseAt: Date | string | null; status: string }, now = Date.now()): SlaState {
  const due = new Date(t.slaDueAt).getTime();
  if (t.firstResponseAt) return { state: new Date(t.firstResponseAt).getTime() <= due ? "met" : "breached", minutesLeft: 0 };
  if (t.status === "RESOLVED") return { state: "met", minutesLeft: 0 };
  const left = Math.round((due - now) / 60_000);
  return { state: left < 0 ? "breached" : left <= 5 ? "warning" : "ok", minutesLeft: left };
}

export function isOnline(lastSeenAt: Date | string | null | undefined, now = Date.now()): boolean {
  return !!lastSeenAt && now - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

export function canEdit(createdAt: Date | string, now = Date.now()): boolean {
  return now - new Date(createdAt).getTime() < EDIT_WINDOW_HOURS * 3_600_000;
}

/** Delivery ticks for an own message given the other members' receipts. */
export function receiptState(createdAt: Date | string, others: Array<{ lastReadAt: Date | string | null; lastDeliveredAt: Date | string | null }>): "sent" | "delivered" | "read" {
  const t = new Date(createdAt).getTime();
  if (others.some((o) => o.lastReadAt && new Date(o.lastReadAt).getTime() >= t)) return "read";
  if (others.some((o) => o.lastDeliveredAt && new Date(o.lastDeliveredAt).getTime() >= t)) return "delivered";
  return "sent";
}

/** Tashkent calendar day key used for day separators. */
export function dayKey(d: Date | string): string {
  return new Date(new Date(d).getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}

/** Collapse a waveform (0..1 peaks) to `bars` buckets for compact rendering. */
export function downsample(peaks: number[], bars = 40): number[] {
  if (!peaks.length) return Array(bars).fill(0.08);
  const out: number[] = [];
  const step = peaks.length / bars;
  for (let i = 0; i < bars; i++) {
    const slice = peaks.slice(Math.floor(i * step), Math.max(Math.floor((i + 1) * step), Math.floor(i * step) + 1));
    out.push(Math.max(0.08, Math.min(1, Math.max(...slice))));
  }
  return out;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Expand a canned reply shortcut ("/salom") or return null. */
export function matchCanned<T extends { shortcut: string }>(input: string, canned: T[]): T[] {
  if (!input.startsWith("/")) return [];
  const q = input.slice(1).toLowerCase();
  return canned.filter((c) => c.shortcut.toLowerCase().startsWith(q)).slice(0, 6);
}

export const EMOJI = ["😀", "😂", "😊", "😍", "🤔", "😢", "😡", "👍", "👎", "🙏", "👏", "🔥", "❤️", "🎉", "✅", "❌", "📦", "🚚", "💳", "🎁", "⏰", "📍", "🍉", "🌙"];
