import "server-only";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { audit } from "@/server/audit";
import { randomToken } from "@/server/security/crypto";
import { answerCallback, editTelegramMessage, escapeHtml, sendSellerTelegram, sendTelegram, type InlineButton } from "@/server/notify/telegram";
import { botLocale, parseCommand, type TgUser } from "@/lib/telegram";
import { formatUZS } from "@/lib/money";

type Msg = { message_id: number; from?: TgUser; chat: { id: number; type: string }; text?: string; photo?: unknown; voice?: unknown; document?: unknown };
type Callback = { id: string; from: TgUser; data?: string; message?: { message_id: number; chat: { id: number } } };
export type TgUpdate = { update_id: number; message?: Msg; callback_query?: Callback };

const LINK_TTL_MS = 15 * 60_000;
const app = () => env().APP_URL.replace(/\/$/, "");

/** One-time deep-link token: t.me/<bot>?start=<token>. `shopId` links a shop to the seller bot. */
export async function createLinkToken(userId: string, shopId?: string) {
  const token = (shopId ? "s" : "u") + randomToken(15).replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
  await db.telegramLinkToken.create({ data: { token, userId, shopId: shopId ?? null, expiresAt: new Date(Date.now() + LINK_TTL_MS) } });
  const bot = shopId ? env().TELEGRAM_SELLER_BOT_USERNAME || env().TELEGRAM_BOT_USERNAME : env().TELEGRAM_BOT_USERNAME;
  return { token, url: bot ? `https://t.me/${bot}?start=${token}` : null };
}

async function takeToken(token: string, kind: "user" | "shop") {
  const row = await db.telegramLinkToken.findUnique({ where: { token } });
  if (!row || row.usedAt || row.expiresAt < new Date() || (kind === "shop") !== !!row.shopId) return null;
  const claimed = await db.telegramLinkToken.updateMany({ where: { token, usedAt: null }, data: { usedAt: new Date() } });
  return claimed.count ? row : null;
}

const menu = (t: Awaited<ReturnType<typeof getTranslations>>): InlineButton[][] => [[{ text: t("openStore"), web_app: { url: `${app()}/tg` } }], [{ text: t("myOrders"), callback_data: "orders" }]];

async function ordersText(userId: string, locale: string) {
  const [t, ts] = await Promise.all([getTranslations({ locale, namespace: "telegramBot" }), getTranslations({ locale, namespace: "orders" })]);
  const orders = await db.order.findMany({ where: { userId, status: { not: "PENDING_PAYMENT" } }, orderBy: { createdAt: "desc" }, take: 5, select: { number: true, status: true, total: true, estimatedDeliveryAt: true } });
  if (!orders.length) return t("noOrders");
  const lines = orders.map((o) => `• <b>№${o.number}</b> — ${escapeHtml(ts(`status.${o.status}`))} · ${formatUZS(o.total, locale)}`);
  return `${t("ordersTitle")}\n${lines.join("\n")}\n\n${app()}/account/orders`;
}

/** Buyer bot: linking, order status, and the support bridge (text goes to the same inbox). */
export async function handleBuyerUpdate(u: TgUpdate) {
  if (u.callback_query) {
    const cb = u.callback_query;
    const user = await db.user.findUnique({ where: { telegramId: String(cb.from.id) }, select: { id: true } });
    const locale = botLocale(cb.from.language_code);
    if (cb.data === "orders" && cb.message) {
      const t = await getTranslations({ locale, namespace: "telegramBot" });
      await sendTelegram(cb.message.chat.id, user ? await ordersText(user.id, locale) : t("notLinked"));
    }
    await answerCallback(cb.id, "");
    return;
  }
  const m = u.message;
  if (!m?.from || m.chat.type !== "private") return;
  const locale = botLocale(m.from.language_code);
  const t = await getTranslations({ locale, namespace: "telegramBot" });
  const tgId = String(m.from.id);
  const cmd = parseCommand(m.text);
  const linked = await db.user.findUnique({ where: { telegramId: tgId }, select: { id: true, name: true, login: true, status: true } });

  if (cmd?.command === "start" && cmd.arg) {
    const row = await takeToken(cmd.arg, "user");
    if (!row) return void (await sendTelegram(m.chat.id, t("linkInvalid")));
    // A Telegram account belongs to one ANOR account: move it if it was linked elsewhere.
    await db.user.updateMany({ where: { telegramId: tgId, id: { not: row.userId } }, data: { telegramId: null, telegramUsername: null } });
    const user = await db.user.update({ where: { id: row.userId }, data: { telegramId: tgId, telegramUsername: m.from.username ?? null }, select: { name: true, login: true } });
    await audit({ actorId: row.userId, actorKind: "user", action: "telegram.linked", entityType: "User", entityId: row.userId, meta: { username: m.from.username } });
    return void (await sendTelegram(m.chat.id, t("linked", { name: escapeHtml(user.name ?? user.login) }), menu(t)));
  }
  if (cmd?.command === "start" || cmd?.command === "help") return void (await sendTelegram(m.chat.id, linked ? t("helpLinked") : t("welcome"), menu(t)));
  if (cmd?.command === "orders") return void (await sendTelegram(m.chat.id, linked ? await ordersText(linked.id, locale) : t("notLinked")));
  if (cmd?.command === "unlink") {
    if (linked) await db.user.update({ where: { id: linked.id }, data: { telegramId: null, telegramUsername: null } });
    return void (await sendTelegram(m.chat.id, t("unlinked")));
  }
  if (cmd) return void (await sendTelegram(m.chat.id, t("unknown")));

  // Anything else is a support message.
  if (!linked || linked.status !== "ACTIVE") return void (await sendTelegram(m.chat.id, t("notLinked")));
  if (!m.text) return void (await sendTelegram(m.chat.id, t("textOnly")));
  const { openSupport, sendMessage } = await import("@/server/services/chat");
  const conversationId = await openSupport(linked.id);
  await sendMessage({ userId: linked.id }, conversationId, { text: m.text.slice(0, 4000), source: "TELEGRAM" });
  await sendTelegram(m.chat.id, t("supportReceived"));
}

