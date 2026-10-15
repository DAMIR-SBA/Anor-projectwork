import "server-only";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { log } from "@/server/log";

/** Web Push via VAPID; silently skipped when keys are not configured. */
export async function sendPush(userId: string, payload: { title: string; body: string; href?: string }) {
  const e = env();
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) return;
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(e.VAPID_SUBJECT, e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else log.warn("push failed", { err });
      }
    }),
  );
}
