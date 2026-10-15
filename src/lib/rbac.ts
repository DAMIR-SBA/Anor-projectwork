// Pure RBAC definitions (no DB access) — shared by the seed, server guards and unit tests.

export const PERMISSIONS = {
  "dashboard.view": "Admin dashboard",
  "users.view": "View users",
  "users.manage": "Suspend / restore users, reset lockouts",
  "staff.manage": "Invite, promote, change roles, suspend and remove staff",
  "roles.manage": "Create custom roles and edit permissions",
  "audit.view": "View audit log",
  "audit.export": "Export audit log",
  "shops.view": "View shops",
  "shops.moderate": "Approve / reject / suspend shops and documents",
  "products.view": "View all products",
  "products.moderate": "Approve / reject products",
  "reviews.moderate": "Moderate reviews, questions and answers",
  "categories.manage": "Manage categories and attributes",
  "banners.manage": "Manage banners",
  "promos.manage": "Manage coupons, campaigns and flash sales",
  "loyalty.manage": "Manage loyalty tiers, cashback and gamification",
  "commissions.manage": "Manage commission tables",
  "nasiya.manage": "Manage Nasiya plans, scoring limits and portfolio",
  "orders.view": "View orders",
  "orders.manage": "Change order status, cancel orders",
  "returns.manage": "Process returns",
  "disputes.manage": "Decide seller disputes",
  "fraud.manage": "Review fraud flags",
  "logistics.manage": "Warehouses, pickup points, couriers, delivery SLA",
  "finance.view": "View finance reports",
  "finance.manage": "Payouts and refunds",
  "support.handle": "Handle support tickets",
  "support.broadcast": "Send broadcasts and announcements",
  "chat.moderate": "Moderation access to buyer↔seller chats",
  "analytics.view": "Platform analytics",
  "flags.manage": "Feature flags and A/B tests",
  "help.manage": "Help center articles and canned replies",
  "settings.manage": "Platform settings",
  "system.status": "Status page (queues, errors)",
  "system.demo_reset": "Reset demo data",
  "courier.deliver": "Courier app: assigned deliveries",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Permissions that can never be granted outside the SUPER_ADMIN role (no privilege escalation). */
export const SUPER_ADMIN_ONLY: Permission[] = ["staff.manage", "roles.manage", "system.demo_reset"];

export const SYSTEM_ROLES = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "MODERATOR", "FINANCE", "COURIER"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const ROLE_DEFAULTS: Record<SystemRole, { name: string; description: string; permissions: Permission[] }> = {
  SUPER_ADMIN: { name: "Super admin", description: "Platform owner. Full access, manages staff.", permissions: ALL_PERMISSIONS },
  ADMIN: {
    name: "Admin",
    description: "Runs the platform day to day. Cannot manage staff or roles.",
    permissions: ALL_PERMISSIONS.filter((p) => !SUPER_ADMIN_ONLY.includes(p) && p !== "courier.deliver"),
  },
  SUPPORT: {
    name: "Support",
    description: "Customer support agents.",
    permissions: ["dashboard.view", "users.view", "orders.view", "returns.manage", "support.handle", "help.manage", "shops.view"],
  },
  MODERATOR: {
    name: "Moderator",
    description: "Content and marketplace moderation.",
    permissions: ["dashboard.view", "shops.view", "shops.moderate", "products.view", "products.moderate", "reviews.moderate", "chat.moderate", "fraud.manage", "users.view"],
  },
  FINANCE: {
    name: "Finance",
    description: "Payouts, refunds, installment portfolio.",
    permissions: ["dashboard.view", "finance.view", "finance.manage", "orders.view", "nasiya.manage", "commissions.manage", "analytics.view", "audit.view"],
  },
  COURIER: { name: "Courier", description: "Last-mile delivery.", permissions: ["courier.deliver"] },
};

export type Override = { permission: Permission; effect: "GRANT" | "DENY" };

/**
 * Effective permission set = role permissions + GRANT overrides − DENY overrides.
 * SUPER_ADMIN always has everything; SUPER_ADMIN-only permissions cannot be granted to other roles.
 */
export function resolvePermissions(roleKey: string, rolePermissions: string[], overrides: Override[] = []): Set<Permission> {
  if (roleKey === "SUPER_ADMIN") return new Set(ALL_PERMISSIONS);
  const set = new Set<Permission>(rolePermissions.filter((p): p is Permission => p in PERMISSIONS && !SUPER_ADMIN_ONLY.includes(p as Permission)));
  for (const o of overrides) {
    if (o.effect === "GRANT" && !SUPER_ADMIN_ONLY.includes(o.permission) && o.permission in PERMISSIONS) set.add(o.permission);
    if (o.effect === "DENY") set.delete(o.permission);
  }
  return set;
}

/**
 * Can `actorRole` assign `targetRole` / these overrides? Only SUPER_ADMIN manages staff,
 * and nobody can hand out SUPER_ADMIN-only permissions through overrides.
 */
export function canAssign(actorRole: string, overrides: Override[] = []): boolean {
  if (actorRole !== "SUPER_ADMIN") return false;
  return !overrides.some((o) => o.effect === "GRANT" && SUPER_ADMIN_ONLY.includes(o.permission));
}

/** Guard for removing/demoting staff: the platform must keep at least one active SUPER_ADMIN. */
export function wouldRemoveLastSuperAdmin(targetRole: string, activeSuperAdmins: number, nextRole?: string | null): boolean {
  return targetRole === "SUPER_ADMIN" && activeSuperAdmins <= 1 && nextRole !== "SUPER_ADMIN";
}

export const PERMISSION_GROUPS: Array<{ key: string; permissions: Permission[] }> = [
  { key: "platform", permissions: ["dashboard.view", "analytics.view", "settings.manage", "flags.manage", "system.status", "system.demo_reset"] },
  { key: "people", permissions: ["users.view", "users.manage", "staff.manage", "roles.manage", "audit.view", "audit.export"] },
  { key: "marketplace", permissions: ["shops.view", "shops.moderate", "products.view", "products.moderate", "reviews.moderate", "categories.manage", "fraud.manage"] },
  { key: "marketing", permissions: ["banners.manage", "promos.manage", "loyalty.manage"] },
  { key: "operations", permissions: ["orders.view", "orders.manage", "returns.manage", "disputes.manage", "logistics.manage", "courier.deliver"] },
  { key: "finance", permissions: ["finance.view", "finance.manage", "commissions.manage", "nasiya.manage"] },
  { key: "support", permissions: ["support.handle", "support.broadcast", "chat.moderate", "help.manage"] },
];
