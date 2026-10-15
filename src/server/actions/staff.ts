"use server";

import { z } from "zod";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { redirect } from "@/i18n/navigation";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { action, formAction, AppError, zLogin, zPassword } from "@/server/action";
import { audit } from "@/server/audit";
import { totpGenerateSecret, totpUri } from "@/server/security/crypto";
import { createSession, destroySession } from "@/server/auth/session";
import {
  acceptInvite,
  beginTotpSetup,
  changeStaffRole,
  createInvite,
  disableTotp,
  enableTotp,
  promoteUser,
  revokeInvite,
  rotateAccessCode,
  setStaffStatus,
  staffLogin,
} from "@/server/auth/staff-auth";
import { ALL_PERMISSIONS, SUPER_ADMIN_ONLY, type Permission } from "@/lib/rbac";

const zAccessCode = z.string().trim().min(6, { error: "accessCodeShort" }).max(64);
const zOverrides = z
  .string()
  .optional()
  .transform((s) => {
    if (!s) return [];
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return [];
    }
  });

export const staffLoginAction = formAction(
  { auth: "public", schema: z.object({ login: zLogin, password: z.string().min(1).max(128), accessCode: z.string().min(1).max(64), totp: z.string().optional() }) },
  async (input) => {
    await staffLogin(input);
    redirect({ href: "/admin", locale: await getLocale() });
  },
);

export const staffLogoutAction = async () => {
  await destroySession("STAFF");
  redirect({ href: "/staff/login", locale: await getLocale() });
};

export const acceptInviteAction = formAction(
  {
    auth: "public",
    schema: z
      .object({ code: z.string().trim().min(8), login: zLogin, name: z.string().trim().min(2).max(60), password: zPassword, confirm: z.string(), accessCode: zAccessCode, accessCodeConfirm: z.string() })
      .refine((v) => v.password === v.confirm, { error: "passwordMismatch", path: ["confirm"] })
      .refine((v) => v.accessCode === v.accessCodeConfirm, { error: "accessCodeMismatch", path: ["accessCodeConfirm"] })
      .refine((v) => v.accessCode !== v.password, { error: "accessCodeSameAsPassword", path: ["accessCode"] }),
  },
  async (input) => {
    await acceptInvite(input);
    redirect({ href: "/staff/login?welcome=1", locale: await getLocale() });
  },
);

export const createInviteAction = formAction(
  { auth: "staff", permission: "staff.manage", schema: z.object({ roleKey: z.string().min(2), note: z.string().max(200).optional(), overrides: zOverrides }) },
  async (input, ctx) => {
    const invite = await createInvite(ctx.staff, input);
    revalidatePath("/[locale]/admin/staff", "page");
    return { ok: true, data: invite };
  },
);

export const revokeInviteAction = action({ auth: "staff", permission: "staff.manage", schema: z.object({ inviteId: z.string() }) }, async (input, ctx) => {
  await revokeInvite(ctx.staff, input.inviteId);
  revalidatePath("/[locale]/admin/staff", "page");
});

export const promoteUserAction = formAction(
  { auth: "staff", permission: "staff.manage", schema: z.object({ login: zLogin, roleKey: z.string().min(2) }) },
  async (input, ctx) => {
    const r = await promoteUser(ctx.staff, input);
    revalidatePath("/[locale]/admin/staff", "page");
    return { ok: true, data: r };
  },
);

export const changeRoleAction = formAction(
  { auth: "staff", permission: "staff.manage", schema: z.object({ staffProfileId: z.string(), roleKey: z.string(), overrides: zOverrides }) },
  async (input, ctx) => {
    await changeStaffRole(ctx.staff, input);
    revalidatePath("/[locale]/admin/staff", "layout");
    return { ok: true };
  },
);

export const setStaffStatusAction = action(
  { auth: "staff", permission: "staff.manage", schema: z.object({ staffProfileId: z.string(), status: z.enum(["ACTIVE", "SUSPENDED", "REMOVED"]) }) },
  async (input, ctx) => {
    await setStaffStatus(ctx.staff, input);
    revalidatePath("/[locale]/admin/staff", "layout");
  },
);

export const rotateAccessCodeAction = formAction(
  { auth: "staff", schema: z.object({ current: z.string().min(1), next: zAccessCode, confirm: z.string() }).refine((v) => v.next === v.confirm, { error: "accessCodeMismatch", path: ["confirm"] }) },
  async (input, ctx) => {
    await rotateAccessCode(ctx.staff, input);
    return { ok: true };
  },
);

