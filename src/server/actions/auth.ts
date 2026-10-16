"use server";

import { z } from "zod";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { action, formAction, AppError, zLogin, zPassword, zPin, zPhone, zBool, normalizePhone } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { hashSecret, verifySecret } from "@/server/security/crypto";
import { destroySession, getUserSession, getCurrentUser, revokeAllSessions, rotateSession, createSession } from "@/server/auth/session";
import { safeNext } from "@/server/auth/guards";
import {
  authenticate,
  beginUserSession,
  generateRecoveryCodes,
  registerUser,
  resetWithOtp,
  resetWithRecoveryCode,
  sendOtp,
  checkOtp,
  stashRecoveryCodes,
  clearStashedRecoveryCodes,
  verifyPinForSession,
} from "@/server/auth/user-auth";
import { afterLogin } from "@/server/services/session-hooks";

export const loginAction = formAction(
  { auth: "public", schema: z.object({ identifier: z.string().trim().min(3).max(64), password: z.string().min(1).max(128), next: z.string().optional() }) },
  async (input) => {
    const user = await authenticate(input.identifier, input.password);
    const { needsPin } = await beginUserSession(user);
    const next = safeNext(input.next, "/");
    const locale = await getLocale();
    if (needsPin) redirect({ href: `/auth/pin?next=${encodeURIComponent(next)}`, locale });
    await afterLogin(user.id);
    redirect({ href: next, locale });
  },
);

export const registerAction = formAction(
  {
    auth: "public",
    rateLimit: { key: "register", ...LIMITS.register },
    schema: z
      .object({
        login: zLogin,
        name: z.string().trim().min(2).max(60),
        password: zPassword,
        confirm: z.string(),
        phone: z.string().trim().optional().transform((v) => (v ? normalizePhone(v) ?? "invalid" : null)),
        referral: z.string().trim().max(12).optional(),
        terms: zBool.refine((v) => v, { error: "termsRequired" }),
        marketing: zBool.optional(),
        next: z.string().optional(),
      })
      .refine((v) => v.password === v.confirm, { error: "passwordMismatch", path: ["confirm"] })
      .refine((v) => v.phone !== "invalid", { error: "phoneFormat", path: ["phone"] }),
  },
  async (input) => {
    const locale = await getLocale();
    const { user, codes } = await registerUser({ login: input.login, password: input.password, name: input.name, phone: input.phone, referral: input.referral, locale, marketing: !!input.marketing });
    await beginUserSession(user);
    await afterLogin(user.id);
    await stashRecoveryCodes(codes);
    redirect({ href: `/auth/recovery-codes?next=${encodeURIComponent(safeNext(input.next, "/"))}`, locale });
  },
);

export const logoutAction = async () => {
  await destroySession("USER");
  redirect({ href: "/", locale: await getLocale() });
};

export const pinAction = formAction({ auth: "public", schema: z.object({ pin: zPin, next: z.string().optional() }) }, async (input) => {
  const s = await getUserSession();
  if (!s) throw new AppError("unauthorized");
  await verifyPinForSession(s.user.id, s.session.deviceId, input.pin);
  // Privilege change → rotate the session token.
  await rotateSession("USER", { pinVerified: true });
  await afterLogin(s.user.id);
  redirect({ href: safeNext(input.next, "/"), locale: await getLocale() });
});

export const acknowledgeRecoveryCodesAction = async (next: string) => {
  await clearStashedRecoveryCodes();
  redirect({ href: safeNext(next, "/"), locale: await getLocale() });
};

// ── OTP & phone ──────────────────────────────────────────────────────────

export const sendOtpAction = action(
  { auth: "public", schema: z.object({ phone: zPhone, purpose: z.enum(["VERIFY_PHONE", "RESET_PASSWORD"]) }) },
  async (input, ctx) => {
    const locale = await getLocale();
    if (input.purpose === "VERIFY_PHONE") {
      if (!ctx.user) throw new AppError("unauthorized");
      const taken = await db.user.findFirst({ where: { phone: input.phone, NOT: { id: ctx.user.id } }, select: { id: true } });
      if (taken) throw new AppError("phoneTaken", undefined, "phone");
      const r = await sendOtp(input.phone, "VERIFY_PHONE", locale);
      return { ok: true, data: r };
    }
    // Password reset: same response whether or not the phone exists (no enumeration).
    const user = await db.user.findUnique({ where: { phone: input.phone }, select: { phoneVerifiedAt: true } });
    if (user?.phoneVerifiedAt) {
      const r = await sendOtp(input.phone, "RESET_PASSWORD", locale);
      return { ok: true, data: r };
    }
    return { ok: true, data: {} };
  },
);

export const verifyPhoneAction = action({ schema: z.object({ phone: zPhone, code: z.string().regex(/^\d{6}$/) }) }, async (input, ctx) => {
  const ok = await checkOtp(input.phone, "VERIFY_PHONE", input.code);
  if (!ok) throw new AppError("invalidCode", undefined, "code");
  await db.user.update({ where: { id: ctx.user.id }, data: { phone: input.phone, phoneVerifiedAt: new Date() } });
  return { ok: true };
});

