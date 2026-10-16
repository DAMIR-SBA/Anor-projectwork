import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { transitionOrder } from "@/server/services/orders";
import { approveReturn, rejectReturn } from "@/server/services/returns";
import { advanceSupply } from "@/server/services/seller/stock";
import { syncStock } from "@/server/services/products";
import type { TimelineEntry } from "@/server/services/seller/orders";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import type { Staff } from "./shops";

// ── Orders ───────────────────────────────────────────────────────────────

export const ORDER_TABS = ["attention", "active", "delivered", "cancelled", "all"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

function tabWhere(tab: OrderTab, now: Date): Prisma.OrderWhereInput {
  if (tab === "attention")
    return {
      OR: [
        { status: "PLACED", createdAt: { lt: new Date(now.getTime() - 24 * 3_600_000) } },
        { status: { in: ["CONFIRMED", "PACKED"] }, fulfillment: "FBS", slaDeadline: { lt: now } },
        { status: "SHIPPED", estimatedDeliveryAt: { lt: now } },
      ],
    };
  if (tab === "active") return { status: { in: ["PLACED", "CONFIRMED", "PACKED", "SHIPPED"] } };
  if (tab === "delivered") return { status: "DELIVERED" };
  if (tab === "cancelled") return { status: { in: ["CANCELLED", "RETURNED"] } };
  return { status: { not: "PENDING_PAYMENT" } };
}

export async function adminOrders(tab: OrderTab, f: { q?: string; fulfillment?: string; page: number }, pageSize = 25) {
  const now = new Date();
  const q = f.q?.trim();
  const where: Prisma.OrderWhereInput = {
    ...tabWhere(tab, now),
    ...(f.fulfillment && ["FBO", "FBS", "DBS"].includes(f.fulfillment) ? { fulfillment: f.fulfillment as "FBO" } : {}),
    ...(q ? { OR: [{ number: { contains: q } }, { user: { login: { contains: q, mode: "insensitive" } } }, { user: { phone: { contains: q.replace(/\s/g, "") } } }, { shop: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total, attention] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * pageSize, take: pageSize, include: { user: { select: { login: true, name: true } }, shop: { select: { id: true, name: true } }, items: { select: { quantity: true } } } }),
    db.order.count({ where }),
    db.order.count({ where: tabWhere("attention", now) }),
  ]);
  return {
    total,
    attention,
    rows: rows.map((o) => ({ id: o.id, number: o.number, status: o.status, fulfillment: o.fulfillment, deliveryMethod: o.deliveryMethod, paymentMethod: o.paymentMethod, total: o.total, units: o.items.reduce((s, i) => s + i.quantity, 0), buyer: o.user.name ?? o.user.login, shop: o.shop, createdAt: o.createdAt.toISOString(), slaDeadline: o.slaDeadline?.toISOString() ?? null, late: (o.slaDeadline && o.slaDeadline < now && ["CONFIRMED", "PACKED"].includes(o.status)) || (o.estimatedDeliveryAt && o.estimatedDeliveryAt < now && o.status === "SHIPPED") || (o.status === "PLACED" && o.createdAt < new Date(now.getTime() - 24 * 3_600_000)) })),
  };
}

export async function adminOrderDetail(id: string) {
  return db.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, login: true, name: true, phone: true, email: true } },
      shop: { select: { id: true, name: true, ownerId: true } },
      items: true,
      events: { orderBy: { createdAt: "asc" } },
      shipments: { include: { courier: { select: { login: true, name: true } } } },
      pickupPoint: { select: { name: true, address: true } },
      returns: { select: { id: true, number: true, status: true, amount: true, reason: true } },
      penalties: true,
      group: { include: { payments: { include: { refunds: true } } } },
    },
  });
}

/** Staff status change along the order graph (refunds and stock follow the normal transition rules). */
export async function overrideOrderStatus(id: string, staff: Staff, to: OrderStatus, reason: string) {
  await transitionOrder(id, to, { actor: "staff", userId: staff.userId, login: staff.login }, `staff: ${reason}`);
}

// ── Returns & disputes ───────────────────────────────────────────────────

export const RETURN_TABS = ["requested", "disputed", "refunded", "rejected", "all"] as const;
export type ReturnTab = (typeof RETURN_TABS)[number];
const RETURN_WHERE: Record<ReturnTab, Prisma.ReturnWhereInput> = { requested: { status: "REQUESTED" }, disputed: { status: "DISPUTED" }, refunded: { status: { in: ["APPROVED", "REFUNDED", "RECEIVED"] } }, rejected: { status: "REJECTED" }, all: {} };

