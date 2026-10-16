import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { publish } from "@/server/realtime/bus";
import { isOwnStorageUrl } from "@/server/storage";
import { canEdit, filterMessage, isOnline, SUPPORT_FIRST_REPLY_MINUTES, type ConversationKind } from "@/lib/chat";
import { Prisma } from "@/generated/prisma/client";
import type { AttachmentKind, MessageKind, MessageSource } from "@/generated/prisma/enums";

// ── Shapes sent to clients ───────────────────────────────────────────────

export type ChatAttachment = { id: string; kind: AttachmentKind; url: string; fileName: string; mimeType: string; size: number; durationSec: number | null; waveform: number[] | null };
export type ChatMessage = {
  id: string;
  conversationId: string;
  kind: MessageKind;
  text: string | null;
  payload: Record<string, unknown> | null;
  source: MessageSource;
  sender: { id: string; name: string; avatarUrl: string | null; isStaff: boolean } | null;
  replyTo: { id: string; text: string | null; kind: MessageKind; senderName: string | null } | null;
  attachments: ChatAttachment[];
  masked: boolean;
  flagged: boolean;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
};
export type Receipt = { userId: string; lastReadAt: string | null; lastDeliveredAt: string | null };

const messageInclude = {
  sender: { select: { id: true, name: true, login: true, avatarUrl: true, staffProfile: { select: { id: true } } } },
  replyTo: { select: { id: true, text: true, kind: true, deletedAt: true, sender: { select: { name: true, login: true } } } },
  attachments: true,
} satisfies Prisma.MessageInclude;

type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

const firstName = (u: { name: string | null; login: string }) => u.name?.split(" ")[0] ?? u.login;

export function toChatMessage(m: MessageRow): ChatMessage {
  const deleted = !!m.deletedAt;
  return {
    id: m.id,
    conversationId: m.conversationId,
    kind: m.kind,
    text: deleted ? null : m.text,
    payload: deleted ? null : ((m.payload as Record<string, unknown> | null) ?? null),
    source: m.source,
    sender: m.sender ? { id: m.sender.id, name: firstName(m.sender), avatarUrl: m.sender.avatarUrl, isStaff: !!m.sender.staffProfile } : null,
    replyTo: m.replyTo ? { id: m.replyTo.id, text: m.replyTo.deletedAt ? null : m.replyTo.text, kind: m.replyTo.kind, senderName: m.replyTo.sender ? firstName(m.replyTo.sender) : null } : null,
    attachments: deleted ? [] : m.attachments.map((a) => ({ id: a.id, kind: a.kind, url: a.url, fileName: a.fileName, mimeType: a.mimeType, size: a.size, durationSec: a.durationSec, waveform: (a.waveform as number[] | null) ?? null })),
    masked: m.masked,
    flagged: m.flagged,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deleted,
  };
}

function previewOf(kind: MessageKind, text: string | null): string {
  if (text) return text.slice(0, 120);
  return { IMAGE: "📷", FILE: "📎", VOICE: "🎤", PRODUCT: "🛍", ORDER: "📦", SYSTEM: "ℹ️", TEXT: "" }[kind];
}

// ── Access ───────────────────────────────────────────────────────────────

export type Actor = { userId: string; staff?: { permissions: Set<string>; login: string } };

const MODERATION_ACCESS_MINUTES = 30;

/** Staff may read a buyer↔seller chat only within 30 minutes of a logged "moderation access". */
export async function hasModerationAccess(staffUserId: string, conversationId: string) {
  const row = await db.auditLog.findFirst({ where: { actorId: staffUserId, action: "chat.moderation_access", entityType: "Conversation", entityId: conversationId, createdAt: { gte: new Date(Date.now() - MODERATION_ACCESS_MINUTES * 60_000) } } });
  return !!row;
}

export async function grantModerationAccess(staff: { userId: string; login: string }, conversationId: string, reason: string) {
  const conv = await db.conversation.findUnique({ where: { id: conversationId }, select: { type: true } });
  if (!conv || conv.type !== "BUYER_SELLER") throw new AppError("notFound");
  await audit({ actorId: staff.userId, actorLogin: staff.login, action: "chat.moderation_access", entityType: "Conversation", entityId: conversationId, meta: { reason, minutes: MODERATION_ACCESS_MINUTES } });
}