export const resetPasswordAction = formAction(
  {
    auth: "public",
    schema: z
      .object({
        method: z.enum(["otp", "recovery"]),
        phone: z.string().optional(),
        login: z.string().optional(),
        code: z.string().trim().min(4).max(20),
        password: zPassword,
        confirm: z.string(),
      })
      .refine((v) => v.password === v.confirm, { error: "passwordMismatch", path: ["confirm"] }),
  },
  async (input) => {
    if (input.method === "otp") {
      const phone = normalizePhone(input.phone ?? "");
      if (!phone) throw new AppError("phoneFormat", undefined, "phone");
      await resetWithOtp(phone, input.code, input.password);
    } else {
      await resetWithRecoveryCode((input.login ?? "").trim().toLowerCase(), input.code, input.password);
    }
    redirect({ href: "/auth/login?reset=1", locale: await getLocale() });
  },
);

// ── Account security ─────────────────────────────────────────────────────

export const changePasswordAction = formAction(
  { schema: z.object({ current: z.string().min(1), password: zPassword, confirm: z.string() }).refine((v) => v.password === v.confirm, { error: "passwordMismatch", path: ["confirm"] }) },
  async (input, ctx) => {
    const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (user.passwordHash && !(await verifySecret(user.passwordHash, input.current))) throw new AppError("invalidPassword", undefined, "current");
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashSecret(input.password) } });
    await revokeAllSessions(user.id, { exceptTokenOf: "USER" });
    await rotateSession("USER", {});
    return { ok: true };
  },
);

export const setPinAction = formAction(
  { schema: z.object({ password: z.string().min(1), pin: zPin, confirm: z.string() }).refine((v) => v.pin === v.confirm, { error: "pinMismatch", path: ["confirm"] }) },
  async (input, ctx) => {
    const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (user.passwordHash && !(await verifySecret(user.passwordHash, input.password))) throw new AppError("invalidPassword", undefined, "password");
    if (/^(\d)\1{5}$/.test(input.pin) || ["123456", "654321", "123123"].includes(input.pin)) throw new AppError("pinWeak", undefined, "pin");
    await db.user.update({ where: { id: user.id }, data: { pinHash: await hashSecret(input.pin) } });
    // The current device is trusted; every other device must enter the PIN next time.
    const s = await getUserSession();
    await db.device.updateMany({ where: { userId: user.id, NOT: { id: s?.session.deviceId ?? "" } }, data: { trusted: false } });
    if (s?.session.deviceId) await db.device.update({ where: { id: s.session.deviceId }, data: { trusted: true } });
    await rotateSession("USER", { pinVerified: true });
    return { ok: true };
  },
);

export const removePinAction = formAction({ schema: z.object({ password: z.string().min(1) }) }, async (input, ctx) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (user.passwordHash && !(await verifySecret(user.passwordHash, input.password))) throw new AppError("invalidPassword", undefined, "password");
  await db.user.update({ where: { id: user.id }, data: { pinHash: null } });
  return { ok: true };
});

export const regenerateRecoveryCodesAction = formAction({ schema: z.object({ password: z.string().min(1) }) }, async (input, ctx) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  if (user.passwordHash && !(await verifySecret(user.passwordHash, input.password))) throw new AppError("invalidPassword", undefined, "password");
  const codes = await generateRecoveryCodes(user.id);
  await stashRecoveryCodes(codes);
  redirect({ href: "/auth/recovery-codes?next=/account/security", locale: await getLocale() });
});

export const logoutEverywhereAction = action({}, async (_input, ctx) => {
  await revokeAllSessions(ctx.user.id, { kind: "USER" });
  await db.device.updateMany({ where: { userId: ctx.user.id }, data: { trusted: false } });
  redirect({ href: "/auth/login", locale: await getLocale() });
});

export const revokeSessionAction = action({ schema: z.object({ sessionId: z.string() }) }, async (input, ctx) => {
  await db.session.updateMany({ where: { id: input.sessionId, userId: ctx.user.id }, data: { revokedAt: new Date() } });
  return { ok: true };
});

// ── Demo accounts (DEMO_MODE only) ───────────────────────────────────────

const DEMO_USERS = { buyer: "demo_buyer", seller: "demo_seller", sellerPro: "demo_techhub", seller2: "demo_artisan", business: "demo_business" } as const;

export const demoLoginAction = action({ auth: "public", schema: z.object({ as: z.enum(["buyer", "seller", "sellerPro", "seller2", "business"]), next: z.string().optional() }) }, async (input) => {
  if (!env().DEMO_MODE) throw new AppError("forbidden");
  const user = await db.user.findUnique({ where: { login: DEMO_USERS[input.as] } });
  if (!user) throw new AppError("demoMissing");
  await createSession({ userId: user.id, kind: "USER", pinVerified: true });
  await afterLogin(user.id);
  redirect({ href: safeNext(input.next, input.as.startsWith("seller") ? "/seller" : "/"), locale: await getLocale() });
});

export async function currentUserBrief() {
  const u = await getCurrentUser();
  return u ? { id: u.id, login: u.login, name: u.name } : null;
}
