"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { activeShop } from "@/server/services/seller/context";
import { addDisputeNote, advanceOrder, openDispute, sellerApproveReturn, sellerCancel, sellerDeliverWithCode } from "@/server/services/seller/orders";

const rl = { key: "seller.orders", ...LIMITS.mutation };
const revalidate = () => revalidatePath("/[locale]/seller", "layout");

export const advanceOrdersAction = action({ rateLimit: rl, schema: z.object({ ids: z.array(z.string()).min(1).max(100), to: z.enum(["CONFIRMED", "PACKED", "SHIPPED"]) }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  const failed: string[] = [];
  for (const id of input.ids) {
    try {
      await advanceOrder(shop.id, { userId: ctx.user.id, login: ctx.user.login }, id, input.to);
    } catch {
      failed.push(id);
    }
  }
  revalidate();
  return { ok: true, data: { done: input.ids.length - failed.length, failed: failed.length } };
});

export const cancelOrderSellerAction = action({ rateLimit: rl, schema: z.object({ orderId: z.string(), reason: z.enum(["out_of_stock", "wrong_price", "cannot_ship", "buyer_request", "other"]) }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await sellerCancel(shop.id, { userId: ctx.user.id, login: ctx.user.login }, input.orderId, input.reason);
  revalidate();
});

export const deliverDbsAction = action({ rateLimit: { key: "seller.dbs", limit: 20, window: 600 }, schema: z.object({ orderId: z.string(), code: z.string().regex(/^\d{4}$/, "invalidCode") }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await sellerDeliverWithCode(shop.id, { userId: ctx.user.id, login: ctx.user.login }, input.orderId, input.code);
  revalidate();
});

export const approveReturnSellerAction = action({ rateLimit: rl, schema: z.object({ returnId: z.string() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await sellerApproveReturn(shop.id, { userId: ctx.user.id, login: ctx.user.login }, input.returnId);
  revalidate();
});

export const openDisputeAction = action({ rateLimit: rl, schema: z.object({ returnId: z.string(), reason: z.string().trim().min(20).max(2000), evidence: z.array(z.string().max(500)).max(8).default([]) }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await openDispute(shop.id, { userId: ctx.user.id, login: ctx.user.login }, input.returnId, input);
  revalidate();
});

export const disputeNoteAction = action({ rateLimit: rl, schema: z.object({ disputeId: z.string(), note: z.string().trim().min(3).max(2000), evidence: z.array(z.string().max(500)).max(8).default([]) }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await addDisputeNote(shop.id, { userId: ctx.user.id, login: ctx.user.login }, input.disputeId, input.note, input.evidence);
  revalidate();
});
