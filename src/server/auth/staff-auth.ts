import "server-only";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { decrypt, encrypt, hashSecret, randomCode, randomDigits, sha256, normalizeCode, totpVerify, verifySecret } from "@/server/security/crypto";
import { rateLimit, LIMITS } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/security/request";
import { alertOwner } from "@/server/notify/alerts";
import { canAssign, wouldRemoveLastSuperAdmin, type Override, type Permission, PERMISSIONS } from "@/lib/rbac";
import { createSession, revokeAllSessions, type StaffContext } from "./session";
import { createUserRecord, isReservedLogin } from "./user-auth";

const INVITE_TTL_HOURS = 48;

function requireSuperAdmin(actor: StaffContext) {
  if (actor.role !== "SUPER_ADMIN" || !actor.permissions.has("staff.manage")) throw new AppError("forbidden");
}

function sanitizeOverrides(raw: unknown): Override[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is Override => !!o && typeof o === "object" && (o as Override).permission in PERMISSIONS && ["GRANT", "DENY"].includes((o as Override).effect))
    .map((o) => ({ permission: o.permission as Permission, effect: o.effect }));
}

async function activeSuperAdminCount() {
  return db.staffProfile.count({ where: { status: "ACTIVE", role: { key: "SUPER_ADMIN" } } });
}

async function writeOverrides(staffProfileId: string, overrides: Override[]) {
  await db.staffPermissionOverride.deleteMany({ where: { staffProfileId } });
  if (!overrides.length) return;
  const perms = await db.permission.findMany({ where: { key: { in: overrides.map((o) => o.permission) } } });
  await db.staffPermissionOverride.createMany({
    data: overrides.flatMap((o) => {
      const p = perms.find((x) => x.key === o.permission);
      return p ? [{ staffProfileId, permissionId: p.id, effect: o.effect }] : [];
    }),
  });
}

// ── Login ────────────────────────────────────────────────────────────────

export async function staffLogin(input: { login: string; password: string; accessCode: string; totp?: string }) {
  const meta = await requestMeta();
  const rl = await rateLimit(`staff-login:${meta.ip}`, LIMITS.staffLoginIp.limit, LIMITS.staffLoginIp.window);
  if (!rl.success) throw new AppError("rateLimited");

  const user = await db.user.findUnique({
    where: { login: input.login },
    include: { staffProfile: { include: { accessCode: true, role: true } } },
  });
  const sp = user?.staffProfile;
  const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
  const passwordOk = await verifySecret(user?.passwordHash, input.password);
  const codeOk = await verifySecret(sp?.accessCode?.codeHash, input.accessCode);
  let totpOk = true;
  if (sp?.totpEnabled && sp.totpSecret) {
    const secret = decrypt(sp.totpSecret);
    totpOk = !!secret && !!input.totp && totpVerify(secret, input.totp);
  }
  const ok = !!user && !!sp && sp.status === "ACTIVE" && user.status === "ACTIVE" && passwordOk && codeOk && totpOk && !locked;

  await db.loginAttempt.create({
    data: { userId: user?.id, identifier: input.login.slice(0, 64), kind: "STAFF", ip: meta.ip, userAgent: meta.userAgent, success: ok, reason: ok ? null : !sp ? "not_staff" : locked ? "locked" : !passwordOk ? "password" : !codeOk ? "access_code" : !totpOk ? "totp" : "status" },
  });

  if (!ok) {
    if (user && !locked) {
      const failed = user.failedLoginCount + 1;
      await db.user.update({ where: { id: user.id }, data: failed >= 5 ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + 15 * 60_000) } : { failedLoginCount: failed } });
    }
    await audit({ actorId: user?.id ?? null, actorLogin: input.login, action: "staff.login_failed", meta: { ip: meta.ip } });
    void alertOwner(`staff-fail:${meta.ip}`, "Failed staff login", `Login: ${input.login}\nIP: ${meta.ip}\nUA: ${meta.userAgent}\nTime: ${new Date().toISOString()}`);
    throw new AppError("invalidStaffCredentials");
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  await db.accessCode.update({ where: { staffProfileId: sp.id }, data: { lastUsedAt: new Date() } });
  await createSession({ userId: user.id, kind: "STAFF", pinVerified: true });
  await audit({ actorId: user.id, actorLogin: user.login, action: "staff.login", meta: { role: sp.role.key } });
}

// ── Invites ──────────────────────────────────────────────────────────────

