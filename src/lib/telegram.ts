// Telegram Mini App and bot helpers (server-side; uses node:crypto).
import { createHmac, timingSafeEqual } from "node:crypto";

export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string; photo_url?: string };

/**
 * Validate Mini App `initData` as Telegram specifies: HMAC-SHA256 of the sorted "key=value" lines
 * with a key derived from the bot token ("WebAppData"), plus a freshness window on auth_date.
 */
export function verifyWebAppInitData(initData: string, botToken: string, now = Date.now(), maxAgeSec = 86_400): { ok: true; user: TgUser; startParam: string | null } | { ok: false; reason: string } {
  if (!initData || !botToken) return { ok: false, reason: "missing" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return { ok: false, reason: "hash" };
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheck).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  const authDate = Number(params.get("auth_date"));
  if (!authDate || now / 1000 - authDate > maxAgeSec) return { ok: false, reason: "expired" };
  try {
    const user = JSON.parse(params.get("user") ?? "null") as TgUser | null;
    if (!user?.id) return { ok: false, reason: "user" };
    return { ok: true, user, startParam: params.get("start_param") };
  } catch {
    return { ok: false, reason: "user" };
  }
}

/** Build signed initData (used by tests and the local bot simulator). */
export function signWebAppInitData(fields: Record<string, string>, botToken: string): string {
  const dataCheck = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

/** "/start abc", "/orders@anor_bot" → { command: "start", arg: "abc" }; plain text → null. */
export function parseCommand(text: string | undefined | null): { command: string; arg: string } | null {
  const m = /^\/([a-z_]+)(?:@\w+)?(?:\s+(.+))?$/i.exec((text ?? "").trim());
  return m ? { command: m[1].toLowerCase(), arg: (m[2] ?? "").trim() } : null;
}

/** Bot language from the Telegram client: Russian or Uzbek (default). */
export const botLocale = (code?: string | null) => (code?.startsWith("ru") ? "ru" : "uz");
