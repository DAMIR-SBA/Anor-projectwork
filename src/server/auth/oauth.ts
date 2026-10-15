import "server-only";
import { cookies } from "next/headers";
import { createHash, createHmac } from "node:crypto";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { getPathname } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { randomToken, safeEqual, sign, unsign } from "@/server/security/crypto";
import { createUserRecord, availableLogin, beginUserSession } from "./user-auth";
import { afterLogin } from "@/server/services/session-hooks";
import { safeNext } from "./guards";

export async function cookieLocale(): Promise<AppLocale> {
  const v = (await cookies()).get("anor_locale")?.value;
  return (routing.locales as readonly string[]).includes(v ?? "") ? (v as AppLocale) : routing.defaultLocale;
}

export async function localizedUrl(path: string): Promise<URL> {
  const locale = await cookieLocale();
  const [pathname, query] = path.split("?");
  const localized = getPathname({ href: pathname, locale });
  return new URL(`${localized}${query ? `?${query}` : ""}`, env().APP_URL);
}

// ── Google (OAuth 2.0 authorization code + PKCE) ─────────────────────────

const STATE_COOKIE = "anor_oauth";

export async function googleAuthorizeUrl(next: string): Promise<string> {
  const e = env();
  const state = randomToken(16);
  const verifier = randomToken(32);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  (await cookies()).set(STATE_COOKIE, sign(JSON.stringify({ state, verifier, next: safeNext(next) }), 600), { httpOnly: true, sameSite: "lax", secure: e.NODE_ENV === "production", path: "/", maxAge: 600 });
  const params = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: `${e.APP_URL}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

type GoogleProfile = { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };

export async function googleCallback(code: string, state: string): Promise<{ next: string; needsPin: boolean } | null> {
  const e = env();
  const jar = await cookies();
  const raw = unsign(jar.get(STATE_COOKIE)?.value);
  jar.delete(STATE_COOKIE);
  if (!raw) return null;
  const saved = JSON.parse(raw) as { state: string; verifier: string; next: string };
  if (!safeEqual(saved.state, state)) return null;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: e.GOOGLE_CLIENT_ID ?? "",
      client_secret: e.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${e.APP_URL}/api/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  });
  if (!tokenRes.ok) return null;
  const tokens = (await tokenRes.json()) as { access_token?: string };
  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!profileRes.ok) return null;
  const profile = (await profileRes.json()) as GoogleProfile;
  const r = await signInWithGoogle(profile);
  return { next: saved.next, needsPin: r.needsPin };
}

export async function signInWithGoogle(profile: GoogleProfile) {
  let user = await db.user.findUnique({ where: { googleId: profile.sub } });
  if (!user && profile.email && profile.email_verified) {
    // Link to an existing account with the same verified email.
    user = await db.user.findUnique({ where: { email: profile.email.toLowerCase() } });
    if (user) user = await db.user.update({ where: { id: user.id }, data: { googleId: profile.sub } });
  }
  if (!user) {
    const login = await availableLogin(profile.email?.split("@")[0] ?? profile.name ?? "google");
    user = await db.$transaction((tx) =>
      createUserRecord(tx, { login, name: profile.name, email: profile.email?.toLowerCase() ?? null, emailVerified: !!profile.email_verified, googleId: profile.sub, avatarUrl: profile.picture }),
    );
  }
  if (user.status !== "ACTIVE") throw new Error("inactive");
  const r = await beginUserSession(user);
  if (!r.needsPin) await afterLogin(user.id);
  return r;
}

// ── Telegram Login Widget ────────────────────────────────────────────────

/** Verify the widget payload: HMAC-SHA256(data_check_string, SHA256(bot_token)). */
export function verifyTelegramLogin(data: Record<string, string>): boolean {
  const token = env().TELEGRAM_BOT_TOKEN;
  if (!token || !data.hash) return false;
  const { hash, ...rest } = data;
  const checkString = Object.keys(rest)
    .filter((k) => k !== "next")
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  const expected = createHmac("sha256", secret).update(checkString).digest("hex");
  const fresh = Date.now() / 1000 - Number(rest.auth_date ?? 0) < 86_400;
  return fresh && safeEqual(expected, hash);
}

export async function signInWithTelegram(tg: { id: string; username?: string; first_name?: string; last_name?: string; photo_url?: string }) {
  let user = await db.user.findUnique({ where: { telegramId: tg.id } });
  if (!user) {
    const login = await availableLogin(tg.username ?? `tg${tg.id}`);
    const name = [tg.first_name, tg.last_name].filter(Boolean).join(" ") || tg.username || null;
    user = await db.$transaction((tx) => createUserRecord(tx, { login, name, telegramId: tg.id, telegramUsername: tg.username, avatarUrl: tg.photo_url }));
  }
  if (user.status !== "ACTIVE") throw new Error("inactive");
  const r = await beginUserSession(user);
  if (!r.needsPin) await afterLogin(user.id);
  return r;
}
