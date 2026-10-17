import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { publish } from "@/server/realtime/bus";
import { resolvePermissions, type Override, type Permission } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";
import type { TicketPriority, TicketStatus } from "@/generated/prisma/enums";
import type { StaffContext } from "@/server/auth/session";

export type TicketFilter = {
  view: "open" | "mine" | "unassigned" | "waiting" | "resolved" | "all";
  priority?: TicketPriority;
  tag?: string;
  q?: string;
  kind?: "SUPPORT" | "SELLER_SUPPORT";
  channel?: "WEB" | "TELEGRAM" | "MINIAPP" | "EMAIL";
};

function whereFor(f: TicketFilter, me: string): Prisma.TicketWhereInput {
  const view: Prisma.TicketWhereInput =
    f.view === "open"
      ? { status: { in: ["NEW", "IN_PROGRESS"] } }
      : f.view === "mine"
        ? { assigneeId: me, status: { not: "RESOLVED" } }
        : f.view === "unassigned"
          ? { assigneeId: null, status: { not: "RESOLVED" } }
          : f.view === "waiting"
            ? { status: "WAITING_CUSTOMER" }
            : f.view === "resolved"
              ? { status: "RESOLVED" }
              : {};
  const q = f.q?.trim();
  return {
    ...view,
    ...(f.priority ? { priority: f.priority } : {}),
    ...(f.tag ? { tags: { has: f.tag } } : {}),
    ...(f.kind ? { conversation: { type: f.kind } } : {}),
    ...(f.channel ? { channel: f.channel } : {}),
    ...(q
      ? {
          OR: [
            ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : []),
            { subject: { contains: q, mode: "insensitive" as const } },
            { customer: { OR: [{ login: { contains: q.toLowerCase() } }, { name: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q.replace(/\D/g, "") || q } }] } },
            { conversation: { messages: { some: { text: { contains: q, mode: "insensitive" as const }, deletedAt: null } } } },
          ],
        }
      : {}),
  };
}

const PRIORITY_RANK: Record<TicketPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export async function listTickets(f: TicketFilter, me: string, page = 1, pageSize = 30) {
  const where = whereFor(f, me);
  const [rows, total] = await Promise.all([
    db.ticket.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, login: true, avatarUrl: true, lastSeenAt: true, subscriptions: { where: { status: "ACTIVE", currentPeriodEnd: { gt: new Date() } }, take: 1, select: { id: true } } } },
        assignee: { select: { id: true, name: true, login: true } },
        conversation: { select: { id: true, type: true, lastMessageAt: true, lastMessagePreview: true, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { senderId: true, kind: true } } } },
      },
      orderBy: f.view === "resolved" ? [{ resolvedAt: "desc" }] : [{ status: "asc" }, { slaDueAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.ticket.count({ where }),
  ]);
  const items = rows
    .map((t) => ({
      id: t.id,
      number: t.number,
      status: t.status,
      priority: t.priority,
      tags: t.tags,
      subject: t.subject,
      channel: t.channel,
      kind: t.conversation.type,
      conversationId: t.conversation.id,
      customer: { id: t.customer.id, name: t.customer.name ?? t.customer.login, login: t.customer.login, avatarUrl: t.customer.avatarUrl, isPlus: t.customer.subscriptions.length > 0, lastSeenAt: t.customer.lastSeenAt?.toISOString() ?? null },
      assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name ?? t.assignee.login } : null,
      slaDueAt: t.slaDueAt.toISOString(),
      firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
      lastMessageAt: t.conversation.lastMessageAt.toISOString(),
      preview: t.conversation.lastMessagePreview,
      // The customer spoke last → the ball is in support's court.
      awaitingAgent: t.status !== "RESOLVED" && t.conversation.messages[0]?.senderId === t.customerId,
      createdAt: t.createdAt.toISOString(),
    }))
    .sort((a, b) => (f.view === "resolved" ? 0 : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]));
  return { items, total };
}

