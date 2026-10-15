"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { action, AppError, zInt } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { enqueue } from "@/server/jobs/enqueue";
import { isOnline } from "@/lib/chat";
import {
  blockUser,
  deleteMessage,
  editMessage,
  grantModerationAccess,
  listConversations,
  loadMessages,
  markDelivered,
  markRead,
  openThread,
  reportMessage,
  sendMessage,
  setMemberFlags,
  typing,
  access,
  type Actor,
} from "@/server/services/chat";
import { addNote, createBroadcast, deleteCanned, listTickets, saveCanned, segmentSize, ticketCounts, ticketDetailView, updateTicket } from "@/server/services/support";
import type { StaffContext } from "@/server/auth/session";

const zAttachment = z.object({
  url: z.string().max(500),
  fileName: z.string().max(200),
  mimeType: z.string().max(120),
  size: zInt(0, 60 * 1024 * 1024),
  kind: z.enum(["IMAGE", "FILE", "VOICE", "VIDEO"]),
  durationSec: z.number().min(0).max(600).optional(),
  waveform: z.array(z.number().min(0).max(1)).max(64).optional(),
});
const zSend = z.object({
  conversationId: z.string(),
  text: z.string().max(4000).optional(),
  replyToId: z.string().optional(),
  attachments: z.array(zAttachment).max(10).optional(),
});
const chatRl = { key: "chat.send", ...LIMITS.chatSend };

const staffActor = (s: StaffContext): Actor => ({ userId: s.user.id, staff: { permissions: s.permissions as Set<string>, login: s.user.login } });

// ── Buyers and sellers ───────────────────────────────────────────────────

export const listChatsAction = action({ schema: z.object({ q: z.string().max(100).optional(), shopOnly: z.boolean().optional() }) }, async (input, ctx) => ({ ok: true, data: await listConversations(ctx.user.id, input) }));

export const openThreadAction = action({ schema: z.object({ conversationId: z.string() }) }, async (input, ctx) => {
  const data = await openThread({ userId: ctx.user.id }, input.conversationId);
  await markRead(ctx.user.id, input.conversationId);
  return { ok: true, data };
});

export const loadOlderAction = action({ schema: z.object({ conversationId: z.string(), before: z.string() }) }, async (input, ctx) => {
  await access({ userId: ctx.user.id }, input.conversationId);
  return { ok: true, data: await loadMessages(input.conversationId, { before: input.before }) };
});

export const sendMessageAction = action({ rateLimit: chatRl, schema: zSend }, async (input, ctx) => ({ ok: true, data: await sendMessage({ userId: ctx.user.id }, input.conversationId, input) }));

export const editMessageAction = action({ rateLimit: chatRl, schema: z.object({ messageId: z.string(), text: z.string().min(1).max(4000) }) }, async (input, ctx) => {
  await editMessage({ userId: ctx.user.id }, input.messageId, input.text);
});

export const deleteMessageAction = action({ schema: z.object({ messageId: z.string() }) }, async (input, ctx) => {
  await deleteMessage({ userId: ctx.user.id }, input.messageId);
});

export const markReadAction = action({ schema: z.object({ conversationId: z.string() }) }, async (input, ctx) => {
  await markRead(ctx.user.id, input.conversationId);
});

export const markDeliveredAction = action({}, async (_input, ctx) => {
  await markDelivered(ctx.user.id);
});

export const typingAction = action({ rateLimit: { key: "chat.typing", limit: 40, window: 60 }, schema: z.object({ conversationId: z.string() }) }, async (input, ctx) => {
  await typing({ userId: ctx.user.id }, input.conversationId, ctx.user.name?.split(" ")[0] ?? ctx.user.login);
});

export const chatFlagsAction = action({ schema: z.object({ conversationId: z.string(), pinned: z.boolean().optional(), muteHours: z.number().int().min(0).max(24 * 365).nullable().optional(), hidden: z.boolean().optional() }) }, async (input, ctx) => {
  await setMemberFlags(ctx.user.id, input.conversationId, input);
});

