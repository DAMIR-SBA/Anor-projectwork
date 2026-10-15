"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { action, AppError } from "@/server/action";
import { handOverWithCode } from "@/server/services/orders";
import { audit } from "@/server/audit";

export const courierTakeAction = action({ auth: "staff", permission: "courier.deliver", schema: z.object({ shipmentId: z.string() }) }, async (input, ctx) => {
  const ok = await db.shipment.updateMany({ where: { id: input.shipmentId, courierId: null, status: { in: ["IN_TRANSIT", "PENDING"] }, type: { in: ["COURIER", "EXPRESS"] } }, data: { courierId: ctx.staff.user.id, status: "ASSIGNED" } });
  if (ok.count !== 1) throw new AppError("conflict");
  revalidatePath("/[locale]/courier", "layout");
});

export const courierDeliverAction = action({ auth: "staff", permission: "courier.deliver", rateLimit: { key: "courier-code", limit: 20, window: 600 }, schema: z.object({ shipmentId: z.string(), code: z.string().regex(/^\d{4}$/) }) }, async (input, ctx) => {
  const s = await db.shipment.findUnique({ where: { id: input.shipmentId } });
  if (!s || s.courierId !== ctx.staff.user.id) throw new AppError("forbidden");
  await handOverWithCode(s.orderId, input.code, { actor: "courier", userId: ctx.staff.user.id, login: ctx.staff.user.login });
  revalidatePath("/[locale]/courier", "layout");
});

export const courierFailAction = action({ auth: "staff", permission: "courier.deliver", schema: z.object({ shipmentId: z.string(), reason: z.string().min(2).max(200) }) }, async (input, ctx) => {
  const s = await db.shipment.findUnique({ where: { id: input.shipmentId } });
  if (!s || s.courierId !== ctx.staff.user.id) throw new AppError("forbidden");
  await db.shipment.update({ where: { id: s.id }, data: { status: "IN_TRANSIT", courierId: null, failedReason: input.reason } });
  await audit({ actorId: ctx.staff.user.id, actorLogin: ctx.staff.user.login, action: "shipment.failed_attempt", entityType: "Shipment", entityId: s.id, meta: { reason: input.reason } });
  revalidatePath("/[locale]/courier", "layout");
});