export async function createInvite(actor: StaffContext, input: { roleKey: string; overrides?: unknown; note?: string }) {
  requireSuperAdmin(actor);
  const overrides = sanitizeOverrides(input.overrides);
  if (!canAssign(actor.role, overrides)) throw new AppError("forbidden");
  const role = await db.role.findUnique({ where: { key: input.roleKey } });
  if (!role) throw new AppError("notFound");

  const code = randomCode(3, 4);
  const invite = await db.staffInvite.create({
    data: {
      codeHash: sha256(normalizeCode(code)),
      roleId: role.id,
      overrides: overrides.length ? overrides : undefined,
      note: input.note || null,
      createdById: actor.user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000),
    },
  });
  await audit({ actorId: actor.user.id, actorLogin: actor.user.login, action: "staff.invite_created", entityType: "StaffInvite", entityId: invite.id, after: { role: role.key, overrides, note: input.note } });
  const link = `${env().APP_URL}/staff/invite?code=${encodeURIComponent(code)}`;
  return { code, link, expiresAt: invite.expiresAt };
}

export async function findValidInvite(code: string) {
  const invite = await db.staffInvite.findUnique({ where: { codeHash: sha256(normalizeCode(code)) }, include: { role: true } });
  if (!invite || invite.usedAt || invite.revokedAt || invite.expiresAt < new Date()) return null;
  return invite;
}

export async function revokeInvite(actor: StaffContext, inviteId: string) {
  requireSuperAdmin(actor);
  const invite = await db.staffInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
  await audit({ actorId: actor.user.id, actorLogin: actor.user.login, action: "staff.invite_revoked", entityType: "StaffInvite", entityId: invite.id });
}

