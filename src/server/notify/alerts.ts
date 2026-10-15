import "server-only";
import { env } from "@/server/env";
import { rateLimit } from "@/server/security/rate-limit";
import { sendEmail } from "./email";
import { escapeHtml, sendTelegram } from "./telegram";

/** Security alert to the platform owner (email + Telegram), throttled per key. */
export async function alertOwner(key: string, subject: string, text: string) {
  const rl = await rateLimit(`owner-alert:${key}`, 1, 600);
  if (!rl.success) return;
  const e = env();
  const jobs: Promise<unknown>[] = [];
  if (e.OWNER_ALERT_EMAIL) jobs.push(sendEmail({ to: e.OWNER_ALERT_EMAIL, subject: `[ANOR security] ${subject}`, text }));
  if (e.TELEGRAM_OWNER_CHAT_ID) jobs.push(sendTelegram(e.TELEGRAM_OWNER_CHAT_ID, `🔐 <b>${escapeHtml(subject)}</b>\n${escapeHtml(text)}`));
  await Promise.allSettled(jobs);
}