export const startTotpAction = action({ auth: "staff" }, async (_input, ctx) => {
  const secret = totpGenerateSecret();
  await beginTotpSetup(ctx.staff, secret);
  const uri = totpUri(secret, ctx.staff.user.login);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return { ok: true, data: { secret, qr } };
});

export const enableTotpAction = formAction({ auth: "staff", schema: z.object({ code: z.string().regex(/^\d{6}$/) }) }, async (input, ctx) => {
  await enableTotp(ctx.staff, input.code);
  revalidatePath("/[locale]/admin/security", "page");
  return { ok: true };
});

export const disableTotpAction = formAction({ auth: "staff", schema: z.object({ code: z.string().regex(/^\d{6}$/) }) }, async (input, ctx) => {
  await disableTotp(ctx.staff, input.code);
  revalidatePath("/[locale]/admin/security", "page");
  return { ok: true };
});

// ── Custom roles (SUPER_ADMIN only) ───────────────────────────────────────

export const saveRoleAction = formAction(
  {
    auth: "staff",
    permission: "roles.manage",
    schema: z.object({
      roleId: z.string().optional(),
      key: z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,30}$/, { error: "roleKeyFormat" }),
      name: z.string().trim().min(2).max(60),
      description: z.string().max(200).optional(),
      permissions: z.array(z.string()).default([]),
    }),
  },
  async (input, ctx) => {
    const perms = input.permissions.filter((p): p is Permission => (ALL_PERMISSIONS as string[]).includes(p) && !SUPER_ADMIN_ONLY.includes(p as Permission));
    const existing = input.roleId ? await db.role.findUnique({ where: { id: input.roleId }, include: { permissions: { include: { permission: true } } } }) : null;
    if (existing?.key === "SUPER_ADMIN") throw new AppError("forbidden");
    const permRows = await db.permission.findMany({ where: { key: { in: perms } } });
    const role = existing
      ? await db.role.update({ where: { id: existing.id }, data: { name: input.name, description: input.description } })
      : await db.role.create({ data: { key: input.key, name: input.name, description: input.description } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: permRows.map((p) => ({ roleId: role.id, permissionId: p.id })) });
    // Permission changes are a privilege change for everyone holding the role.
    const holders = await db.staffProfile.findMany({ where: { roleId: role.id }, select: { userId: true } });
    await db.session.updateMany({ where: { userId: { in: holders.map((h) => h.userId) }, kind: "STAFF", revokedAt: null, NOT: { userId: ctx.staff.user.id } }, data: { revokedAt: new Date() } });
    await audit({
      actorId: ctx.staff.user.id,
      actorLogin: ctx.staff.user.login,
      action: existing ? "role.updated" : "role.created",
      entityType: "Role",
      entityId: role.id,
      before: existing ? { name: existing.name, permissions: existing.permissions.map((p) => p.permission.key) } : undefined,
      after: { key: role.key, name: input.name, permissions: perms },
    });
    revalidatePath("/[locale]/admin/staff/roles", "page");
    return { ok: true };
  },
);

export const deleteRoleAction = action({ auth: "staff", permission: "roles.manage", schema: z.object({ roleId: z.string() }) }, async (input, ctx) => {
  const role = await db.role.findUnique({ where: { id: input.roleId }, include: { _count: { select: { staff: true } } } });
  if (!role || role.isSystem) throw new AppError("forbidden");
  if (role._count.staff > 0) throw new AppError("roleInUse");
  await db.role.delete({ where: { id: role.id } });
  await audit({ actorId: ctx.staff.user.id, actorLogin: ctx.staff.user.login, action: "role.deleted", entityType: "Role", entityId: role.id, before: { key: role.key } });
  revalidatePath("/[locale]/admin/staff/roles", "page");
});

// ── Demo staff logins (DEMO_MODE only) ────────────────────────────────────

export const demoStaffLoginAction = action({ auth: "public", schema: z.object({ role: z.enum(["SUPER_ADMIN", "ADMIN", "SUPPORT", "MODERATOR", "FINANCE", "COURIER"]) }) }, async (input) => {
  if (!env().DEMO_MODE) throw new AppError("forbidden");
  const user = await db.user.findUnique({ where: { login: `demo_${input.role.toLowerCase()}` }, include: { staffProfile: true } });
  if (!user?.staffProfile || user.staffProfile.status !== "ACTIVE") throw new AppError("demoMissing");
  await createSession({ userId: user.id, kind: "STAFF", pinVerified: true });
  await audit({ actorId: user.id, actorLogin: user.login, action: "staff.login", meta: { demo: true } });
  redirect({ href: input.role === "COURIER" ? "/courier" : "/admin", locale: await getLocale() });
});