export async function adminReturns(tab: ReturnTab, page: number, pageSize = 25) {
  const where = RETURN_WHERE[tab];
  const [rows, total] = await Promise.all([
    db.return.findMany({ where, orderBy: { createdAt: tab === "requested" ? "asc" : "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { order: { select: { id: true, number: true, shop: { select: { id: true, name: true } } } }, orderItem: { select: { title: true, imageUrl: true, unitPrice: true } }, user: { select: { login: true, name: true } }, dispute: { select: { id: true, status: true } } } }),
    db.return.count({ where }),
  ]);
  return { rows, total };
}

export async function staffApproveReturn(id: string, staff: Staff) {
  await approveReturn(id, { userId: staff.userId, login: staff.login, kind: "staff" });
}

export async function staffRejectReturn(id: string, staff: Staff, reason: string) {
  const r = await db.return.findUnique({ where: { id } });
  if (!r || !["REQUESTED", "DISPUTED"].includes(r.status)) throw new AppError("invalidTransition");
  await rejectReturn(id, { userId: staff.userId, login: staff.login, kind: "staff" }, reason);
}

export async function adminDisputes(tab: "open" | "decided", page: number, pageSize = 20) {
  const where: Prisma.DisputeWhereInput = tab === "open" ? { status: { in: ["OPEN", "UNDER_REVIEW"] } } : { status: { in: ["RESOLVED_BUYER", "RESOLVED_SELLER"] } };
  const [rows, total] = await Promise.all([
    db.dispute.findMany({
      where,
      orderBy: { createdAt: tab === "open" ? "asc" : "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        shop: { select: { id: true, name: true, returnRate: true, fulfillmentScore: true } },
        return: { include: { user: { select: { id: true, login: true, name: true } }, order: { select: { id: true, number: true, deliveredAt: true } }, orderItem: { select: { title: true, imageUrl: true, unitPrice: true, quantity: true } } } },
      },
    }),
    db.dispute.count({ where }),
  ]);
  // Buyer history helps judge serial returners.
  const buyerIds = [...new Set(rows.map((d) => d.return.userId))];
  const history = await db.return.groupBy({ by: ["userId"], where: { userId: { in: buyerIds } }, _count: { _all: true } });
  const orders = await db.order.groupBy({ by: ["userId"], where: { userId: { in: buyerIds }, status: { in: ["DELIVERED", "RETURNED"] } }, _count: { _all: true } });
  return {
    total,
    rows: rows.map((d) => ({
      ...d,
      timeline: (d.timeline as TimelineEntry[]) ?? [],
      buyerStats: { returns: history.find((h) => h.userId === d.return.userId)?._count._all ?? 0, orders: orders.find((h) => h.userId === d.return.userId)?._count._all ?? 0 },
    })),
  };
}

/**
 * Final dispute decision. Buyer wins → the return is approved and refunded; seller wins → the
 * return is rejected. Both parties are notified and the decision joins the timeline.
 */
export async function decideDispute(id: string, staff: Staff, outcome: "BUYER" | "SELLER", note: string) {
  const d = await db.dispute.findUnique({ where: { id }, include: { return: true, shop: { select: { ownerId: true } } } });
  if (!d || !["OPEN", "UNDER_REVIEW"].includes(d.status)) throw new AppError("invalidTransition");
  const timeline = [...((d.timeline as TimelineEntry[]) ?? []), { at: new Date().toISOString(), actor: "staff" as const, event: "resolved", note: `${outcome === "BUYER" ? "buyer" : "seller"}: ${note}` }];
  await db.dispute.update({ where: { id }, data: { status: outcome === "BUYER" ? "RESOLVED_BUYER" : "RESOLVED_SELLER", decisionNote: note, decidedById: staff.userId, decidedAt: new Date(), timeline } });
  if (outcome === "BUYER") await approveReturn(d.returnId, { userId: staff.userId, login: staff.login, kind: "staff" });
  else await rejectReturn(d.returnId, { userId: staff.userId, login: staff.login, kind: "staff" }, note);
  await notify({ userId: d.shop.ownerId, type: "dispute.decided", title: `Nizo: ${d.return.number}`, body: outcome === "SELLER" ? `Siz foydangizga: ${note}` : `Xaridor foydasiga: ${note}`, href: "/seller/returns?tab=closed", channels: ["telegram", "email"] });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "dispute.decided", entityType: "Dispute", entityId: id, after: { outcome }, meta: { note } });
}

/** Ask for more information: the dispute moves to "under review" and the note is added to the timeline. */
export async function disputeNote(id: string, staff: Staff, note: string) {
  const d = await db.dispute.findUnique({ where: { id }, include: { shop: { select: { ownerId: true } }, return: { select: { userId: true, number: true } } } });
  if (!d || !["OPEN", "UNDER_REVIEW"].includes(d.status)) throw new AppError("invalidTransition");
  const timeline = [...((d.timeline as TimelineEntry[]) ?? []), { at: new Date().toISOString(), actor: "staff" as const, event: "note", note }];
  await db.dispute.update({ where: { id }, data: { status: "UNDER_REVIEW", timeline } });
  await notify({ userId: d.shop.ownerId, type: "dispute.note", title: `Nizo: ${d.return.number}`, body: note, href: "/seller/returns?tab=disputed" });
  await notify({ userId: d.return.userId, type: "dispute.note", title: `Qaytarish ${d.return.number}`, body: note, href: "/account/returns" });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "dispute.note", entityType: "Dispute", entityId: id, meta: { note } });
}

