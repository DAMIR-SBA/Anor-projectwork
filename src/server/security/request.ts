import "server-only";
import { headers } from "next/headers";

export type RequestMeta = { ip: string; userAgent: string; origin: string | null; host: string | null };

export function ipFromHeaders(h: Headers): string {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || h.get("cf-connecting-ip") || "0.0.0.0";
}

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  return {
    ip: ipFromHeaders(h),
    userAgent: (h.get("user-agent") || "").slice(0, 400),
    origin: h.get("origin"),
    host: h.get("x-forwarded-host") || h.get("host"),
  };
}

/**
 * CSRF defense for mutations: the Origin (or Sec-Fetch-Site) must match our host.
 * Next.js already checks Server Action origins but lets requests without Origin through;
 * we are stricter and also apply this to route handlers.
 */
export function isSameOrigin(h: Headers): boolean {
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") || h.get("host");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = h.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  // Non-browser clients (curl, native app) do not send either; they must use bearer tokens.
  return false;
}

/** Short human-readable device label from a user agent. */
export function deviceName(ua: string): string {
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  const browser = /Telegram/.test(ua)
    ? "Telegram"
    : /Edg\//.test(ua)
      ? "Edge"
      : /OPR\//.test(ua)
        ? "Opera"
        : /YaBrowser/.test(ua)
          ? "Yandex Browser"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Firefox\//.test(ua)
              ? "Firefox"
              : /Safari\//.test(ua)
                ? "Safari"
                : "Browser";
  return `${browser} · ${os}`;
}
