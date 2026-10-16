"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, AppError } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { activeShop } from "@/server/services/seller/context";
import { createApiKey, createWebhook, deleteWebhook, pingWebhook, redeliver, revokeApiKey, rotateWebhookSecret, updateWebhook } from "@/server/services/seller/api";
import { API_SCOPES } from "@/lib/seller";
import { WEBHOOK_EVENTS } from "@/server/services/webhooks";

const refresh = () => revalidatePath("/[locale]/seller/api", "page");
const actorOf = (u: { id: string; login: string }) => ({ userId: u.id, login: u.login });

async function approvedShop(userId: string) {
  const shop = await activeShop(userId);
  if (shop.status !== "APPROVED") throw new AppError("forbidden");
  return shop;
}

export const createApiKeyAction = action({ rateLimit: { key: "seller.apikey", limit: 10, window: 3600 }, schema: z.object({ name: z.string().trim().min(2).max(60), scopes: z.array(z.enum(API_SCOPES)).min(1) }) }, async (input, ctx) => {
  const shop = await approvedShop(ctx.user.id);
  const r = await createApiKey(shop.id, actorOf(ctx.user), input.name, input.scopes);
  refresh();
  return { ok: true, data: r };
});

export const revokeApiKeyAction = action({ schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await revokeApiKey(shop.id, actorOf(ctx.user), input.id);
  refresh();
});

export const createWebhookAction = action({ rateLimit: { key: "seller.webhook", ...LIMITS.mutation }, schema: z.object({ url: z.string().trim().url().max(500), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1) }) }, async (input, ctx) => {
  const shop = await approvedShop(ctx.user.id);
  const r = await createWebhook(shop.id, actorOf(ctx.user), input.url, input.events);
  refresh();
  return { ok: true, data: r };
});

export const updateWebhookAction = action({ schema: z.object({ id: z.string(), events: z.array(z.enum(WEBHOOK_EVENTS)).optional(), isActive: z.boolean().optional() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await updateWebhook(shop.id, input.id, input);
  refresh();
});

export const rotateWebhookAction = action({ rateLimit: { key: "seller.webhook", ...LIMITS.mutation }, schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  const r = await rotateWebhookSecret(shop.id, actorOf(ctx.user), input.id);
  return { ok: true, data: r };
});

export const deleteWebhookAction = action({ schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await deleteWebhook(shop.id, actorOf(ctx.user), input.id);
  refresh();
});

export const pingWebhookAction = action({ rateLimit: { key: "seller.webhook.ping", limit: 10, window: 600 }, schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  const shop = await approvedShop(ctx.user.id);
  const r = await pingWebhook(shop.id, input.id);
  refresh();
  return { ok: true, data: r };
});

export const redeliverAction = action({ rateLimit: { key: "seller.webhook.ping", limit: 10, window: 600 }, schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  const shop = await approvedShop(ctx.user.id);
  await redeliver(shop.id, input.id);
  refresh();
});