export async function ticketCounts(me: string) {
  const [open, mine, unassigned, waiting, breached] = await Promise.all([
    db.ticket.count({ where: { status: { in: ["NEW", "IN_PROGRESS"] } } }),
    db.ticket.count({ where: { assigneeId: me, status: { not: "RESOLVED" } } }),
    db.ticket.count({ where: { assigneeId: null, status: { not: "RESOLVED" } } }),
    db.ticket.count({ where: { status: "WAITING_CUSTOMER" } }),
    db.ticket.count({ where: { firstResponseAt: null, status: { not: "RESOLVED" }, slaDueAt: { lt: new Date() } } }),
  ]);
  return { open, mine, unassigned, waiting, breached };
}

/** Ticket + internal notes + the customer side card. */
export async function ticketDetail(ticketId: string) {
  const t = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      notes: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, login: true } } } },
      assignee: { select: { id: true, name: true, login: true } },
      customer: {
        select: {
          id: true, name: true, login: true, phone: true, email: true, avatarUrl: true, createdAt: true, loyaltyTier: true, bonusBalance: true, status: true, chatBannedAt: true, lastSeenAt: true, telegramUsername: true,
          subscriptions: { where: { status: "ACTIVE", currentPeriodEnd: { gt: new Date() } }, take: 1, select: { id: true } },
          shops: { select: { id: true, name: true, slug: true, status: true } },
        },
      },
    },
  });
  if (!t) throw new AppError("notFound");
  const cid = t.customerId;
  const [orders, spend, recentOrders, previous, flags, returns] = await Promise.all([
    db.order.count({ where: { userId: cid } }),
    db.order.aggregate({ _sum: { total: true }, where: { userId: cid, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } } }),
    db.order.findMany({ where: { userId: cid }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, number: true, status: true, total: true, createdAt: true } }),
    db.ticket.findMany({ where: { customerId: cid, NOT: { id: t.id } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, number: true, status: true, subject: true, createdAt: true } }),
    db.fraudFlag.findMany({ where: { userId: cid, status: "OPEN" }, select: { type: true, score: true } }),
    db.return.count({ where: { userId: cid } }),
  ]);
  return {
    ticket: t,
    customer: { ...t.customer, isPlus: t.customer.subscriptions.length > 0, orders, spend: spend._sum.total ?? 0, returns, recentOrders, previous, flags },
  };
}

/** Serializable ticket detail for the support desk (notes + customer card). */
export async function ticketDetailView(ticketId: string) {
  const d = await ticketDetail(ticketId);
  const c = d.customer;
  return {
    notes: d.ticket.notes.map((n) => ({ id: n.id, text: n.text, author: n.author.name ?? n.author.login, createdAt: n.createdAt.toISOString() })),
    customer: {
      id: c.id,
      name: c.name ?? c.login,
      login: c.login,
      phone: c.phone,
      email: c.email,
      telegram: c.telegramUsername,
      since: c.createdAt.toISOString(),
      tier: c.loyaltyTier,
      isPlus: c.isPlus,
      bonus: c.bonusBalance,
      chatBanned: !!c.chatBannedAt,
      orders: c.orders,
      spend: c.spend,
      returns: c.returns,
      shops: c.shops,
      recentOrders: c.recentOrders.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
      previous: c.previous.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
      flags: c.flags,
    },
  };
}

/** Active staff who can take support tickets (for assign / transfer). */
export async function supportAgents() {
  const staff = await db.staffProfile.findMany({
    where: { status: "ACTIVE" },
    include: { user: { select: { id: true, name: true, login: true, lastSeenAt: true } }, role: { include: { permissions: { include: { permission: true } } } }, overrides: { include: { permission: true } } },
  });
  return staff
    .filter((s) => resolvePermissions(s.role.key, s.role.permissions.map((p) => p.permission.key), s.overrides.map((o): Override => ({ permission: o.permission.key as Permission, effect: o.effect }))).has("support.handle"))
    .map((s) => ({ id: s.user.id, name: s.user.name ?? s.user.login, role: s.role.key, lastSeenAt: s.user.lastSeenAt?.toISOString() ?? null }));
}

