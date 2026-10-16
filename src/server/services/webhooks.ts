import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/server/db";
import { decrypt } from "@/server/security/crypto";
import { enqueue } from "@/server/jobs/enqueue";
import { safePost } from "@/server/security/ssrf";

export const WEBHOOK_EVENTS = ["order.created", "order.cancelled", "order.delivered", "return.created", "stock.low"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Queue deliveries for every active seller webhook subscribed to the event. */
export async function emitWebhook(shopId: string, event: string, data: unknown) {
  const hooks = await db.webhook.findMany({ where: { shopId, isActive: true, events: { has: event } } });
  for (const h of hooks) {
    const delivery = await db.webhookDelivery.create({ data: { webhookId: h.id, event, payload: { event, data, sentAt: new Date().toISOString() } as object } });
    await enqueue("webhooks.deliver", { deliveryId: delivery.id });
  }
}

/**
 * POST with `X-Anor-Signature: sha256=<hmac(timestamp.body)>` and `X-Anor-Timestamp`; retried with
 * exponential backoff up to 5 attempts. Targets are restricted to public HTTPS hosts (SSRF guard).
 */
export async function deliverWebhook(deliveryId: string) {
  const d = await db.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { webhook: true } });
  if (!d || d.status === "DELIVERED") return;
  const secret = decrypt(d.webhook.secretEnc) ?? "";
  const body = JSON.stringify(d.payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  const res = await safePost(d.webhook.url, { "Content-Type": "application/json", "X-Anor-Event": d.event, "X-Anor-Delivery": d.id, "X-Anor-Timestamp": ts, "X-Anor-Signature": `sha256=${sig}` }, body);
  const ok = res.status >= 200 && res.status < 300;
  await db.webhookDelivery.update({ where: { id: d.id }, data: { status: ok ? "DELIVERED" : "FAILED", responseCode: res.status || null, error: res.error ?? null, attempts: { increment: 1 } } });
  const hook = await db.webhook.update({ where: { id: d.webhookId }, data: { lastStatus: res.status || null, failCount: ok ? 0 : { increment: 1 } } });
  // Endpoints failing 50 times in a row are switched off; the seller re-enables them in the cabinet.
  if (hook.failCount >= 50) await db.webhook.update({ where: { id: hook.id }, data: { isActive: false } });
  // Blocked targets never succeed, so they are not retried.
  if (!ok && res.error !== "blocked_url" && res.error !== "blocked_address" && d.attempts + 1 < 5 && d.event !== "ping") await enqueue("webhooks.deliver", { deliveryId: d.id }, { delaySeconds: 30 * 2 ** d.attempts });
  return { ok, status: res.status, error: res.error };
}