/** Seller bot: link a shop, then Confirm / Reject new orders from the notification. */
export async function handleSellerUpdate(u: TgUpdate) {
  if (u.callback_query) {
    const cb = u.callback_query;
    const locale = botLocale(cb.from.language_code);
    const t = await getTranslations({ locale, namespace: "telegramBot" });
    const [act, orderId] = (cb.data ?? "").split(":");
    const chatId = cb.message?.chat.id;
    const order = orderId ? await db.order.findUnique({ where: { id: orderId }, include: { shop: { select: { id: true, telegramChatId: true, ownerId: true } } } }) : null;
    // Only the chat linked to this order's shop may act on it.
    if (!order || !chatId || order.shop.telegramChatId !== String(chatId)) return void (await answerCallback(cb.id, t("forbidden"), true));
    const owner = await db.user.findUniqueOrThrow({ where: { id: order.shop.ownerId }, select: { id: true, login: true } });
    const seller = { userId: owner.id, login: owner.login };
    try {
      const { advanceOrder, sellerCancel } = await import("@/server/services/seller/orders");
      if (act === "confirm") await advanceOrder(order.shop.id, seller, order.id, "CONFIRMED");
      else if (act === "reject") await sellerCancel(order.shop.id, seller, order.id, "out_of_stock");
      else return void (await answerCallback(cb.id, "", true));
      await answerCallback(cb.id, act === "confirm" ? t("confirmed") : t("rejected"), true);
      if (cb.message) await editTelegramMessage(chatId, cb.message.message_id, `${act === "confirm" ? "✅" : "❌"} №${order.number} — ${act === "confirm" ? t("confirmed") : t("rejected")}`, true);
    } catch (err) {
      log.warn("seller bot action failed", { err, orderId });
      await answerCallback(cb.id, t("actionFailed"), true);
    }
    return;
  }
  const m = u.message;
  if (!m?.from) return;
  const t = await getTranslations({ locale: botLocale(m.from.language_code), namespace: "telegramBot" });
  const cmd = parseCommand(m.text);
  if (cmd?.command === "start" && cmd.arg) {
    const row = await takeToken(cmd.arg, "shop");
    if (!row?.shopId) return void (await sendSellerTelegram(m.chat.id, t("linkInvalid")));
    const shop = await db.shop.update({ where: { id: row.shopId }, data: { telegramChatId: String(m.chat.id) }, select: { name: true } });
    await audit({ actorId: row.userId, actorKind: "seller", action: "shop.telegram_linked", entityType: "Shop", entityId: row.shopId });
    return void (await sendSellerTelegram(m.chat.id, t("shopLinked", { shop: escapeHtml(shop.name) })));
  }
  if (cmd?.command === "unlink") {
    await db.shop.updateMany({ where: { telegramChatId: String(m.chat.id) }, data: { telegramChatId: null } });
    return void (await sendSellerTelegram(m.chat.id, t("unlinked")));
  }
  await sendSellerTelegram(m.chat.id, t("sellerHelp"));
}

/** Agent replies in a thread the customer started from Telegram go back to Telegram. */
export async function bridgeSupportReply(conversationId: string, text: string | null) {
  if (!text) return false;
  const customer = await db.conversationMember.findFirst({ where: { conversationId, role: "CUSTOMER" }, select: { userId: true, user: { select: { telegramId: true } } } });
  if (!customer?.user.telegramId) return false;
  const fromTelegram = await db.message.findFirst({ where: { conversationId, senderId: customer.userId, source: "TELEGRAM", createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, select: { id: true } });
  if (!fromTelegram) return false;
  await sendTelegram(customer.user.telegramId, `💬 <b>ANOR Yordam</b>\n${escapeHtml(text)}`);
  return true;
}