/** Resolve what an actor may do in a conversation. Throws when they may not even read it. */
export async function access(actor: Actor, conversationId: string) {
  const conv = await db.conversation.findUnique({ where: { id: conversationId }, include: { members: { include: { user: { select: { id: true, name: true, login: true, avatarUrl: true, lastSeenAt: true, chatBannedAt: true } } } }, ticket: true, shop: { select: { id: true, name: true, slug: true, logoUrl: true, ownerId: true } } } });
  if (!conv) throw new AppError("notFound");
  const member = conv.members.find((m) => m.userId === actor.userId) ?? null;
  const isSupportKind = conv.type === "SUPPORT" || conv.type === "SELLER_SUPPORT";
  const agent = !!actor.staff && isSupportKind && actor.staff.permissions.has("support.handle");
  const moderator = !!actor.staff && conv.type === "BUYER_SELLER" && actor.staff.permissions.has("chat.moderate") && (await hasModerationAccess(actor.userId, conversationId));
  if (!member && !agent && !moderator) throw new AppError("forbidden");
  return { conv, member, agent, moderator, canWrite: !!member || agent };
}

// ── Conversations ────────────────────────────────────────────────────────

async function addSystemMessage(conversationId: string, key: string, values?: Record<string, unknown>, source: MessageSource = "SYSTEM") {
  const payload = { key, ...(values ? { values } : {}) } as Prisma.InputJsonValue;
  const m = await db.message.create({ data: { conversationId, kind: "SYSTEM", source, payload }, include: messageInclude });
  await broadcastMessage(conversationId, toChatMessage(m), null);
  return m;
}

/** The customer's active support conversation (creates one with a welcome message). */
export async function openSupport(userId: string, kind: "SUPPORT" | "SELLER_SUPPORT" = "SUPPORT") {
  const existing = await db.conversation.findFirst({
    where: { type: kind, members: { some: { userId, role: "CUSTOMER" } }, OR: [{ ticket: { is: null } }, { ticket: { status: { not: "RESOLVED" } } }] },
    orderBy: { lastMessageAt: "desc" },
  });
  if (existing) return existing.id;
  const conv = await db.conversation.create({ data: { type: kind, lastMessagePreview: null, members: { create: { userId, role: "CUSTOMER", isPinned: true } } } });
  await addSystemMessage(conv.id, kind === "SUPPORT" ? "support.welcome" : "support.sellerWelcome", { minutes: SUPPORT_FIRST_REPLY_MINUTES }, "BOT");
  return conv.id;
}

/** One buyer↔shop thread; opening it from a product/order posts that card once. */
export async function openShopChat(buyerId: string, shopId: string, ctx: { productId?: string; orderId?: string } = {}) {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { id: true, ownerId: true, status: true } });
  if (!shop || shop.status !== "APPROVED") throw new AppError("notFound");
  if (shop.ownerId === buyerId) throw new AppError("chatOwnShop");
  let conv = await db.conversation.findFirst({ where: { type: "BUYER_SELLER", shopId, members: { some: { userId: buyerId, role: "CUSTOMER" } } } });
  if (!conv) {
    conv = await db.conversation.create({
      data: { type: "BUYER_SELLER", shopId, productId: ctx.productId, orderId: ctx.orderId, members: { create: [{ userId: buyerId, role: "CUSTOMER" }, { userId: shop.ownerId, role: "SELLER" }] } },
    });
  } else {
    await db.conversationMember.updateMany({ where: { conversationId: conv.id, userId: buyerId }, data: { hiddenAt: null } });
  }
  if (ctx.productId || ctx.orderId) await postContextCard(conv.id, buyerId, ctx);
  return conv.id;
}

