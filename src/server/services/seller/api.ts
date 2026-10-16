import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { encrypt, sha256 } from "@/server/security/crypto";
import { enqueue } from "@/server/jobs/enqueue";
import { deliverWebhook, WEBHOOK_EVENTS } from "@/server/services/webhooks";
import { API_SCOPES, validateWebhookUrl, type ApiScope } from "@/lib/seller";

const MAX_KEYS = 5;
const MAX_HOOKS = 5;
const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function base62(n: number) {
  // Rejection sampling keeps the alphabet uniform.
  let out = "";
  while (out.length < n) for (const b of randomBytes(n * 2)) if (b < 248 && out.length < n) out += B62[b % 62];
  return out;
}

type Actor = { userId: string; login: string };

// ── API keys ─────────────────────────────────────────────────────────────

/** Returns the full key once; only its SHA-256 and a display prefix are stored. */
export async function createApiKey(shopId: string, actor: Actor, name: string, scopes: ApiScope[]) {
  if ((await db.apiKey.count({ where: { shopId, revokedAt: null } })) >= MAX_KEYS) throw new AppError("limitReached", { max: MAX_KEYS });
  const valid = [...new Set(scopes)].filter((s) => (API_SCOPES as readonly string[]).includes(s));
  if (!valid.length) throw new AppError("invalidInput", undefined, "scopes");
  const key = `anr_live_${base62(40)}`;
  const row = await db.apiKey.create({ data: { shopId, name: name.trim(), prefix: key.slice(0, 17), keyHash: sha256(key), scopes: valid } });
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: "api_key.create", entityType: "ApiKey", entityId: row.id, after: { name: row.name, scopes: valid } });
  return { id: row.id, key };
}

export async function listApiKeys(shopId: string) {
  const rows = await db.apiKey.findMany({ where: { shopId }, orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], take: 30 });
  return rows.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, lastUsedAt: k.lastUsedAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null, createdAt: k.createdAt.toISOString() }));
}

export async function revokeApiKey(shopId: string, actor: Actor, id: string) {
  const res = await db.apiKey.updateMany({ where: { id, shopId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!res.count) throw new AppError("notFound");
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: "api_key.revoke", entityType: "ApiKey", entityId: id });
}

// ── Webhooks ─────────────────────────────────────────────────────────────

const newSecret = () => `whsec_${randomBytes(24).toString("hex")}`;

export async function createWebhook(shopId: string, actor: Actor, url: string, events: string[]) {
  if (!validateWebhookUrl(url)) throw new AppError("webhookUrl", undefined, "url");
  const ev = [...new Set(events)].filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  if (!ev.length) throw new AppError("invalidInput", undefined, "events");
  if ((await db.webhook.count({ where: { shopId } })) >= MAX_HOOKS) throw new AppError("limitReached", { max: MAX_HOOKS });
  const secret = newSecret();
  const row = await db.webhook.create({ data: { shopId, url, events: ev, secretEnc: encrypt(secret) } });
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: "webhook.create", entityType: "Webhook", entityId: row.id, after: { url, events: ev } });
  return { id: row.id, secret };
}

export async function updateWebhook(shopId: string, id: string, data: { events?: string[]; isActive?: boolean }) {
  const hook = await db.webhook.findFirst({ where: { id, shopId } });
  if (!hook) throw new AppError("notFound");
  const ev = data.events ? [...new Set(data.events)].filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e)) : undefined;
  if (ev && !ev.length) throw new AppError("invalidInput", undefined, "events");
  await db.webhook.update({ where: { id }, data: { ...(ev ? { events: ev } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive, ...(data.isActive ? { failCount: 0 } : {}) } : {}) } });
}

export async function rotateWebhookSecret(shopId: string, actor: Actor, id: string) {
  const hook = await db.webhook.findFirst({ where: { id, shopId } });
  if (!hook) throw new AppError("notFound");
  const secret = newSecret();
  await db.webhook.update({ where: { id }, data: { secretEnc: encrypt(secret) } });
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: "webhook.rotate", entityType: "Webhook", entityId: id });
  return { secret };
}

export async function deleteWebhook(shopId: string, actor: Actor, id: string) {
  const res = await db.webhook.deleteMany({ where: { id, shopId } });
  if (!res.count) throw new AppError("notFound");
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: "webhook.delete", entityType: "Webhook", entityId: id });
}

/** Sends a signed `ping` right away and reports the result. */
export async function pingWebhook(shopId: string, id: string) {
  const hook = await db.webhook.findFirst({ where: { id, shopId } });
  if (!hook) throw new AppError("notFound");
  const d = await db.webhookDelivery.create({ data: { webhookId: hook.id, event: "ping", payload: { event: "ping", data: { webhookId: hook.id }, sentAt: new Date().toISOString() } } });
  return (await deliverWebhook(d.id)) ?? { ok: false, status: 0 };
}

export async function redeliver(shopId: string, deliveryId: string) {
  const d = await db.webhookDelivery.findFirst({ where: { id: deliveryId, webhook: { shopId } } });
  if (!d) throw new AppError("notFound");
  await db.webhookDelivery.update({ where: { id: d.id }, data: { status: "PENDING", attempts: 0 } });
  await enqueue("webhooks.deliver", { deliveryId: d.id });
}

export async function listWebhooks(shopId: string) {
  const rows = await db.webhook.findMany({ where: { shopId }, orderBy: { createdAt: "asc" }, include: { deliveries: { orderBy: { createdAt: "desc" }, take: 10 } } });
  return rows.map((h) => ({
    id: h.id,
    url: h.url,
    events: h.events,
    isActive: h.isActive,
    failCount: h.failCount,
    lastStatus: h.lastStatus,
    createdAt: h.createdAt.toISOString(),
    deliveries: h.deliveries.map((d) => ({ id: d.id, event: d.event, status: d.status, responseCode: d.responseCode, error: d.error, attempts: d.attempts, createdAt: d.createdAt.toISOString(), payload: JSON.stringify(d.payload, null, 2).slice(0, 2000) })),
  }));
}

// ── Request authentication ───────────────────────────────────────────────

/** Resolves a bearer key to its shop. Returns null for unknown/revoked keys or unapproved shops. */
export async function resolveApiKey(token: string) {
  const key = await db.apiKey.findUnique({ where: { keyHash: sha256(token) }, include: { shop: { select: { id: true, ownerId: true, status: true, name: true, owner: { select: { login: true } } } } } });
  if (!key || key.revokedAt || key.shop.status !== "APPROVED") return null;
  // Throttle the write: lastUsedAt needs minute precision at most.
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return { keyId: key.id, scopes: key.scopes as ApiScope[], shop: { id: key.shop.id, name: key.shop.name }, actor: { userId: key.shop.ownerId, login: key.shop.owner.login } };
}
