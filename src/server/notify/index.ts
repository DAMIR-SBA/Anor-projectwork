import "server-only";
import { db } from "@/server/db";
import { publish } from "@/server/realtime/bus";
import { log } from "@/server/log";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { escapeHtml, sendTelegram } from "./telegram";

export type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  data?: Record<string, unknown>;
  /** Extra channels beyond in-app (subject to the user's preferences). */
  channels?: Array<"email" | "sms" | "telegram" | "push">;
};

type Prefs = { email?: boolean; sms?: boolean; telegram?: boolean; push?: boolean; muted?: string[] };

/** In-app notification + realtime event + opted-in external channels. Never throws. */
export async function notify(n: NotifyInput) {
  try {
    const user = await db.user.findUnique({ where: { id: n.userId }, select: { email: true, phone: true, telegramId: true, notifyPrefs: true, status: true } });
    if (!user || user.status === "DELETED") return;
    const prefs = (user.notifyPrefs as Prefs | null) ?? { email: true, sms: false, telegram: true, push: true };
    if (prefs.muted?.includes(n.type)) return;
    const row = await db.notification.create({ data: { userId: n.userId, type: n.type, title: n.title, body: n.body, href: n.href, data: n.data as object | undefined } });
    await publish(`user:${n.userId}`, "notification", { id: row.id, type: n.type, title: n.title, body: n.body, href: n.href });
    const jobs: Promise<unknown>[] = [];
    const ch = new Set(n.channels ?? []);
    if (ch.has("email") && prefs.email !== false && user.email) jobs.push(sendEmail({ to: user.email, subject: n.title, text: `${n.body}\n\n${process.env.APP_URL ?? ""}${n.href ?? ""}` }));
    if (ch.has("sms") && prefs.sms && user.phone) jobs.push(sendSms(user.phone, `ANOR: ${n.title}. ${n.body}`.slice(0, 300)));
    if (ch.has("telegram") && prefs.telegram !== false && user.telegramId) jobs.push(sendTelegram(user.telegramId, `<b>${escapeHtml(n.title)}</b>\n${escapeHtml(n.body)}${n.href ? `\n${process.env.APP_URL ?? ""}${n.href}` : ""}`));
    if (ch.has("push") && prefs.push !== false) jobs.push(import("./push").then((m) => m.sendPush(n.userId, { title: n.title, body: n.body, href: n.href })));
    await Promise.allSettled(jobs);
  } catch (err) {
    log.error("notify failed", { err, type: n.type });
  }
}