// ── Logistics ────────────────────────────────────────────────────────────

export async function logisticsOverview() {
  const now = new Date();
  const [warehouses, supplies, points, couriers, unassigned, lateHandover, unconfirmed, lateDelivery, expiringPickups, byRegion] = await Promise.all([
    db.warehouse.findMany({ where: { type: "PLATFORM" }, orderBy: { code: "asc" }, include: { _count: { select: { stocks: true, supplies: true } } } }),
    db.supplyRequest.findMany({ where: { status: { in: ["CREATED", "ACCEPTED", "RECEIVED"] } }, orderBy: { plannedAt: "asc" }, include: { shop: { select: { name: true } }, warehouse: { select: { code: true } }, items: { include: { variant: { select: { sku: true, product: { select: { titleUz: true } } } } } } } }),
    db.pickupPoint.findMany({ orderBy: [{ region: "asc" }, { name: "asc" }], include: { _count: { select: { orders: { where: { status: "SHIPPED" } } } } } }),
    db.user.findMany({ where: { staffProfile: { role: { key: "COURIER" }, status: "ACTIVE" } }, select: { id: true, login: true, name: true, lastSeenAt: true, _count: { select: { shipmentsAssigned: { where: { status: { in: ["ASSIGNED", "PICKED_UP"] } } } } } } }),
    db.shipment.findMany({ where: { courierId: null, status: { in: ["IN_TRANSIT", "PENDING"] }, type: { in: ["COURIER", "EXPRESS"] }, order: { status: "SHIPPED" } }, orderBy: { createdAt: "asc" }, take: 50, include: { order: { select: { id: true, number: true, region: true, address: true, estimatedDeliveryAt: true } } } }),
    db.shipment.findMany({ where: { status: "AWAITING_HANDOVER", handoverDeadline: { lt: now } }, orderBy: { handoverDeadline: "asc" }, take: 50, include: { order: { select: { id: true, number: true, shop: { select: { id: true, name: true } } } } } }),
    db.order.count({ where: { status: "PLACED", createdAt: { lt: new Date(now.getTime() - 24 * 3_600_000) } } }),
    db.order.findMany({ where: { status: "SHIPPED", estimatedDeliveryAt: { lt: now } }, orderBy: { estimatedDeliveryAt: "asc" }, take: 50, select: { id: true, number: true, region: true, deliveryMethod: true, estimatedDeliveryAt: true } }),
    db.order.count({ where: { status: "SHIPPED", deliveryMethod: "PICKUP", pickupExpiresAt: { gte: now, lt: new Date(now.getTime() + 24 * 3_600_000) } } }),
    db.order.groupBy({ by: ["region"], where: { status: "SHIPPED" }, _count: { _all: true } }),
  ]);
  return { warehouses, supplies, points, couriers, unassigned, lateHandover, unconfirmed, lateDelivery, expiringPickups, byRegion: byRegion.map((r) => ({ region: r.region, count: r._count._all })).sort((a, b) => b.count - a.count) };
}

export async function assignCourier(shipmentId: string, courierId: string | null, staff: Staff) {
  const s = await db.shipment.findUnique({ where: { id: shipmentId } });
  if (!s || !["IN_TRANSIT", "PENDING", "ASSIGNED"].includes(s.status)) throw new AppError("invalidTransition");
  if (courierId) {
    const c = await db.user.findFirst({ where: { id: courierId, staffProfile: { role: { key: "COURIER" }, status: "ACTIVE" } } });
    if (!c) throw new AppError("notFound");
  }
  await db.shipment.update({ where: { id: shipmentId }, data: { courierId, status: courierId ? "ASSIGNED" : "IN_TRANSIT" } });
  if (courierId) await notify({ userId: courierId, type: "courier.assigned", title: "Yangi yetkazma", body: s.trackingNumber, href: "/courier" });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "shipment.assigned", entityType: "Shipment", entityId: shipmentId, after: { courierId } });
}

