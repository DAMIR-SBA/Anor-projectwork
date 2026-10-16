/** Platform-wide settings editable in /admin/settings (stored in Setting "platform"). */
import { latinToCyrillic } from "./translit";

export type AnnouncementTone = "info" | "promo" | "warning";

export type PlatformSettings = {
  announcement: { enabled: boolean; textUz: string; textRu: string; href: string | null; tone: AnnouncementTone; startsAt: string | null; endsAt: string | null };
  /** Pauses checkout (new orders) with a message; browsing and existing orders keep working. */
  ordersPaused: { enabled: boolean; messageUz: string; messageRu: string };
  sellerSignupOpen: boolean;
  support: { phone: string; email: string; telegram: string };
};

export const DEFAULT_PLATFORM: PlatformSettings = {
  announcement: { enabled: false, textUz: "", textRu: "", href: null, tone: "info", startsAt: null, endsAt: null },
  ordersPaused: { enabled: false, messageUz: "", messageRu: "" },
  sellerSignupOpen: true,
  support: { phone: "", email: "", telegram: "" },
};

export function mergePlatform(raw: unknown): PlatformSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PlatformSettings>;
  return {
    announcement: { ...DEFAULT_PLATFORM.announcement, ...(r.announcement ?? {}) },
    ordersPaused: { ...DEFAULT_PLATFORM.ordersPaused, ...(r.ordersPaused ?? {}) },
    sellerSignupOpen: r.sellerSignupOpen ?? DEFAULT_PLATFORM.sellerSignupOpen,
    support: { ...DEFAULT_PLATFORM.support, ...(r.support ?? {}) },
  };
}

/** Russian for ru; Uzbek (transliterated for uz-Cyrl) otherwise, falling back to the other language. */
export function pickText(uz: string, ru: string, locale: string) {
  if (locale === "ru") return ru || uz;
  if (!uz) return ru;
  return locale === "uz-Cyrl" ? latinToCyrillic(uz) : uz;
}

/** The announcement to show right now, or null. */
export function activeAnnouncement(s: PlatformSettings, now = new Date()) {
  const a = s.announcement;
  if (!a.enabled || !(a.textUz || a.textRu)) return null;
  if (a.startsAt && new Date(a.startsAt) > now) return null;
  if (a.endsAt && new Date(a.endsAt) <= now) return null;
  return a;
}

/** Telegram handle or link → https://t.me/... (null when unset or malformed). */
export function telegramUrl(v: string): string | null {
  const handle = v.trim().replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "");
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(handle) ? `https://t.me/${handle}` : null;
}
