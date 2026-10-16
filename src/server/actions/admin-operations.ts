"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, zInt } from "@/server/action";
import type { StaffContext } from "@/server/auth/session";
import { assignCourier, decideDispute, disputeNote, overrideOrderStatus, rejectSupply, savePickupPoint, saveWarehouse, staffAdvanceSupply, staffApproveReturn, staffRejectReturn } from "@/server/services/admin/operations";
import { REGIONS } from "@/lib/delivery";

const who = (s: StaffContext) => ({ userId: s.user.id, login: s.user.login });
const zReason = z.string().trim().min(3).max(1000);

export const orderStatusAction = action(
  { auth: "staff", permission: "orders.manage", schema: z.object({ id: z.string(), to: z.enum(["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"]), reason: zReason }) },
  async (i, ctx) => {
    await overrideOrderStatus(i.id, who(ctx.staff), i.to, i.reason);
    revalidatePath("/[locale]/admin/orders", "layout");
  },
);

export const approveReturnAction = action({ auth: "staff", permission: "returns.manage", schema: z.object({ id: z.string() }) }, async (i, ctx) => {
  await staffApproveReturn(i.id, who(ctx.staff));
  revalidatePath("/[locale]/admin/returns", "page");
});

export const rejectReturnAction = action({ auth: "staff", permission: "returns.manage", schema: z.object({ id: z.string(), reason: zReason }) }, async (i, ctx) => {
  await staffRejectReturn(i.id, who(ctx.staff), i.reason);
  revalidatePath("/[locale]/admin/returns", "page");
});

export const decideDisputeAction = action({ auth: "staff", permission: "disputes.manage", schema: z.object({ id: z.string(), outcome: z.enum(["BUYER", "SELLER"]), reason: zReason }) }, async (i, ctx) => {
  await decideDispute(i.id, who(ctx.staff), i.outcome, i.reason);
  revalidatePath("/[locale]/admin/disputes", "page");
});

export const disputeNoteAction = action({ auth: "staff", permission: "disputes.manage", schema: z.object({ id: z.string(), reason: zReason }) }, async (i, ctx) => {
  await disputeNote(i.id, who(ctx.staff), i.reason);
  revalidatePath("/[locale]/admin/disputes", "page");
});

const logistics = () => revalidatePath("/[locale]/admin/logistics", "page");

export const assignCourierAction = action({ auth: "staff", permission: "logistics.manage", schema: z.object({ shipmentId: z.string(), courierId: z.string().nullable() }) }, async (i, ctx) => {
  await assignCourier(i.shipmentId, i.courierId, who(ctx.staff));
  logistics();
});

export const advanceSupplyAction = action({ auth: "staff", permission: "logistics.manage", schema: z.object({ id: z.string(), counts: z.record(z.string(), zInt(0, 1_000_000)).optional() }) }, async (i, ctx) => {
  await staffAdvanceSupply(i.id, who(ctx.staff), i.counts);
  logistics();
});

export const rejectSupplyAction = action({ auth: "staff", permission: "logistics.manage", schema: z.object({ id: z.string(), reason: zReason }) }, async (i, ctx) => {
  await rejectSupply(i.id, who(ctx.staff), i.reason);
  logistics();
});

const zRegion = z.string().refine((r) => REGIONS.some((x) => x.key === r));
const zHours = z.record(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), z.string().regex(/^(\d{2}:\d{2}-\d{2}:\d{2}|closed)$/));

export const savePickupPointAction = action(
  {
    auth: "staff",
    permission: "logistics.manage",
    schema: z.object({
      id: z.string().optional(),
      code: z.string().trim().regex(/^[A-Z0-9-]{3,20}$/),
      name: z.string().trim().min(3).max(80),
      region: zRegion,
      city: z.string().trim().min(2).max(60),
      district: z.string().trim().min(2).max(60),
      address: z.string().trim().min(5).max(200),
      lat: z.number().min(37).max(46),
      lng: z.number().min(55).max(74),
      hours: zHours,
      phone: z.string().trim().max(20).nullable().optional(),
      storageDays: zInt(1, 14),
      hasFitting: z.boolean(),
      isActive: z.boolean(),
    }),
  },
  async ({ id, ...i }, ctx) => {
    await savePickupPoint(who(ctx.staff), i, id);
    logistics();
  },
);

export const saveWarehouseAction = action(
  {
    auth: "staff",
    permission: "logistics.manage",
    schema: z.object({ id: z.string().optional(), code: z.string().trim().regex(/^[A-Z0-9-]{3,20}$/), name: z.string().trim().min(3).max(80), region: zRegion, city: z.string().trim().min(2).max(60), address: z.string().trim().min(5).max(200), lat: z.number().nullable().optional(), lng: z.number().nullable().optional(), isActive: z.boolean() }),
  },
  async ({ id, ...i }, ctx) => {
    await saveWarehouse(who(ctx.staff), i, id);
    logistics();
  },
);