async function postContextCard(conversationId: string, senderId: string, ctx: { productId?: string; orderId?: string }) {
  const last = await db.message.findFirst({ where: { conversationId, kind: { in: ["PRODUCT", "ORDER"] } }, orderBy: { createdAt: "desc" } });
  const lastRef = (last?.payload as { id?: string } | null)?.id;
  if (ctx.orderId) {
    const o = await db.order.findFirst({ where: { id: ctx.orderId, userId: senderId }, include: { items: { take: 1 } } });
    if (!o || lastRef === o.id) return;
    await sendMessage({ userId: senderId }, conversationId, { kind: "ORDER", payload: { id: o.id, number: o.number, status: o.status, total: o.total, items: o.items.length, imageUrl: o.items[0]?.imageUrl ?? null, title: o.items[0]?.title ?? "" } });
  } else if (ctx.productId) {
    const p = await db.product.findUnique({ where: { id: ctx.productId }, include: { media: { take: 1, orderBy: { sort: "asc" } } } });
    if (!p || lastRef === p.id) return;
    await sendMessage({ userId: senderId }, conversationId, { kind: "PRODUCT", payload: { id: p.id, slug: p.slug, title: p.titleUz, titleRu: p.titleRu, price: p.price, imageUrl: p.media[0]?.url ?? null } });
  }
}

export type ListItem = {
  id: string;
  kind: ConversationKind;
  role: string;
  title: string;
  subtitle: string | null;
  avatarUrl: string | null;
  online: boolean;
  lastSeenAt: string | null;
  lastMessageAt: string;
  preview: string | null;
  unread: number;
  pinned: boolean;
  muted: boolean;
  ticket: { number: number; status: string } | null;
  shopId: string | null;
};