async function systemMessage(conversationId: string, key: string, values?: Record<string, unknown>) {
  const { toChatMessage } = await import("./chat");
  const m = await db.message.create({
    data: { conversationId, kind: "SYSTEM", source: "SYSTEM", payload: { key, ...(values ? { values } : {}) } as Prisma.InputJsonValue },
    include: { sender: { select: { id: true, name: true, login: true, avatarUrl: true, staffProfile: { select: { id: true } } } }, replyTo: { select: { id: true, text: true, kind: true, deletedAt: true, sender: { select: { name: true, login: true } } } }, attachments: true },
  });
  const members = await db.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
  const message = toChatMessage(m);
  await Promise.all(members.map((x) => publish(`user:${x.userId}`, "chat.message", { conversationId, message, senderId: null })));
  await publish("staff:support", "chat.message", { conversationId, message });
}

export async function updateTicket(staff: StaffContext, ticketId: string, patch: { status?: TicketStatus; priority?: TicketPriority; tags?: string[]; assigneeId?: string | null; subject?: string }) {
  const before = await db.ticket.findUnique({ where: { id: ticketId }, include: { assignee: { select: { name: true, login: true } } } });
  if (!before) throw new AppError("notFound");
  if (patch.assigneeId) {
    const ok = (await supportAgents()).some((a) => a.id === patch.assigneeId);
    if (!ok) throw new AppError("forbidden");
  }
  const t = await db.ticket.update({
    where: { id: ticketId },
    data: {
      ...(patch.status ? { status: patch.status, resolvedAt: patch.status === "RESOLVED" ? new Date() : null } : {}),
      ...(patch.priority ? { priority: patch.priority } : {}),
      ...(patch.tags ? { tags: [...new Set(patch.tags.map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 10) } : {}),
      ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
      ...(patch.subject !== undefined ? { subject: patch.subject.slice(0, 120) } : {}),
    },
    include: { assignee: { select: { name: true, login: true } } },
  });
  if (patch.assigneeId !== undefined && patch.assigneeId !== before.assigneeId) {
    if (patch.assigneeId && patch.assigneeId !== staff.user.id) {
      await db.ticketNote.create({ data: { ticketId, authorId: staff.user.id, text: `→ ${t.assignee?.name ?? t.assignee?.login}` } });
      await notify({ userId: patch.assigneeId, type: "support.assigned", title: `#${t.number}`, body: t.subject ?? "", href: `/admin/support?t=${t.id}` });
    }
  }
  if (patch.status === "RESOLVED" && before.status !== "RESOLVED") {
    await systemMessage(t.conversationId, "support.resolved", { number: t.number });
    await notify({ userId: t.customerId, type: "support.resolved", title: `ANOR Yordam #${t.number}`, body: t.subject ?? "", href: `/chat/${t.conversationId}` });
  }
  if (patch.status === "WAITING_CUSTOMER" && before.status !== "WAITING_CUSTOMER") await systemMessage(t.conversationId, "support.waiting");
  await audit({ actorId: staff.user.id, actorLogin: staff.user.login, action: "support.ticket_update", entityType: "Ticket", entityId: ticketId, before: { status: before.status, priority: before.priority, assigneeId: before.assigneeId, tags: before.tags }, after: { status: t.status, priority: t.priority, assigneeId: t.assigneeId, tags: t.tags } });
  await publish("staff:support", "support.ticket", { ticketId, status: t.status, assigneeId: t.assigneeId });
  return t;
}

export async function addNote(staff: StaffContext, ticketId: string, text: string) {
  const note = await db.ticketNote.create({ data: { ticketId, authorId: staff.user.id, text: text.trim().slice(0, 4000) }, include: { author: { select: { name: true, login: true } } } });
  await publish("staff:support", "support.note", { ticketId, note: { id: note.id, text: note.text, author: note.author.name ?? note.author.login, createdAt: note.createdAt.toISOString() } });
  return note;
}

// ── Canned replies ───────────────────────────────────────────────────────

export const listCanned = () => db.cannedReply.findMany({ orderBy: { shortcut: "asc" } });

export async function saveCanned(staff: StaffContext, input: { id?: string; title: string; shortcut: string; textUz: string; textRu: string }) {
  const shortcut = input.shortcut.trim().toLowerCase().replace(/^\//, "");
  const data = { title: input.title.trim(), shortcut, textUz: input.textUz.trim(), textRu: input.textRu.trim() };
  const dup = await db.cannedReply.findFirst({ where: { shortcut, ...(input.id ? { NOT: { id: input.id } } : {}) } });
  if (dup) throw new AppError("shortcutTaken", undefined, "shortcut");
  const row = input.id ? await db.cannedReply.update({ where: { id: input.id }, data }) : await db.cannedReply.create({ data: { ...data, createdById: staff.user.id } });
  await audit({ actorId: staff.user.id, actorLogin: staff.user.login, action: input.id ? "support.canned_update" : "support.canned_create", entityType: "CannedReply", entityId: row.id });
  return row;
}

export async function deleteCanned(staff: StaffContext, id: string) {
  await db.cannedReply.delete({ where: { id } });
  await audit({ actorId: staff.user.id, actorLogin: staff.user.login, action: "support.canned_delete", entityType: "CannedReply", entityId: id });
}

// ── Broadcasts ───────────────────────────────────────────────────────────

export type Segment = "ALL" | "BUYERS" | "SELLERS" | "PLUS";

export function segmentWhere(segment: Segment): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { status: "ACTIVE", deletedAt: null };
  if (segment === "BUYERS") return { ...base, shops: { none: {} } };
  if (segment === "SELLERS") return { ...base, shops: { some: {} } };
  if (segment === "PLUS") return { ...base, subscriptions: { some: { status: "ACTIVE", currentPeriodEnd: { gt: new Date() } } } };
  return base;
}

export const segmentSize = (segment: Segment) => db.user.count({ where: segmentWhere(segment) });

export async function createBroadcast(staff: StaffContext, input: { segment: Segment; title: string; body: string; href?: string; channels: string[] }) {
  const b = await db.broadcast.create({ data: { authorId: staff.user.id, segment: input.segment, title: input.title, body: input.body, href: input.href || null, channels: input.channels } });
  await audit({ actorId: staff.user.id, actorLogin: staff.user.login, action: "support.broadcast", entityType: "Broadcast", entityId: b.id, meta: { segment: input.segment, channels: input.channels, title: input.title } });
  return b;
}

/** Delivers a broadcast in batches: in-app rows in bulk, external channels through notify(). */
export async function deliverBroadcast(broadcastId: string) {
  const b = await db.broadcast.findUniqueOrThrow({ where: { id: broadcastId } });
  if (b.sentCount > 0) return { sent: b.sentCount };
  const where = segmentWhere(b.segment as Segment);
  const external = b.channels.filter((c) => c !== "inapp") as Array<"email" | "sms" | "telegram" | "push">;
  let cursor: string | undefined;
  let sent = 0;
  for (;;) {
    const users = await db.user.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: 500, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    if (!users.length) break;
    if (external.length) {
      for (const u of users) await notify({ userId: u.id, type: "broadcast", title: b.title, body: b.body, href: b.href ?? undefined, data: { broadcastId: b.id }, channels: external });
    } else {
      await db.notification.createMany({ data: users.map((u) => ({ userId: u.id, type: "broadcast", title: b.title, body: b.body, href: b.href, data: { broadcastId: b.id } })) });
    }
    sent += users.length;
    cursor = users[users.length - 1].id;
  }
  await db.broadcast.update({ where: { id: b.id }, data: { sentCount: sent } });
  // Connected clients refresh their bell; one event instead of one per user.
  await publish("broadcast", "notification.broadcast", { id: b.id, title: b.title, body: b.body, href: b.href, segment: b.segment });
  return { sent };
}