export const reportMessageAction = action({ rateLimit: { key: "chat.report", limit: 20, window: 3600 }, schema: z.object({ messageId: z.string(), reason: z.enum(["spam", "offensive", "fraud", "personal", "other"]) }) }, async (input, ctx) => {
  await reportMessage(ctx.user.id, input.messageId, input.reason);
});

export const blockUserAction = action({ schema: z.object({ userId: z.string(), block: z.boolean() }) }, async (input, ctx) => {
  await blockUser(ctx.user.id, input.userId, input.block);
});

export const presenceAction = action({ auth: "public", schema: z.object({ userId: z.string() }) }, async (input, ctx) => {
  if (!ctx.user && !ctx.staff) throw new AppError("unauthorized");
  const u = await db.user.findUnique({ where: { id: input.userId }, select: { lastSeenAt: true } });
  return { ok: true, data: { online: isOnline(u?.lastSeenAt), lastSeenAt: u?.lastSeenAt?.toISOString() ?? null } };
});

// ── Support desk (staff) ─────────────────────────────────────────────────

const supportOpts = { auth: "staff" as const, permission: "support.handle" as const };

export const staffOpenThreadAction = action({ auth: "staff", schema: z.object({ conversationId: z.string() }) }, async (input, ctx) => {
  const data = await openThread(staffActor(ctx.staff), input.conversationId);
  if (data.conversation.myRole === "AGENT") await markRead(ctx.staff.user.id, input.conversationId);
  return { ok: true, data };
});

export const staffLoadOlderAction = action({ auth: "staff", schema: z.object({ conversationId: z.string(), before: z.string() }) }, async (input, ctx) => {
  await access(staffActor(ctx.staff), input.conversationId);
  return { ok: true, data: await loadMessages(input.conversationId, { before: input.before }) };
});

export const staffSendAction = action({ ...supportOpts, rateLimit: chatRl, schema: zSend }, async (input, ctx) => ({ ok: true, data: await sendMessage(staffActor(ctx.staff), input.conversationId, input) }));

export const staffEditAction = action({ ...supportOpts, schema: z.object({ messageId: z.string(), text: z.string().min(1).max(4000) }) }, async (input, ctx) => {
  await editMessage(staffActor(ctx.staff), input.messageId, input.text);
});

export const staffDeleteAction = action({ auth: "staff", schema: z.object({ messageId: z.string() }) }, async (input, ctx) => {
  const m = await db.message.findUnique({ where: { id: input.messageId }, select: { senderId: true, conversationId: true } });
  if (!m) throw new AppError("notFound");
  // Own messages, or moderators removing content from a chat they have logged access to.
  const moderator = m.senderId !== ctx.staff.user.id && (await access(staffActor(ctx.staff), m.conversationId)).moderator;
  await deleteMessage(staffActor(ctx.staff), input.messageId, { moderator });
});

export const staffTypingAction = action({ ...supportOpts, rateLimit: { key: "chat.typing", limit: 40, window: 60 }, schema: z.object({ conversationId: z.string() }) }, async (input, ctx) => {
  await typing(staffActor(ctx.staff), input.conversationId, ctx.staff.user.name?.split(" ")[0] ?? ctx.staff.user.login);
});

export const staffMarkReadAction = action({ auth: "staff", schema: z.object({ conversationId: z.string() }) }, async (input, ctx) => {
  await markRead(ctx.staff.user.id, input.conversationId);
});