/** Warehouse side of an FBO supply. Receiving records the counted quantity per line. */
export async function staffAdvanceSupply(id: string, staff: Staff, counts?: Record<string, number>) {
  const s = await db.supplyRequest.findUnique({ where: { id }, include: { items: true, shop: { select: { ownerId: true } } } });
  if (!s) throw new AppError("notFound");
  if (s.status === "ACCEPTED" && counts) {
    for (const i of s.items) await db.supplyRequestItem.update({ where: { id: i.id }, data: { receivedQty: Math.max(0, Math.min(i.quantity * 2, counts[i.id] ?? i.quantity)) } });
    await db.supplyRequest.update({ where: { id }, data: { status: "RECEIVED", receivedAt: new Date() } });
  } else await advanceSupply(id, staff.userId);
  const fresh = await db.supplyRequest.findUniqueOrThrow({ where: { id }, include: { items: true } });
  const short = fresh.items.reduce((a, i) => a + Math.max(0, i.quantity - (i.receivedQty ?? i.quantity)), 0);
  await notify({ userId: s.shop.ownerId, type: "seller.supply", title: `Ta’minot ${s.number}`, body: `${fresh.status}${short ? ` · kam keldi: ${short}` : ""}`, href: "/seller/stock?tab=supplies" });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "supply.advanced", entityType: "SupplyRequest", entityId: id, after: { status: fresh.status, short } });
}

export async function rejectSupply(id: string, staff: Staff, reason: string) {
  const s = await db.supplyRequest.findUnique({ where: { id }, include: { shop: { select: { ownerId: true } } } });
  if (!s || !["CREATED", "ACCEPTED"].includes(s.status)) throw new AppError("invalidTransition");
  await db.supplyRequest.update({ where: { id }, data: { status: "CANCELLED", note: `${s.note ? `${s.note}\n` : ""}ANOR: ${reason}` } });
  await notify({ userId: s.shop.ownerId, type: "seller.supply", title: `Ta’minot ${s.number} bekor qilindi`, body: reason, href: "/seller/stock?tab=supplies" });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "supply.rejected", entityType: "SupplyRequest", entityId: id, meta: { reason } });
}

export type PickupPointInput = { code: string; name: string; region: string; city: string; district: string; address: string; lat: number; lng: number; hours: Record<string, string>; phone?: string | null; storageDays: number; hasFitting: boolean; isActive: boolean };

export async function savePickupPoint(staff: Staff, input: PickupPointInput, id?: string) {
  if (await db.pickupPoint.findFirst({ where: { code: input.code, NOT: { id: id ?? "-" } } })) throw new AppError("codeTaken", undefined, "code");
  const p = id ? await db.pickupPoint.update({ where: { id }, data: input }) : await db.pickupPoint.create({ data: input });
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: id ? "pvz.updated" : "pvz.created", entityType: "PickupPoint", entityId: p.id, after: { code: p.code, isActive: p.isActive } });
  return p;
}

export type WarehouseInput = { code: string; name: string; region: string; city: string; address: string; lat?: number | null; lng?: number | null; isActive: boolean };

export async function saveWarehouse(staff: Staff, input: WarehouseInput, id?: string) {
  if (await db.warehouse.findFirst({ where: { code: input.code, NOT: { id: id ?? "-" } } })) throw new AppError("codeTaken", undefined, "code");
  const before = id ? await db.warehouse.findUnique({ where: { id } }) : null;
  if (id && (!before || before.type !== "PLATFORM")) throw new AppError("notFound");
  const w = id ? await db.warehouse.update({ where: { id }, data: input }) : await db.warehouse.create({ data: { ...input, type: "PLATFORM" } });
  // (De)activating a warehouse takes its stock out of, or back into, sale.
  if (before && before.isActive !== input.isActive) {
    const stocks = await db.warehouseStock.findMany({ where: { warehouseId: id }, select: { variantId: true } });
    for (const s of stocks) await syncStock(s.variantId);
  }
  await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: id ? "warehouse.updated" : "warehouse.created", entityType: "Warehouse", entityId: w.id, after: { code: w.code, isActive: w.isActive } });
  return w;
}
