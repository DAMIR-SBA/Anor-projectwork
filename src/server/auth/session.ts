import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { randomToken, sha256 } from "@/server/security/crypto";
import { deviceName, requestMeta } from "@/server/security/request";
import { resolvePermissions, type Override, type Permission } from "@/lib/rbac";
import type { SessionKind } from "@/generated/prisma/enums";

export const COOKIE = {
  USER: "anor_sid",
  STAFF: "anor_staff",
  DEVICE: "anor_did",
} as const;

const USER_TTL_DAYS = 30;
const STAFF_TTL_HOURS = 12;
const STAFF_IDLE_MINUTES = 120;
const TOUCH_EVERY_MS = 5 * 60_000;

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Long-lived random device id cookie; the DB only stores its hash. */
async function ensureDeviceCookie(): Promise<string> {
  const jar = await cookies();
  let did = jar.get(COOKIE.DEVICE)?.value;
  if (!did || did.length < 20) {
    did = randomToken(24);
    jar.set(COOKIE.DEVICE, did, cookieOptions(60 * 60 * 24 * 730));
  }
  return did;
}

export async function upsertDevice(userId: string) {
  const did = await ensureDeviceCookie();
  const meta = await requestMeta();
  const fingerprint = sha256(did);
  return db.device.upsert({
    where: { userId_fingerprint: { userId, fingerprint } },
    create: { userId, fingerprint, name: deviceName(meta.userAgent), lastIp: meta.ip },
    update: { lastSeenAt: new Date(), lastIp: meta.ip, name: deviceName(meta.userAgent) },
  });
}

/**
 * Create a session and set its cookie. Any session currently held in the same cookie
 * is revoked first (rotation on login / privilege change prevents session fixation).
 */
export async function createSession(opts: { userId: string; kind: SessionKind; pinVerified?: boolean; deviceId?: string | null }) {
  const jar = await cookies();
  const cookieName = opts.kind === "STAFF" ? COOKIE.STAFF : COOKIE.USER;
  const previous = jar.get(cookieName)?.value;
  if (previous) {
    await db.session.updateMany({ where: { tokenHash: sha256(previous), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  const meta = await requestMeta();
  const token = randomToken(32);
  const ttlMs = opts.kind === "STAFF" ? STAFF_TTL_HOURS * 3_600_000 : USER_TTL_DAYS * 86_400_000;
  const session = await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId: opts.userId,
      kind: opts.kind,
      deviceId: opts.deviceId ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
      pinVerified: opts.pinVerified ?? false,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  jar.set(cookieName, token, cookieOptions(Math.floor(ttlMs / 1000)));
  return session;
}

/** Re-issue the current session token with updated flags (e.g. after PIN verification). */
export async function rotateSession(kind: SessionKind, patch: { pinVerified?: boolean }) {
  const current = kind === "STAFF" ? await getStaffSession() : await getUserSession();
  if (!current) return null;
  return createSession({ userId: current.session.userId, kind, pinVerified: patch.pinVerified ?? current.session.pinVerified, deviceId: current.session.deviceId });
}

export async function destroySession(kind: SessionKind) {
  const jar = await cookies();
  const cookieName = kind === "STAFF" ? COOKIE.STAFF : COOKIE.USER;
  const token = jar.get(cookieName)?.value;
  if (token) {
    await db.session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  jar.delete(cookieName);
}

export async function revokeAllSessions(userId: string, opts: { kind?: SessionKind; exceptTokenOf?: SessionKind } = {}) {
  let exceptHash: string | undefined;
  if (opts.exceptTokenOf) {
    const jar = await cookies();
    const token = jar.get(opts.exceptTokenOf === "STAFF" ? COOKIE.STAFF : COOKIE.USER)?.value;
    if (token) exceptHash = sha256(token);
  }
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(opts.kind ? { kind: opts.kind } : {}), ...(exceptHash ? { NOT: { tokenHash: exceptHash } } : {}) },
    data: { revokedAt: new Date() },
  });
}

async function loadSession(kind: SessionKind) {
  const jar = await cookies();
  const token = jar.get(kind === "STAFF" ? COOKIE.STAFF : COOKIE.USER)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          staffProfile: { include: { role: { include: { permissions: { include: { permission: true } } } }, overrides: { include: { permission: true } } } },
          subscriptions: { where: { status: "ACTIVE", currentPeriodEnd: { gt: new Date() } }, take: 1 },
        },
      },
    },
  });
  if (!session || session.kind !== kind || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;
  if (kind === "STAFF") {
    if (!session.user.staffProfile || session.user.staffProfile.status !== "ACTIVE") return null;
    if (Date.now() - session.lastUsedAt.getTime() > STAFF_IDLE_MINUTES * 60_000) return null;
  }
  if (Date.now() - session.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    // Best-effort activity tracking; never block rendering on it.
    void db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    void db.user.update({ where: { id: session.userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return session;
}

export type LoadedSession = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

export const getUserSession = cache(async () => {
  const session = await loadSession("USER");
  if (!session) return null;
  const needsPin = !!session.user.pinHash && !session.pinVerified;
  return { session, user: session.user, needsPin };
});

export type CurrentUser = LoadedSession["user"] & { isPlus: boolean };

/** Signed-in buyer/seller, or null. Sessions still waiting for the PIN second factor count as signed out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await getUserSession();
  if (!s || s.needsPin) return null;
  return { ...s.user, isPlus: s.user.subscriptions.length > 0 };
});

export type StaffContext = {
  session: LoadedSession;
  user: LoadedSession["user"];
  staffId: string;
  role: string;
  permissions: Set<Permission>;
};

export const getStaffSession = cache(async (): Promise<StaffContext | null> => {
  const session = await loadSession("STAFF");
  if (!session?.user.staffProfile) return null;
  const sp = session.user.staffProfile;
  const overrides: Override[] = sp.overrides.map((o) => ({ permission: o.permission.key as Permission, effect: o.effect }));
  const permissions = resolvePermissions(sp.role.key, sp.role.permissions.map((rp) => rp.permission.key), overrides);
  return { session, user: session.user, staffId: sp.id, role: sp.role.key, permissions };
});
