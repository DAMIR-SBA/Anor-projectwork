import "server-only";
import { cookies } from "next/headers";
import { db, type Tx } from "@/server/db";
import { env } from "@/server/env";
import { AppError, normalizePhone } from "@/server/action";
import { decrypt, encrypt, hashSecret, hmac, normalizeCode, randomCode, randomDigits, safeEqual, verifySecret } from "@/server/security/crypto";
import { rateLimit, LIMITS } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/security/request";
import { sendSms } from "@/server/notify/sms";
import { createSession, revokeAllSessions, upsertDevice } from "./session";
import type { OtpPurpose } from "@/generated/prisma/enums";

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_COOKIE = "anor_rc";

/** Logins that could be used to impersonate the platform. */
const RESERVED = /^(admin|administrator|root|system|support|anor|staff|moderator|security|help|official|null|undefined)(_|\d|$)/i;

export function isReservedLogin(login: string) {
  return RESERVED.test(login);
}

function referralCode() {
  return randomCode(2, 4).replace("-", "");
}

/** Create a user with its wallet and wishlist. Shared by password, Google and Telegram sign-up. */
export async function createUserRecord(
  tx: Tx,
  data: { login: string; passwordHash?: string | null; name?: string | null; phone?: string | null; email?: string | null; googleId?: string; telegramId?: string; telegramUsername?: string; avatarUrl?: string | null; locale?: string; referredById?: string | null; emailVerified?: boolean },
) {
  const user = await tx.user.create({
    data: {
      login: data.login,
      passwordHash: data.passwordHash ?? null,
      name: data.name ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      emailVerifiedAt: data.emailVerified ? new Date() : null,
      googleId: data.googleId,
      telegramId: data.telegramId,
      telegramUsername: data.telegramUsername,
      avatarUrl: data.avatarUrl ?? null,
      locale: data.locale ?? "uz",
      referralCode: referralCode(),
      referredById: data.referredById ?? null,
      consentAt: new Date(),
      consentVersion: "2026-01",
    },
  });
  await tx.wallet.create({ data: { userId: user.id } });
  await tx.wishlist.create({ data: { userId: user.id, shareToken: randomCode(3, 4).replace(/-/g, "").toLowerCase() } });
  return user;
}

/** Generate a fresh login from a hint (email local part, Telegram username...). */
export async function availableLogin(hint: string): Promise<string> {
  const base = (hint.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 14) || "anor").padEnd(4, "0");
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 && !isReservedLogin(base) ? base : `${base.slice(0, 14)}_${randomDigits(4)}`;
    if (!(await db.user.findUnique({ where: { login: candidate }, select: { id: true } }))) return candidate;
  }
  return `anor_${randomDigits(8)}`;
}

export async function generateRecoveryCodes(userId: string, tx?: Tx): Promise<string[]> {
  const client = tx ?? db;
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => randomCode(2, 4));
  await client.recoveryCode.deleteMany({ where: { userId } });
  await client.recoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hmac(normalizeCode(c), "recovery") })) });
  return codes;
}

/** Recovery codes are shown exactly once: carried to the next page in a short-lived encrypted cookie. */
export async function stashRecoveryCodes(codes: string[]) {
  (await cookies()).set(RECOVERY_COOKIE, encrypt(JSON.stringify(codes)), { httpOnly: true, sameSite: "lax", secure: env().NODE_ENV === "production", path: "/", maxAge: 600 });
}

export async function readStashedRecoveryCodes(): Promise<string[] | null> {
  const raw = (await cookies()).get(RECOVERY_COOKIE)?.value;
  if (!raw) return null;
  const plain = decrypt(raw);
  return plain ? (JSON.parse(plain) as string[]) : null;
}

export async function clearStashedRecoveryCodes() {
  (await cookies()).delete(RECOVERY_COOKIE);
}

export async function registerUser(input: { login: string; password: string; name: string; phone?: string | null; referral?: string | null; locale: string; marketing: boolean }) {
  if (isReservedLogin(input.login)) throw new AppError("loginTaken", undefined, "login");
  const exists = await db.user.findUnique({ where: { login: input.login }, select: { id: true } });
  if (exists) throw new AppError("loginTaken", undefined, "login");
  if (input.phone) {
    const phoneUser = await db.user.findUnique({ where: { phone: input.phone }, select: { id: true } });
    if (phoneUser) throw new AppError("phoneTaken", undefined, "phone");
  }
  const referrer = input.referral ? await db.user.findUnique({ where: { referralCode: input.referral.toUpperCase() }, select: { id: true } }) : null;
  const passwordHash = await hashSecret(input.password);
  const meta = await requestMeta();

  return db.$transaction(async (tx) => {
    const user = await createUserRecord(tx, { login: input.login, passwordHash, name: input.name, phone: input.phone ?? null, locale: input.locale, referredById: referrer?.id });
    await tx.user.update({ where: { id: user.id }, data: { marketingConsent: input.marketing } });
    await tx.consentRecord.createMany({
      data: [
        { userId: user.id, type: "TERMS", granted: true, version: "2026-01", ip: meta.ip },
        { userId: user.id, type: "PRIVACY", granted: true, version: "2026-01", ip: meta.ip },
        { userId: user.id, type: "MARKETING", granted: input.marketing, version: "2026-01", ip: meta.ip },
      ],
    });
    const codes = await generateRecoveryCodes(user.id, tx);
    return { user, codes };
  });
}

/**
 * Verify login/phone + password with lockout. Always returns the same generic error
 * so attackers cannot distinguish unknown accounts, wrong passwords or locked accounts.
 */
