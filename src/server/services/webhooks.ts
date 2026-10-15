import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/server/db";
import { decrypt } from "@/server/security/crypto";
import { enqueue } from "@/server/jobs/enqueue";

export const WEBHOOK_EVENTS = ["order.created", "order.cancelled", "order.delivered", "return.created", "stock.low"] as const;

/** Queue deliveries for every active seller webhook subscribed to the event. */
export async function emitWebhook(shopId: string, event: string, data: unknown) {
  const hooks = await db.webhook.findMany({ where: { shopId, isActive: true, events: { has: event } } });
  for (const h of hooks) {
    const delivery = await db.webhookDelivery.create({ data: { webhookId: h.id, event, payload: { event, data, sentAt: new Date().toISOString() } as object } });
    await enqueue("webhooks.deliver", { deliveryId: delivery.id });
  }
}

/** POST with `X-Anor-Signature: sha256=<hmac(body)>`; retried with backoff up to 5 attempts. */
export async function deliverWebhook(deliveryId: string) {
  const d = await db.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { webhook: true } });
  if (!d || d.status === "DELIVERED") return;
  const secret = decrypt(d.webhook.secretEnc) ?? "";
  const body = JSON.stringify(d.payload);
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  let code = 0;
  try {
    const res = await fetch(d.webhook.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Anor-Event": d.event, "X-Anor-Delivery": d.id, "X-Anor-Signature": `sha256=${sig}` }, body, signal: AbortSignal.timeout(10_000) });
    code = res.status;
  } catch {
    code = 0;
  }
  const ok = code >= 200 && code < 300;
  await db.webhookDelivery.update({ where: { id: d.id }, data: { status: ok ? "DELIVERED" : "FAILED", responseCode: code || null, attempts: { increment: 1 } } });
  await db.webhook.update({ where: { id: d.webhookId }, data: { lastStatus: code || null, failCount: ok ? 0 : { increment: 1 } } });
  if (!ok && d.attempts + 1 < 5) await enqueue("webhooks.deliver", { deliveryId: d.id }, { delaySeconds: 30 * 2 ** d.attempts });
}
