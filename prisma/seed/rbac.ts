import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { prisma } from "./client";
import { PERMISSIONS, ROLE_DEFAULTS, SYSTEM_ROLES, PERMISSION_GROUPS } from "../../src/lib/rbac";

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 as const };
export const hashSecret = (s: string) => hash(s, ARGON);
const PLACEHOLDER = /change[_-]?me|placeholder|your[_-]|example|^x+$/i;

export async function seedRbac() {
  const groupOf = (key: string) => PERMISSION_GROUPS.find((g) => (g.permissions as string[]).includes(key))?.key ?? "platform";
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, create: { key, description, group: groupOf(key) }, update: { description, group: groupOf(key) } });
  }
  const perms = await prisma.permission.findMany();
  for (const key of SYSTEM_ROLES) {
    const def = ROLE_DEFAULTS[key];
    const role = await prisma.role.upsert({ where: { key }, create: { key, name: def.name, description: def.description, isSystem: true }, update: { name: def.name, description: def.description, isSystem: true } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: perms.filter((p) => (def.permissions as string[]).includes(p.key)).map((p) => ({ roleId: role.id, permissionId: p.id })) });
  }
  console.log(`  rbac: ${perms.length} permissions, ${SYSTEM_ROLES.length} system roles`);
}

function referral() {
  return randomBytes(5).toString("hex").toUpperCase().slice(0, 8);
}

export async function createUser(data: { login: string; name: string; password: string; phone?: string; email?: string; isBusiness?: boolean; avatarUrl?: string }) {
  const existing = await prisma.user.findUnique({ where: { login: data.login } });
  if (existing) return existing;
  const user = await prisma.user.create({
    data: {
      login: data.login,
      name: data.name,
      passwordHash: await hashSecret(data.password),
      phone: data.phone,
      phoneVerifiedAt: data.phone ? new Date() : null,
      email: data.email,
      avatarUrl: data.avatarUrl,
      referralCode: referral(),
      consentAt: new Date(),
      consentVersion: "2026-01",
    },
  });
  await prisma.wallet.create({ data: { userId: user.id } });
  await prisma.wishlist.create({ data: { userId: user.id, shareToken: randomBytes(6).toString("hex") } });
  return user;
}

async function createStaff(login: string, name: string, roleKey: string, password: string, accessCode: string) {
  const user = await createUser({ login, name, password });
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  const sp = await prisma.staffProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, roleId: role.id }, update: { roleId: role.id, status: "ACTIVE" } });
  await prisma.accessCode.upsert({ where: { staffProfileId: sp.id }, create: { staffProfileId: sp.id, codeHash: await hashSecret(accessCode) }, update: {} });
  return user;
}

/** Owner account from env. Refuses placeholders in production; skipped with a warning in dev. */
export async function seedOwner() {
  const { SUPER_ADMIN_LOGIN: login, SUPER_ADMIN_PASSWORD: password, SUPER_ADMIN_ACCESS_CODE: code, NODE_ENV } = process.env;
  const bad = !login || !password || !code || PLACEHOLDER.test(login) || PLACEHOLDER.test(password) || PLACEHOLDER.test(code) || password.length < 12 || code.length < 6;
  if (bad) {
    if (NODE_ENV === "production") throw new Error("SUPER_ADMIN_* env vars are missing or placeholders — refusing to seed the owner account.");
    console.warn("  ! SUPER_ADMIN_* not configured — owner account skipped (set them in .env)");
    return null;
  }
  const user = await createStaff(login.toLowerCase(), "Platform Owner", "SUPER_ADMIN", password, code);
  console.log(`  owner: ${user.login} (SUPER_ADMIN)`);
  return user;
}

export type DemoAccounts = Awaited<ReturnType<typeof seedDemoPeople>>;

/** Demo staff of every role + demo buyers/sellers. Random passwords; use the one-click demo buttons. */
export async function seedDemoPeople() {
  const pw = () => `Demo-${randomBytes(9).toString("base64url")}`;
  const staff: Record<string, string> = {};
  for (const role of SYSTEM_ROLES) {
    const login = `demo_${role.toLowerCase()}`;
    const password = pw();
    const created = await prisma.user.findUnique({ where: { login } });
    await createStaff(login, `Demo ${ROLE_DEFAULTS[role].name}`, role, password, "246810");
    if (!created) staff[login] = password;
  }
  const courier2 = await createStaff("demo_courier2", "Jasur Courier", "COURIER", pw(), "246810");

  const buyer = await createUser({ login: "demo_buyer", name: "Aziza Karimova", password: pw(), phone: "+998901112233", email: "aziza@example.com" });
  const seller = await createUser({ login: "demo_seller", name: "Bekzod Toshmatov", password: pw(), phone: "+998935556677" });
  const artisan = await createUser({ login: "demo_artisan", name: "Dilnoza Rahimova", password: pw(), phone: "+998977778899" });
  const techSeller = await createUser({ login: "demo_techhub", name: "Sardor Aliyev", password: pw(), phone: "+998946667788" });
  const business = await createUser({ login: "demo_business", name: "Rustam Yusupov", password: pw(), phone: "+998712001020" });
  const extraBuyers = [];
  const names = ["Madina Saidova", "Otabek Nurmatov", "Gulnora Ismoilova", "Javlon Qodirov", "Shahlo Ergasheva", "Timur Abdullayev", "Nodira Xolmatova", "Anvar Raximov"];
  for (const [i, name] of names.entries()) {
    extraBuyers.push(await createUser({ login: `buyer_${String(i + 1).padStart(2, "0")}`, name, password: pw() }));
  }
  if (Object.keys(staff).length) {
    console.log("  demo staff created (random passwords; access code 246810 — use one-click demo login):");
    for (const [login, p] of Object.entries(staff)) console.log(`    ${login.padEnd(20)} ${p}`);
  }
  return { buyer, seller, artisan, techSeller, business, extraBuyers, courier2 };
}