export async function authenticate(identifier: string, password: string) {
  const meta = await requestMeta();
  const ipLimit = await rateLimit(`login-ip:${meta.ip}`, LIMITS.loginIp.limit, LIMITS.loginIp.window);
  const idKey = identifier.toLowerCase();
  const accLimit = await rateLimit(`login-acc:${idKey}`, LIMITS.loginAccount.limit, LIMITS.loginAccount.window);
  if (!ipLimit.success || !accLimit.success) throw new AppError("rateLimited");

  const phone = normalizePhone(identifier);
  const user = await db.user.findFirst({
    where: phone && /^[+\d\s()-]+$/.test(identifier) ? { phone } : { login: idKey },
  });

  const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
  const passwordOk = await verifySecret(user?.passwordHash, password);
  const ok = !!user && passwordOk && !locked && user.status === "ACTIVE";

  await db.loginAttempt.create({
    data: { userId: user?.id, identifier: idKey.slice(0, 64), ip: meta.ip, userAgent: meta.userAgent, success: ok, reason: ok ? null : !user ? "unknown" : locked ? "locked" : !passwordOk ? "password" : "status" },
  });

  if (!ok) {
    if (user && !locked && !passwordOk) {
      const failed = user.failedLoginCount + 1;
      await db.user.update({
        where: { id: user.id },
        data: failed >= MAX_FAILED_LOGINS ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) } : { failedLoginCount: failed },
      });
    }
    throw new AppError("invalidCredentials");
  }

  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  }
  return user;
}

/** Start a buyer session. PIN users on an untrusted device must pass /auth/pin first. */
export async function beginUserSession(user: { id: string; pinHash: string | null }) {
  const device = await upsertDevice(user.id);
  const pinVerified = !user.pinHash || device.trusted;
  await createSession({ userId: user.id, kind: "USER", pinVerified, deviceId: device.id });
  return { needsPin: !pinVerified };
}

export async function verifyPinForSession(userId: string, deviceId: string | null, pin: string) {
  const rl = await rateLimit(`pin:${userId}`, 5, 900);
  if (!rl.success) throw new AppError("rateLimited");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const ok = await verifySecret(user.pinHash, pin);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: userId },
      data: failed >= MAX_FAILED_LOGINS ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) } : { failedLoginCount: failed },
    });
    if (failed >= MAX_FAILED_LOGINS) await revokeAllSessions(userId, { kind: "USER" });
    throw new AppError("invalidPin", undefined, "pin");
  }
  if (deviceId) await db.device.update({ where: { id: deviceId }, data: { trusted: true } });
  await db.user.update({ where: { id: userId }, data: { failedLoginCount: 0 } });
}

// ── OTP ──────────────────────────────────────────────────────────────────

export async function sendOtp(phone: string, purpose: OtpPurpose, locale = "uz"): Promise<{ demoCode?: string }> {
  const meta = await requestMeta();
  const byPhone = await rateLimit(`otp:${phone}`, LIMITS.otpSend.limit, LIMITS.otpSend.window);
  const byIp = await rateLimit(`otp-ip:${meta.ip}`, 20, 3600);
  if (!byPhone.success || !byIp.success) throw new AppError("rateLimited");
  const recent = await db.otpCode.findFirst({ where: { phone, purpose, createdAt: { gt: new Date(Date.now() - 60_000) } } });
  if (recent) throw new AppError("otpTooSoon");

  const code = randomDigits(6);
  await db.otpCode.create({ data: { phone, purpose, codeHash: hmac(`${phone}:${code}`, "otp"), expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000) } });
  const text =
    locale === "ru"
      ? `ANOR: код подтверждения ${code}. Никому не сообщайте его.`
      : `ANOR: tasdiqlash kodi ${code}. Uni hech kimga bermang.`;
  await sendSms(phone, text);
  // In demo mode with the console driver the code is surfaced in the UI so the flow can be tried end to end.
  const e = env();
  return e.DEMO_MODE && e.SMS_DRIVER === "console" ? { demoCode: code } : {};
}

export async function checkOtp(phone: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  const otp = await db.otpCode.findFirst({ where: { phone, purpose, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!otp || otp.expiresAt < new Date() || otp.attempts >= OTP_MAX_ATTEMPTS) return false;
  const ok = safeEqual(otp.codeHash, hmac(`${phone}:${code.trim()}`, "otp"));
  await db.otpCode.update({ where: { id: otp.id }, data: ok ? { consumedAt: new Date() } : { attempts: { increment: 1 } } });
  return ok;
}

// ── Password reset ───────────────────────────────────────────────────────

async function setNewPassword(userId: string, password: string) {
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashSecret(password), failedLoginCount: 0, lockedUntil: null } });
  // Every existing session dies with the old password.
  await revokeAllSessions(userId);
}

export async function resetWithOtp(phone: string, code: string, password: string) {
  const user = await db.user.findUnique({ where: { phone } });
  const ok = await checkOtp(phone, "RESET_PASSWORD", code);
  if (!ok || !user || !user.phoneVerifiedAt) throw new AppError("invalidCode", undefined, "code");
  await setNewPassword(user.id, password);
  return user;
}

export async function resetWithRecoveryCode(login: string, code: string, password: string) {
  const meta = await requestMeta();
  const rl = await rateLimit(`recovery:${meta.ip}`, 10, 3600);
  if (!rl.success) throw new AppError("rateLimited");
  const user = await db.user.findUnique({ where: { login }, include: { recoveryCodes: { where: { usedAt: null } } } });
  const wanted = hmac(normalizeCode(code), "recovery");
  const match = user?.recoveryCodes.find((rc) => safeEqual(rc.codeHash, wanted));
  if (!user || !match) throw new AppError("invalidCode", undefined, "code");
  await db.recoveryCode.update({ where: { id: match.id }, data: { usedAt: new Date() } });
  await setNewPassword(user.id, password);
  return user;
}
