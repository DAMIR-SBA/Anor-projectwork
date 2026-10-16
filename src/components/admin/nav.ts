import type { Permission } from "@/lib/rbac";

export type AdminNavItem = { href: string; key: string; icon: string; permission?: Permission };
export type AdminNavGroup = { key: string; items: AdminNavItem[] };

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    key: "overview",
    items: [
      { href: "/admin", key: "dashboard", icon: "LayoutDashboard", permission: "dashboard.view" },
      { href: "/admin/analytics", key: "analytics", icon: "ChartLine", permission: "analytics.view" },
      { href: "/admin/support", key: "support", icon: "Headset", permission: "support.handle" },
    ],
  },
  {
    key: "marketplace",
    items: [
      { href: "/admin/moderation/shops", key: "shops", icon: "Store", permission: "shops.moderate" },
      { href: "/admin/moderation/products", key: "products", icon: "Package", permission: "products.moderate" },
      { href: "/admin/moderation/reviews", key: "reviews", icon: "MessageSquareQuote", permission: "reviews.moderate" },
      { href: "/admin/categories", key: "categories", icon: "FolderTree", permission: "categories.manage" },
      { href: "/admin/fraud", key: "fraud", icon: "ShieldAlert", permission: "fraud.manage" },
      { href: "/admin/chats", key: "chats", icon: "MessagesSquare", permission: "chat.moderate" },
    ],
  },
  {
    key: "marketing",
    items: [
      { href: "/admin/banners", key: "banners", icon: "GalleryHorizontal", permission: "banners.manage" },
      { href: "/admin/campaigns", key: "campaigns", icon: "Megaphone", permission: "promos.manage" },
      { href: "/admin/coupons", key: "coupons", icon: "TicketPercent", permission: "promos.manage" },
      { href: "/admin/loyalty", key: "loyalty", icon: "Gem", permission: "loyalty.manage" },
      { href: "/admin/broadcasts", key: "broadcasts", icon: "Radio", permission: "support.broadcast" },
    ],
  },
  {
    key: "operations",
    items: [
      { href: "/admin/orders", key: "orders", icon: "ShoppingBag", permission: "orders.view" },
      { href: "/admin/returns", key: "returns", icon: "Undo2", permission: "returns.manage" },
      { href: "/admin/trade-in", key: "tradeIn", icon: "Repeat", permission: "returns.manage" },
      { href: "/admin/disputes", key: "disputes", icon: "Scale", permission: "disputes.manage" },
      { href: "/admin/logistics", key: "logistics", icon: "Truck", permission: "logistics.manage" },
      { href: "/admin/help", key: "help", icon: "LifeBuoy", permission: "help.manage" },
    ],
  },
  {
    key: "money",
    items: [
      { href: "/admin/finance", key: "finance", icon: "Wallet", permission: "finance.view" },
      { href: "/admin/commissions", key: "commissions", icon: "Percent", permission: "commissions.manage" },
      { href: "/admin/nasiya", key: "nasiya", icon: "CalendarClock", permission: "nasiya.manage" },
    ],
  },
  {
    key: "people",
    items: [
      { href: "/admin/users", key: "users", icon: "Users", permission: "users.view" },
      { href: "/admin/staff", key: "staff", icon: "IdCard", permission: "staff.manage" },
      { href: "/admin/staff/roles", key: "roles", icon: "KeyRound", permission: "roles.manage" },
      { href: "/admin/audit", key: "audit", icon: "ScrollText", permission: "audit.view" },
    ],
  },
  {
    key: "platform",
    items: [
      { href: "/admin/flags", key: "flags", icon: "Flag", permission: "flags.manage" },
      { href: "/admin/settings", key: "settings", icon: "Settings", permission: "settings.manage" },
      { href: "/admin/status", key: "status", icon: "Activity", permission: "system.status" },
      { href: "/admin/security", key: "security", icon: "Fingerprint" },
    ],
  },
];