export async function acceptInvite(input: { code: string; login: string; name: string; password: string; accessCode: string }) {
  const meta = await requestMeta();
  const rl = await rateLimit(`invite:${meta.ip}`, 10, 3600);
  if (!rl.success) throw new AppError("rateLimited");
  const invite = await findValidInvite(input.code);
  if (!invite) throw new AppError("inviteInvalid", undefined, "code");
  if (isReservedLogin(input.login) && invite.role.key !== "SUPER_ADMIN") throw new AppError("loginTaken", undefined, "login");
  if (await db.user.findUnique({ where: { login: input.login }, select: { id: true } })) throw new AppError("loginTaken", undefined, "login");

  const [passwordHash, codeHash] = await Promise.all([hashSecret(input.password), hashSecret(input.accessCode)]);
  const overrides = sanitizeOverrides(invite.overrides);

  const user = await db.$transaction(async (tx) => {
    // Single-use: claim the invite atomically so two submissions cannot both succeed.
    const claimed = await tx.staffInvite.updateMany({ where: { id: invite.id, usedAt: null, revokedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new AppError("inviteInvalid", undefined, "code");
    const user = await createUserRecord(tx, { login: input.login, passwordHash, name: input.name });
    const sp = await tx.staffProfile.create({ data: { userId: user.id, roleId: invite.roleId, invitedById: invite.createdById } });
    await tx.accessCode.create({ data: { staffProfileId: sp.id, codeHash } });
    await tx.staffInvite.update({ where: { id: invite.id }, data: { usedById: user.id } });
    return { user, sp };
  });
  await writeOverrides(user.sp.id, overrides);
  await audit({ actorId: user.user.id, actorLogin: user.user.login, action: "staff.invite_accepted", entityType: "StaffProfile", entityId: user.sp.id, after: { role: invite.role.key, overrides } });
  return user.user;
}

// ── Staff management (SUPER_ADMIN only) ───────────────────────────────────

/** Promote an existing user. Returns a one-time access code the employee should rotate. */
export async function promoteUser(actor: StaffContext, input: { login: string; roleKey: string }) {
  requireSuperAdmin(actor);
  const user = await db.user.findUnique({ where: { login: input.login }, include: { staffProfile: true } });
  if (!user || user.status !== "ACTIVE") throw new AppError("notFound", undefined, "login");
  if (user.staffProfile && user.staffProfile.status !== "REMOVED") throw new AppError("alreadyStaff", undefined, "login");
  const role = await db.role.findUnique({ where: { key: input.roleKey } });
  if (!role) throw new AppError("notFound");
  const tempCode = randomDigits(8);
  const codeHash = await hashSecret(tempCode);
  const sp = user.staffProfile
    ? await db.staffProfile.update({ where: { id: user.staffProfile.id }, data: { roleId: role.id, status: "ACTIVE", invitedById: actor.user.id } })
    : await db.staffProfile.create({ data: { userId: user.id, roleId: role.id, invitedById: actor.user.id } });
  await db.accessCode.upsert({ where: { staffProfileId: sp.id }, create: { staffProfileId: sp.id, codeHash }, update: { codeHash, rotatedAt: new Date() } });
  // Privilege change → existing sessions are re-issued on next login.
  await revokeAllSessions(user.id);
  await audit({ actorId: actor.user.id, actorLogin: actor.user.login, action: "staff.promoted", entityType: "User", entityId: user.id, after: { role: role.key } });
  return { tempCode };
}

export async function changeStaffRole(actor: StaffContext, input: { staffProfileId: string; roleKey: string; overrides?: unknown }) {
  requireSuperAdmin(actor);
  const overrides = sanitizeOverrides(input.overrides);
  if (!canAssign(actor.role, overrides)) throw new AppError("forbidden");
  const target = await db.staffProfile.findUnique({ where: { id: input.staffProfileId }, include: { role: true, overrides: { include: { permission: true } } } });
  const role = await db.role.findUnique({ where: { key: input.roleKey } });
  if (!target || !role) throw new AppError("notFound");
  if (wouldRemoveLastSuperAdmin(target.role.key, await activeSuperAdminCount(), role.key)) throw new AppError("lastSuperAdmin");

  await db.staffProfile.update({ where: { id: target.id }, data: { roleId: role.id } });
  await writeOverrides(target.id, overrides);
  await revokeAllSessions(target.userId, { kind: "STAFF" });
  await audit({
    actorId: actor.user.id,
    actorLogin: actor.user.login,
    action: "staff.role_changed",
    entityType: "StaffProfile",
    entityId: target.id,
    before: { role: target.role.key, overrides: target.overrides.map((o) => ({ permission: o.permission.key, effect: o.effect })) },
    after: { role: role.key, overrides },
  });
}

export async function setStaffStatus(actor: StaffContext, input: { staffProfileId: string; status: "ACTIVE" | "SUSPENDED" | "REMOVED" }) {
  requireSuperAdmin(actor);
  const target = await db.staffProfile.findUnique({ where: { id: input.staffProfileId }, include: { role: true } });
  if (!target) throw new AppError("notFound");
  if (input.status !== "ACTIVE" && wouldRemoveLastSuperAdmin(target.role.key, await activeSuperAdminCount(), null)) throw new AppError("lastSuperAdmin");
  if (input.status !== "ACTIVE" && target.userId === actor.user.id && target.role.key === "SUPER_ADMIN" && (await activeSuperAdminCount()) <= 1) throw new AppError("lastSuperAdmin");

  await db.staffProfile.update({ where: { id: target.id }, data: { status: input.status } });
  // Suspension/removal takes effect immediately: every staff session of the target is revoked.
  if (input.status !== "ACTIVE") await revokeAllSessions(target.userId, { kind: "STAFF" });
  await audit({ actorId: actor.user.id, actorLogin: actor.user.login, action: `staff.${input.status.toLowerCase()}`, entityType: "StaffProfile", entityId: target.id, before: { status: target.status }, after: { status: input.status } });
}

// ── Self-service security ─────────────────────────────────────────────────

export async function rotateAccessCode(actor: StaffContext, input: { current: string; next: string }) {
  const ac = await db.accessCode.findUnique({ where: { staffProfileId: actor.staffId } });
  if (!(await verifySecret(ac?.codeHash, input.current))) throw new AppError("invalidCode", undefined, "current");
  await db.accessCode.update({ where: { staffProfileId: actor.staffId }, data: { codeHash: await hashSecret(input.next), rotatedAt: new Date() } });
  await revokeAllSessions(actor.user.id, { kind: "STAFF", exceptTokenOf: "STAFF" });
  await audit({ actorId: actor.user.id, actorLogin: actor.user.login, action: "staff.access_code_rotated", entityType: "StaffProfile", entityId: actor.staffId });
}

export async function beginTotpSetup(actor: StaffContext, secret: string) {
  await db.staffProfile.update({ where: { id: actor.staffId }, data: { totpSecret: encrypt(secret), totpEnabled: false } });
}

export async function enableTotp(actor: StaffContext, code: string) {
  const sp = await db.staffProfile.findUniqueOrThrow({ where: { id: actor.staffId } });
  const secret = sp.totpSecret ? decrypt(sp.totpSecret) : null;
  if (!secret || !totpVerify(secret, code)) throw new AppError("invalidCode", undefined, "code");
  await db.staffProfile.update({ where: { id: actor.staffId }, data: { totpEnabled: true } });
  await audit({ actorId: actor.user.id, actorLogin: actor.user.login, action: "staff.totp_enabled", entityType: "StaffProfile", entityId: actor.staffId });
}

export async function disableTotp(actor: StaffContext, code: string) {
  const sp = await db.staffProfile.findUniqueOrThrow({ where: { id: actor.staffId } });
  const secret = sp.totpSecret ? decrypt(sp.totpSecret) : null;
  if (!secret || !totpVerify(secret, code)) throw new AppError("invalidCode", undefined, "code");
  await db.staffProfile.update({ where: { id: actor.staffId }, data: { totpEnabled: false, totpSecret: null } });
  await audit({ actorId: actor.user.id, actorLogin: actor.user.login, action: "staff.totp_disabled", entityType: "StaffProfile", entityId: actor.staffId });
}