const zFilter = z.object({
  view: z.enum(["open", "mine", "unassigned", "waiting", "resolved", "all"]).default("open"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  tag: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
  kind: z.enum(["SUPPORT", "SELLER_SUPPORT"]).optional(),
  page: zInt(1, 1000).default(1),
});

export const listTicketsAction = action({ ...supportOpts, schema: zFilter }, async (input, ctx) => {
  const [list, counts] = await Promise.all([listTickets(input, ctx.staff.user.id, input.page), ticketCounts(ctx.staff.user.id)]);
  return { ok: true, data: { ...list, counts } };
});

export const ticketDetailAction = action({ ...supportOpts, schema: z.object({ ticketId: z.string() }) }, async (input) => ({ ok: true, data: await ticketDetailView(input.ticketId) }));

export const updateTicketAction = action(
  { ...supportOpts, schema: z.object({ ticketId: z.string(), status: z.enum(["NEW", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED"]).optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(), tags: z.array(z.string().max(30)).max(10).optional(), assigneeId: z.string().nullable().optional() }) },
  async (input, ctx) => {
    await updateTicket(ctx.staff, input.ticketId, input);
  },
);

export const addNoteAction = action({ ...supportOpts, schema: z.object({ ticketId: z.string(), text: z.string().trim().min(1).max(4000) }) }, async (input, ctx) => {
  await addNote(ctx.staff, input.ticketId, input.text);
});

export const saveCannedAction = action(
  { ...supportOpts, schema: z.object({ id: z.string().optional(), title: z.string().trim().min(2).max(80), shortcut: z.string().trim().regex(/^\/?[a-z0-9_-]{2,24}$/i, "invalidFormat"), textUz: z.string().trim().min(2).max(2000), textRu: z.string().trim().min(2).max(2000) }) },
  async (input, ctx) => {
    await saveCanned(ctx.staff, input);
  },
);

export const deleteCannedAction = action({ ...supportOpts, schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  await deleteCanned(ctx.staff, input.id);
});

// ── Broadcasts ───────────────────────────────────────────────────────────

const zSegment = z.enum(["ALL", "BUYERS", "SELLERS", "PLUS"]);

export const segmentSizeAction = action({ auth: "staff", permission: "support.broadcast", schema: z.object({ segment: zSegment }) }, async (input) => ({ ok: true, data: await segmentSize(input.segment) }));

export const sendBroadcastAction = action(
  {
    auth: "staff",
    permission: "support.broadcast",
    rateLimit: { key: "broadcast", limit: 10, window: 3600 },
    schema: z.object({ segment: zSegment, title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(1000), href: z.string().trim().max(300).regex(/^\/[^/\\]/, "invalidFormat").optional().or(z.literal("")), channels: z.array(z.enum(["inapp", "push", "email", "telegram"])).min(1) }),
  },
  async (input, ctx) => {
    const b = await createBroadcast(ctx.staff, { ...input, href: input.href || undefined });
    await enqueue("broadcast.send", { broadcastId: b.id });
    return { ok: true, data: { id: b.id } };
  },
);

// ── Chat moderation ──────────────────────────────────────────────────────

export const moderationAccessAction = action({ auth: "staff", permission: "chat.moderate", schema: z.object({ conversationId: z.string(), reason: z.string().trim().min(10).max(500) }) }, async (input, ctx) => {
  await grantModerationAccess({ userId: ctx.staff.user.id, login: ctx.staff.user.login }, input.conversationId, input.reason);
});

export const chatBanAction = action({ auth: "staff", permission: "chat.moderate", schema: z.object({ userId: z.string(), ban: z.boolean(), reason: z.string().trim().min(3).max(300) }) }, async (input, ctx) => {
  const { audit } = await import("@/server/audit");
  await db.user.update({ where: { id: input.userId }, data: { chatBannedAt: input.ban ? new Date() : null } });
  await audit({ actorId: ctx.staff.user.id, actorLogin: ctx.staff.user.login, action: input.ban ? "chat.ban" : "chat.unban", entityType: "User", entityId: input.userId, meta: { reason: input.reason } });
});

export const resolveChatReportAction = action({ auth: "staff", permission: "chat.moderate", schema: z.object({ reportId: z.string(), status: z.enum(["RESOLVED", "DISMISSED"]) }) }, async (input, ctx) => {
  const { audit } = await import("@/server/audit");
  await db.chatReport.update({ where: { id: input.reportId }, data: { status: input.status } });
  await audit({ actorId: ctx.staff.user.id, actorLogin: ctx.staff.user.login, action: `chat.report_${input.status.toLowerCase()}`, entityType: "ChatReport", entityId: input.reportId });
});
