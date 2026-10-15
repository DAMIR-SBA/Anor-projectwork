import "server-only";
import { env } from "@/server/env";
import { log } from "@/server/log";

export type InlineButton = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };

async function call(token: string | undefined, method: string, body: Record<string, unknown>) {
  if (!token) {
    log.info("telegram (mock, no token)", { method, body });
    return null;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
    if (!data.ok) log.warn("telegram api error", { method, description: data.description });
    return data.result ?? null;
  } catch (err) {
    log.error("telegram request failed", { err, method });
    return null;
  }
}

export function sendTelegram(chatId: string | number, text: string, buttons?: InlineButton[][]) {
  return call(env().TELEGRAM_BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export function sendSellerTelegram(chatId: string | number, text: string, buttons?: InlineButton[][]) {
  const e = env();
  return call(e.TELEGRAM_SELLER_BOT_TOKEN || e.TELEGRAM_BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export function answerCallback(callbackQueryId: string, text: string, seller = false) {
  const e = env();
  return call(seller ? e.TELEGRAM_SELLER_BOT_TOKEN || e.TELEGRAM_BOT_TOKEN : e.TELEGRAM_BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export function editTelegramMessage(chatId: string | number, messageId: number, text: string, seller = false) {
  const e = env();
  return call(seller ? e.TELEGRAM_SELLER_BOT_TOKEN || e.TELEGRAM_BOT_TOKEN : e.TELEGRAM_BOT_TOKEN, "editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" });
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