export async function listConversations(userId: string, opts: { q?: string; shopOnly?: boolean } = {}): Promise<ListItem[]> {
  let ids: string[] | undefined;
  if (opts.q && opts.q.trim().length >= 2) {
    const q = opts.q.trim();
    const hits = await db.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT m."conversationId" AS id FROM "Message" m
      JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId}
      WHERE m."deletedAt" IS NULL AND m.text ILIKE ${"%" + q + "%"} LIMIT 50`;
    const byName = await db.conversation.findMany({
      where: { members: { some: { userId } }, OR: [{ shop: { name: { contains: q, mode: "insensitive" } } }, { members: { some: { userId: { not: userId }, user: { OR: [{ name: { contains: q, mode: "insensitive" } }, { login: { contains: q.toLowerCase() } }] } } } }] },
      select: { id: true },
    });
    ids = [...new Set([...hits.map((h) => h.id), ...byName.map((c) => c.id)])];
  }
  const rows = await db.conversationMember.findMany({
    where: {
      userId,
      hiddenAt: null,
      ...(ids ? { conversationId: { in: ids } } : {}),
      // Seller cabinet: the shop's buyer threads plus the seller↔support thread.
      ...(opts.shopOnly ? { OR: [{ role: "SELLER" }, { conversation: { type: "SELLER_SUPPORT" } }] } : {}),
      conversation: { type: { not: "STAFF_CHANNEL" } },
    },
    include: {
      conversation: {
        include: {
          shop: { select: { name: true, logoUrl: true, owner: { select: { lastSeenAt: true } } } },
          ticket: { select: { number: true, status: true } },
          members: { where: { userId: { not: userId } }, include: { user: { select: { name: true, login: true, avatarUrl: true, lastSeenAt: true } } } },
        },
      },
    },
    orderBy: [{ isPinned: "desc" }, { conversation: { lastMessageAt: "desc" } }],
    take: 100,
  });
  return rows.map((m) => {
    const c = m.conversation;
    const other = c.members.find((x) => x.role !== "AGENT")?.user ?? c.members[0]?.user ?? null;
    const asSeller = m.role === "SELLER";
    const isSupport = c.type === "SUPPORT" || c.type === "SELLER_SUPPORT";
    const title = isSupport ? "" : asSeller ? (other?.name ?? other?.login ?? "—") : (c.shop?.name ?? "—");
    const lastSeen = isSupport ? null : asSeller ? other?.lastSeenAt : c.shop?.owner.lastSeenAt;
    return {
      id: c.id,
      kind: c.type,
      role: m.role,
      title,
      subtitle: asSeller ? (c.shop?.name ?? null) : null,
      avatarUrl: isSupport ? null : asSeller ? (other?.avatarUrl ?? null) : (c.shop?.logoUrl ?? null),
      online: isSupport ? true : isOnline(lastSeen),
      lastSeenAt: lastSeen?.toISOString() ?? null,
      lastMessageAt: c.lastMessageAt.toISOString(),
      preview: c.lastMessagePreview,
      unread: m.unreadCount,
      pinned: m.isPinned,
      muted: !!m.mutedUntil && m.mutedUntil > new Date(),
      ticket: c.ticket,
      shopId: c.shopId,
    };
  });
}

export async function loadMessages(conversationId: string, opts: { before?: string; limit?: number } = {}) {
  const limit = opts.limit ?? 40;
  const before = opts.before ? await db.message.findUnique({ where: { id: opts.before }, select: { createdAt: true } }) : null;
  const rows = await db.message.findMany({ where: { conversationId, ...(before ? { createdAt: { lt: before.createdAt } } : {}) }, include: messageInclude, orderBy: { createdAt: "desc" }, take: limit + 1 });
  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse().map(toChatMessage), hasMore };
}

/** Header + receipts + first page for a thread, from the actor's point of view. */
export async function openThread(actor: Actor, conversationId: string) {
  const a = await access(actor, conversationId);
  const { conv, member } = a;
  const page = await loadMessages(conversationId);
  const others = conv.members.filter((m) => m.userId !== actor.userId);
  const counterpart = others.find((m) => m.role !== "AGENT") ?? others[0] ?? null;
  const asSeller = member?.role === "SELLER";
  const isSupport = conv.type === "SUPPORT" || conv.type === "SELLER_SUPPORT";
  const blocked = conv.type === "BUYER_SELLER" && counterpart ? await isBlockedBetween(actor.userId, counterpart.userId) : { byMe: false, byThem: false };
  const peerSeen = isSupport && !a.agent ? null : asSeller || a.agent || a.moderator ? counterpart?.user.lastSeenAt : conv.shop ? (await db.user.findUnique({ where: { id: conv.shop.ownerId }, select: { lastSeenAt: true } }))?.lastSeenAt : null;
  let product: { id: string; slug: string; title: string } | null = null;
  if (conv.productId) {
    const p = await db.product.findUnique({ where: { id: conv.productId }, select: { id: true, slug: true, titleUz: true } });
    if (p) product = { id: p.id, slug: p.slug, title: p.titleUz };
  }
  return {
    conversation: {
      id: conv.id,
      kind: conv.type as ConversationKind,
      title: isSupport ? (a.agent ? (counterpart?.user.name ?? counterpart?.user.login ?? "—") : "") : asSeller || a.moderator ? (counterpart?.user.name ?? counterpart?.user.login ?? "—") : (conv.shop?.name ?? "—"),
      avatarUrl: isSupport ? null : asSeller ? (counterpart?.user.avatarUrl ?? null) : (conv.shop?.logoUrl ?? null),
      shop: conv.shop ? { id: conv.shop.id, slug: conv.shop.slug, name: conv.shop.name } : null,
      product,
      online: isSupport && !a.agent ? true : isOnline(peerSeen),
      lastSeenAt: peerSeen?.toISOString() ?? null,
      ticket: conv.ticket ? { id: conv.ticket.id, number: conv.ticket.number, status: conv.ticket.status } : null,
      myRole: member?.role ?? (a.agent ? "AGENT" : "MODERATOR"),
      pinned: member?.isPinned ?? false,
      muted: !!member?.mutedUntil && member.mutedUntil > new Date(),
      canWrite: a.canWrite && !blocked.byMe && !blocked.byThem && !conv.members.find((m) => m.userId === actor.userId)?.user.chatBannedAt,
      blocked,
      counterpartId: counterpart?.userId ?? null,
    },
    receipts: others.map((m): Receipt => ({ userId: m.userId, lastReadAt: m.lastReadAt?.toISOString() ?? null, lastDeliveredAt: m.lastDeliveredAt?.toISOString() ?? null })),
    ...page,
  };
}

async function isBlockedBetween(me: string, them: string) {
  const rows = await db.userBlock.findMany({ where: { OR: [{ blockerId: me, blockedId: them }, { blockerId: them, blockedId: me }] } });
  return { byMe: rows.some((r) => r.blockerId === me), byThem: rows.some((r) => r.blockerId === them) };
}

// ── Messages ─────────────────────────────────────────────────────────────

export type SendInput = {
  kind?: MessageKind;
  text?: string;
  payload?: Record<string, unknown>;
  replyToId?: string;
  attachments?: Array<{ url: string; fileName: string; mimeType: string; size: number; kind: AttachmentKind; durationSec?: number; waveform?: number[] }>;
  source?: MessageSource;
};

/** Fan a message out to every member (and the support desk for support threads). */
async function broadcastMessage(conversationId: string, message: ChatMessage, senderId: string | null, type = "chat.message") {
  const conv = await db.conversation.findUnique({ where: { id: conversationId }, select: { type: true, members: { select: { userId: true } }, ticket: { select: { id: true } } } });
  if (!conv) return;
  await Promise.all(conv.members.map((m) => publish(`user:${m.userId}`, type, { conversationId, message, senderId })));
  if (conv.type === "SUPPORT" || conv.type === "SELLER_SUPPORT") await publish("staff:support", type, { conversationId, message, ticketId: conv.ticket?.id ?? null });
}

export async function sendMessage(actor: Actor, conversationId: string, input: SendInput): Promise<{ message: ChatMessage; conversationId: string }> {
  let a = await access(actor, conversationId);
  if (!a.canWrite) throw new AppError("forbidden");
  const kind = input.kind ?? (input.attachments?.[0] ? (input.attachments[0].kind === "VOICE" ? "VOICE" : input.attachments[0].kind === "IMAGE" || input.attachments[0].kind === "VIDEO" ? "IMAGE" : "FILE") : "TEXT");
  const sender = await db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { chatBannedAt: true, name: true, login: true } });
  if (sender.chatBannedAt) throw new AppError("chatBanned");
  const isSupport = a.conv.type === "SUPPORT" || a.conv.type === "SELLER_SUPPORT";
  const fromCustomer = a.member?.role === "CUSTOMER";

  if (a.conv.type === "BUYER_SELLER") {
    const other = a.conv.members.find((m) => m.userId !== actor.userId);
    if (other) {
      const b = await isBlockedBetween(actor.userId, other.userId);
      if (b.byMe || b.byThem) throw new AppError("chatBlocked");
    }
  }

  // A customer writing into a resolved support thread starts a new ticket in a fresh thread.
  if (isSupport && fromCustomer && a.conv.ticket?.status === "RESOLVED") {
    const fresh = await db.conversation.create({ data: { type: a.conv.type, members: { create: { userId: actor.userId, role: "CUSTOMER", isPinned: true } } } });
    await db.conversationMember.updateMany({ where: { conversationId, userId: actor.userId }, data: { isPinned: false } });
    conversationId = fresh.id;
    a = await access(actor, conversationId);
  }

  const recent = input.text ? (await db.message.findMany({ where: { senderId: actor.userId, createdAt: { gte: new Date(Date.now() - 120_000) } }, select: { text: true }, take: 5, orderBy: { createdAt: "desc" } })).map((m) => m.text ?? "") : [];
  const filtered = input.text ? filterMessage(input.text, a.conv.type as ConversationKind, recent) : { text: null, masked: false, flagged: false, reasons: [] as string[] };
  const files = (input.attachments ?? []).filter((f) => isOwnStorageUrl(f.url) && f.url.includes("/chat/")).slice(0, 10);
  if (!filtered.text && !files.length && !input.payload) throw new AppError("emptyMessage");
  if (input.replyToId) {
    const r = await db.message.findUnique({ where: { id: input.replyToId }, select: { conversationId: true } });
    if (r?.conversationId !== conversationId) input.replyToId = undefined;
  }

  const row = await db.message.create({
    data: {
      conversationId,
      senderId: actor.userId,
      kind,
      text: filtered.text || null,
      payload: input.payload as Prisma.InputJsonValue | undefined,
      replyToId: input.replyToId,
      source: input.source ?? "WEB",
      masked: filtered.masked,
      flagged: filtered.flagged,
      attachments: files.length ? { create: files.map((f) => ({ uploaderId: actor.userId, kind: f.kind, url: f.url, fileName: f.fileName.slice(0, 200), mimeType: f.mimeType, size: f.size, durationSec: f.durationSec, waveform: f.waveform, scanStatus: "CLEAN" as const })) } : undefined,
    },
    include: messageInclude,
  });
  const preview = previewOf(kind, filtered.text);
  await db.$transaction([
    db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: row.createdAt, lastMessagePreview: preview } }),
    db.conversationMember.updateMany({ where: { conversationId, userId: { not: actor.userId } }, data: { unreadCount: { increment: 1 }, hiddenAt: null } }),
    db.conversationMember.updateMany({ where: { conversationId, userId: actor.userId }, data: { lastReadAt: row.createdAt, unreadCount: 0, hiddenAt: null } }),
  ]);

  // Agents join the thread on their first reply so they get receipts and unread counts.
  if (a.agent && !a.member) await db.conversationMember.create({ data: { conversationId, userId: actor.userId, role: "AGENT", lastReadAt: row.createdAt } }).catch(() => {});

  if (isSupport) await updateTicketOnMessage(conversationId, actor, fromCustomer, filtered.text ?? preview, input.source);

  const message = toChatMessage(row);
  await broadcastMessage(conversationId, message, actor.userId);
  const recipients = await db.conversationMember.findMany({ where: { conversationId, userId: { not: actor.userId } }, select: { userId: true } });
  await Promise.all(recipients.map(async (r) => publish(`user:${r.userId}`, "chat.unread", { total: await unreadTotal(r.userId) })));
  // Agent replies on threads the customer started in Telegram are sent back there.
  const bridged = isSupport && !fromCustomer ? await (await import("@/server/telegram/bot")).bridgeSupportReply(conversationId, filtered.text).catch(() => false) : false;
  await notifyRecipients(conversationId, actor.userId, message, sender.name ?? sender.login, bridged);
  if (isSupport && fromCustomer) void maybeBotReply(conversationId, filtered.text ?? "");
  return { message, conversationId };
}

async function updateTicketOnMessage(conversationId: string, actor: Actor, fromCustomer: boolean, text: string, source?: MessageSource) {
  const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { ticket: true, members: { where: { role: "CUSTOMER" } } } });
  let t = conv.ticket;
  if (!t && fromCustomer) {
    // Sellers and Plus members get priority support.
    const plus = await db.subscription.count({ where: { userId: actor.userId, status: "ACTIVE", currentPeriodEnd: { gt: new Date() } } });
    t = await db.ticket.create({ data: { conversationId, customerId: actor.userId, subject: text.slice(0, 80), slaDueAt: new Date(Date.now() + SUPPORT_FIRST_REPLY_MINUTES * (plus ? 0.5 : 1) * 60_000), priority: conv.type === "SELLER_SUPPORT" || plus ? "HIGH" : "NORMAL", channel: source === "TELEGRAM" ? "TELEGRAM" : "WEB" } });
  } else if (t && fromCustomer && t.status === "WAITING_CUSTOMER") {
    t = await db.ticket.update({ where: { id: t.id }, data: { status: "IN_PROGRESS" } });
  } else if (t && !fromCustomer && actor.staff) {
    t = await db.ticket.update({
      where: { id: t.id },
      data: { firstResponseAt: t.firstResponseAt ?? new Date(), status: t.status === "NEW" ? "IN_PROGRESS" : t.status, assigneeId: t.assigneeId ?? actor.userId },
    });
  }
  if (t) await publish("staff:support", "support.ticket", { ticketId: t.id, status: t.status, assigneeId: t.assigneeId });
}

/** Offline recipients get one notification per unread streak (not one per message). */
async function notifyRecipients(conversationId: string, senderId: string, m: ChatMessage, senderName: string, bridged = false) {
  const members = await db.conversationMember.findMany({ where: { conversationId, userId: { not: senderId } }, include: { user: { select: { lastSeenAt: true } }, conversation: { select: { type: true, shop: { select: { name: true } } } } } });
  for (const r of members) {
    if (r.role === "AGENT") continue;
    if (r.mutedUntil && r.mutedUntil > new Date()) continue;
    if (r.unreadCount > 1 || isOnline(r.user.lastSeenAt)) continue;
    const support = r.conversation.type === "SUPPORT" || r.conversation.type === "SELLER_SUPPORT";
    const title = support ? "ANOR Yordam" : r.role === "SELLER" ? senderName : (r.conversation.shop?.name ?? senderName);
    await notify({ userId: r.userId, type: "chat.message", title, body: (m.text ?? previewOf(m.kind, null)).slice(0, 140), href: r.role === "SELLER" ? `/seller/chats?c=${conversationId}` : `/chat/${conversationId}`, channels: bridged ? ["push"] : ["push", "telegram"] });
  }
}

export async function editMessage(actor: Actor, messageId: string, text: string) {
  const m = await db.message.findUnique({ where: { id: messageId }, include: { conversation: { select: { type: true } } } });
  if (!m || m.senderId !== actor.userId || m.deletedAt || m.kind !== "TEXT") throw new AppError("forbidden");
  if (!canEdit(m.createdAt)) throw new AppError("editWindow");
  const f = filterMessage(text, m.conversation.type as ConversationKind);
  if (!f.text) throw new AppError("emptyMessage");
  const row = await db.message.update({ where: { id: messageId }, data: { text: f.text, masked: m.masked || f.masked, flagged: m.flagged || f.flagged, editedAt: new Date() }, include: messageInclude });
  await broadcastMessage(m.conversationId, toChatMessage(row), actor.userId, "chat.update");
}

export async function deleteMessage(actor: Actor, messageId: string, opts: { moderator?: boolean } = {}) {
  const m = await db.message.findUnique({ where: { id: messageId } });
  if (!m || m.deletedAt) throw new AppError("notFound");
  if (!opts.moderator && m.senderId !== actor.userId) throw new AppError("forbidden");
  const row = await db.message.update({ where: { id: messageId }, data: { deletedAt: new Date(), text: null, payload: Prisma.DbNull }, include: messageInclude });
  await db.attachment.deleteMany({ where: { messageId } });
  await broadcastMessage(m.conversationId, toChatMessage({ ...row, attachments: [] }), actor.userId, "chat.update");
}

export async function markRead(userId: string, conversationId: string) {
  const now = new Date();
  const res = await db.conversationMember.updateMany({ where: { conversationId, userId }, data: { lastReadAt: now, lastDeliveredAt: now, unreadCount: 0 } });
  if (!res.count) return;
  const members = await db.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
  const receipt: Receipt = { userId, lastReadAt: now.toISOString(), lastDeliveredAt: now.toISOString() };
  await Promise.all(members.filter((m) => m.userId !== userId).map((m) => publish(`user:${m.userId}`, "chat.receipt", { conversationId, receipt })));
  await publish(`user:${userId}`, "chat.unread", { total: await unreadTotal(userId) });
}

/** Called when a client connects or receives messages: everything up to now is delivered. */
export async function markDelivered(userId: string) {
  const now = new Date();
  const pending = await db.conversationMember.findMany({ where: { userId, unreadCount: { gt: 0 } }, select: { conversationId: true } });
  if (!pending.length) return;
  await db.conversationMember.updateMany({ where: { userId, unreadCount: { gt: 0 } }, data: { lastDeliveredAt: now } });
  for (const p of pending) {
    const others = await db.conversationMember.findMany({ where: { conversationId: p.conversationId, userId: { not: userId } }, select: { userId: true } });
    const receipt: Receipt = { userId, lastReadAt: null, lastDeliveredAt: now.toISOString() };
    await Promise.all(others.map((o) => publish(`user:${o.userId}`, "chat.receipt", { conversationId: p.conversationId, receipt })));
  }
}

export async function unreadTotal(userId: string) {
  const agg = await db.conversationMember.aggregate({ _sum: { unreadCount: true }, where: { userId, hiddenAt: null } });
  return agg._sum.unreadCount ?? 0;
}

export async function typing(actor: Actor, conversationId: string, name: string) {
  const a = await access(actor, conversationId);
  await Promise.all(a.conv.members.filter((m) => m.userId !== actor.userId).map((m) => publish(`user:${m.userId}`, "chat.typing", { conversationId, userId: actor.userId, name })));
  if (a.conv.type !== "BUYER_SELLER") await publish("staff:support", "chat.typing", { conversationId, userId: actor.userId, name });
}

export async function setMemberFlags(userId: string, conversationId: string, data: { pinned?: boolean; muteHours?: number | null; hidden?: boolean }) {
  await db.conversationMember.updateMany({
    where: { conversationId, userId },
    data: {
      ...(data.pinned !== undefined ? { isPinned: data.pinned } : {}),
      ...(data.muteHours !== undefined ? { mutedUntil: data.muteHours ? new Date(Date.now() + data.muteHours * 3_600_000) : null } : {}),
      ...(data.hidden ? { hiddenAt: new Date() } : {}),
    },
  });
}

export async function reportMessage(userId: string, messageId: string, reason: string) {
  const m = await db.message.findUnique({ where: { id: messageId }, include: { conversation: { include: { members: { select: { userId: true } } } } } });
  if (!m || !m.conversation.members.some((x) => x.userId === userId) || m.senderId === userId) throw new AppError("forbidden");
  await db.chatReport.create({ data: { messageId, reporterId: userId, reason } });
  await db.message.update({ where: { id: messageId }, data: { flagged: true } });
}

export async function blockUser(userId: string, otherId: string, block: boolean) {
  if (userId === otherId) throw new AppError("forbidden");
  if (block) await db.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: userId, blockedId: otherId } }, create: { blockerId: userId, blockedId: otherId }, update: {} });
  else await db.userBlock.deleteMany({ where: { blockerId: userId, blockedId: otherId } });
}

// ── First-line bot ───────────────────────────────────────────────────────

const BOT_TOPICS: Array<{ re: RegExp; slugs: string[] }> = [
  { re: /qaytar|возврат|вернуть|return/i, slugs: ["returns"] },
  { re: /yetkaz|kuryer|qachon keladi|доставк|курьер|когда привез/i, slugs: ["delivery", "pickup-points"] },
  { re: /to.?lov|karta|click|payme|оплат|карт/i, slugs: ["payment"] },
  { re: /nasiya|muddatli|рассрочк|насия/i, slugs: ["nasiya"] },
  { re: /bekor|отмен/i, slugs: ["cancel-order"] },
  { re: /promo|kupon|промокод|купон/i, slugs: ["promo-codes"] },
];

/** Before an agent answers, suggest matching help-center articles (once per ticket). */
async function maybeBotReply(conversationId: string, text: string) {
  try {
    const conv = await db.conversation.findUnique({ where: { id: conversationId }, include: { ticket: true } });
    if (!conv?.ticket || conv.ticket.firstResponseAt) return;
    const already = await db.message.count({ where: { conversationId, source: "BOT", kind: "SYSTEM", createdAt: { gte: conv.ticket.createdAt } } });
    if (already) return;
    const slugs = [...new Set(BOT_TOPICS.filter((t) => t.re.test(text)).flatMap((t) => t.slugs))];
    const articles = slugs.length ? await db.helpArticle.findMany({ where: { slug: { in: slugs }, isPublished: true }, select: { slug: true, titleUz: true, titleRu: true, bodyUz: true, bodyRu: true } }) : [];
    const links = articles.map(({ slug, titleUz, titleRu }) => ({ slug, titleUz, titleRu }));
    // With Gemini configured the bot answers from the help center; it never decides refunds or asks for card data.
    const { aiEnabled, generate } = await import("@/server/ai/gemini");
    if (aiEnabled() && text.trim().length > 8) {
      const pool = articles.length ? articles : await db.helpArticle.findMany({ where: { isPublished: true }, select: { slug: true, titleUz: true, titleRu: true, bodyUz: true, bodyRu: true }, take: 12 });
      const answer = await generate([{ text: `Customer: ${text.slice(0, 800)}\n\nHelp articles:\n${pool.map((a) => `## ${a.titleUz} / ${a.titleRu}\n${a.bodyUz.slice(0, 600)}\n${a.bodyRu.slice(0, 600)}`).join("\n\n")}` }], {
        system: "You are ANOR marketplace's first-line support assistant. Reply in the customer's language (Uzbek or Russian), 2-4 short sentences, using only the help articles. If they don't cover the question, say an operator will reply soon. Never promise refunds or compensation, never ask for card numbers, codes or passwords.",
        temperature: 0.2,
      });
      if (answer) return void (await addSystemMessage(conversationId, "bot.ai", { text: answer.trim().slice(0, 1200), articles: links, minutes: SUPPORT_FIRST_REPLY_MINUTES }, "BOT"));
    }
    await addSystemMessage(conversationId, links.length ? "bot.suggest" : "bot.queued", { articles: links, minutes: SUPPORT_FIRST_REPLY_MINUTES }, "BOT");
  } catch {
    /* the bot is best-effort */
  }
}
