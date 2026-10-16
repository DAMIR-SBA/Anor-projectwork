import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { isOwnStorageUrl } from "@/server/storage";
import { transitionOrder } from "@/server/services/orders";
import { approveReturn } from "@/server/services/returns";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";

export type OrderTab = "new" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled" | "all";
const TAB_STATUS: Record<Exclude<OrderTab, "all">, OrderStatus[]> = {
  new: ["PLACED"],
  confirmed: ["CONFIRMED"],
  packed: ["PACKED"],
  shipped: ["SHIPPED"],
  delivered: ["DELIVERED", "RETURNED"],
  cancelled: ["CANCELLED"],
};

export async function listSellerOrders(shopId: string, tab: OrderTab, opts: { q?: string; page: number }, pageSize = 20) {
  const q = opts.q?.trim();
  const where: Prisma.OrderWhereInput = {
    shopId,
    status: tab === "all" ? { not: "PENDING_PAYMENT" } : { in: TAB_STATUS[tab] },
    ...(q ? { OR: [{ number: { contains: q } }, { items: { some: { title: { contains: q, mode: "insensitive" } } } }, { shipments: { some: { trackingNumber: { contains: q.toUpperCase() } } } }] } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: tab === "new" || tab === "confirmed" || tab === "packed" ? { createdAt: "asc" } : { createdAt: "desc" },
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
      include: { items: { select: { id: true, title: true, variantTitle: true, quantity: true, imageUrl: true, unitPrice: true } }, shipments: { select: { trackingNumber: true, status: true, handoverDeadline: true } }, user: { select: { name: true } }, pickupPoint: { select: { name: true } } },
    }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], where: { shopId }, _count: { _all: true } }),
  ]);
  const c = Object.fromEntries(counts.map((x) => [x.status, x._count._all])) as Record<string, number>;
  return {
    total,
    counts: { new: c.PLACED ?? 0, confirmed: c.CONFIRMED ?? 0, packed: c.PACKED ?? 0, shipped: c.SHIPPED ?? 0 },
    items: rows.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      fulfillment: o.fulfillment,
      deliveryMethod: o.deliveryMethod,
      region: o.region,
      pickupPoint: o.pickupPoint?.name ?? null,
      paymentMethod: o.paymentMethod,
      total: o.total,
      buyer: o.user.name?.split(" ")[0] ?? "—",
      createdAt: o.createdAt.toISOString(),
      slaDeadline: (o.slaDeadline ?? o.shipments[0]?.handoverDeadline)?.toISOString() ?? null,
      tracking: o.shipments[0]?.trackingNumber ?? null,
      isGift: o.isGift,
      items: o.items,
    })),
  };
}

export async function sellerOrderDetail(shopId: string, orderId: string) {
  const o = await db.order.findFirst({
    where: { id: orderId, shopId, status: { not: "PENDING_PAYMENT" } },
    include: { items: true, events: { orderBy: { createdAt: "asc" } }, shipments: true, pickupPoint: true, user: { select: { name: true, phone: true } }, returns: { select: { id: true, number: true, status: true, quantity: true, reason: true } }, shop: { select: { name: true } } },
  });
  if (!o) return null;
  const addr = o.address as { recipient?: string; phone?: string; city?: string; street?: string; house?: string; apartment?: string; note?: string } | null;
  // Sellers see the full address only when they deliver themselves (DBS).
  const showAddress = o.fulfillment === "DBS";
  return {
    ...o,
    buyerName: o.recipientName ?? addr?.recipient ?? o.user.name ?? "—",
    contactPhone: showAddress ? (o.recipientPhone ?? addr?.phone ?? o.user.phone) : null,
    address: showAddress && addr ? [addr.city, addr.street, addr.house, addr.apartment].filter(Boolean).join(", ") : null,
    addressNote: showAddress ? (addr?.note ?? null) : null,
  };
}

type Seller = { userId: string; login: string };

/** Seller moves an FBS/DBS order forward: confirm → packed → handed over (shipped). FBO is handled by the platform warehouse. */
export async function advanceOrder(shopId: string, seller: Seller, orderId: string, to: "CONFIRMED" | "PACKED" | "SHIPPED") {
  const o = await db.order.findFirst({ where: { id: orderId, shopId } });
  if (!o) throw new AppError("notFound");
  if (o.fulfillment === "FBO" && to !== "CONFIRMED") throw new AppError("fboPlatform");
  await transitionOrder(orderId, to, { actor: "seller", userId: seller.userId, login: seller.login });
}

export async function sellerCancel(shopId: string, seller: Seller, orderId: string, reason: string) {
  const o = await db.order.findFirst({ where: { id: orderId, shopId } });
  if (!o) throw new AppError("notFound");
  // "seller:" prefix counts the cancellation against the shop's rating.
  await transitionOrder(orderId, "CANCELLED", { actor: "seller", userId: seller.userId, login: seller.login }, `seller:${reason}`);
}

/** DBS: the seller hands the parcel to the buyer after checking their 4-digit code. */
export async function sellerDeliverWithCode(shopId: string, seller: Seller, orderId: string, code: string) {
  const o = await db.order.findFirst({ where: { id: orderId, shopId } });
  if (!o || o.fulfillment !== "DBS") throw new AppError("notFound");
  if (o.status !== "SHIPPED") throw new AppError("invalidTransition");
  if (!o.pickupCode || o.pickupCode !== code.trim()) throw new AppError("invalidCode", undefined, "code");
  await transitionOrder(orderId, "DELIVERED", { actor: "system", userId: seller.userId, login: seller.login }, "dbs:code");
}

// ── Returns & disputes ───────────────────────────────────────────────────

export type TimelineEntry = { at: string; actor: "buyer" | "seller" | "staff" | "system"; event: string; note?: string; evidence?: string[] };

export async function listSellerReturns(shopId: string, tab: "open" | "disputed" | "closed", page: number, pageSize = 20) {
  const where: Prisma.ReturnWhereInput = {
    order: { shopId },
    status: tab === "open" ? "REQUESTED" : tab === "disputed" ? "DISPUTED" : { in: ["APPROVED", "REFUNDED", "REJECTED", "RECEIVED"] },
  };
  const [rows, total, open, disputed] = await Promise.all([
    db.return.findMany({ where, orderBy: { createdAt: tab === "closed" ? "desc" : "asc" }, skip: (page - 1) * pageSize, take: pageSize, include: { orderItem: { select: { title: true, variantTitle: true, imageUrl: true } }, order: { select: { number: true, deliveredAt: true } }, user: { select: { name: true } }, dispute: true } }),
    db.return.count({ where }),
    db.return.count({ where: { order: { shopId }, status: "REQUESTED" } }),
    db.return.count({ where: { order: { shopId }, status: "DISPUTED" } }),
  ]);
  return {
    total,
    counts: { open, disputed },
    items: rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      reason: r.reason,
      description: r.description,
      photos: (r.photos as string[] | null) ?? [],
      quantity: r.quantity,
      amount: r.amount,
      createdAt: r.createdAt.toISOString(),
      buyer: r.user.name?.split(" ")[0] ?? "—",
      item: r.orderItem,
      orderNumber: r.order.number,
      resolution: r.resolution,
      dispute: r.dispute ? { id: r.dispute.id, status: r.dispute.status, decisionNote: r.dispute.decisionNote, timeline: r.dispute.timeline as TimelineEntry[] } : null,
    })),
  };
}

export async function sellerApproveReturn(shopId: string, seller: Seller, returnId: string) {
  const r = await db.return.findFirst({ where: { id: returnId, order: { shopId }, status: "REQUESTED" } });
  if (!r) throw new AppError("notFound");
  await approveReturn(returnId, { ...seller, kind: "seller" });
}

/** Contest a return with evidence; marketplace staff decide (Phase 7 dispute desk). */
export async function openDispute(shopId: string, seller: Seller, returnId: string, input: { reason: string; evidence: string[] }) {
  const r = await db.return.findFirst({ where: { id: returnId, order: { shopId }, status: "REQUESTED" }, include: { dispute: true } });
  if (!r) throw new AppError("notFound");
  if (r.dispute) throw new AppError("conflict");
  const evidence = input.evidence.filter((u) => isOwnStorageUrl(u) && u.includes("/evidence/")).slice(0, 8);
  const timeline: TimelineEntry[] = [
    { at: r.createdAt.toISOString(), actor: "buyer", event: "return_requested", note: r.reason + (r.description ? `: ${r.description}` : ""), evidence: (r.photos as string[] | null) ?? [] },
    { at: new Date().toISOString(), actor: "seller", event: "disputed", note: input.reason, evidence },
  ];
  await db.$transaction([
    db.dispute.create({ data: { returnId, shopId, sellerReason: input.reason, evidence, timeline } }),
    db.return.update({ where: { id: returnId }, data: { status: "DISPUTED" } }),
  ]);
  await notify({ userId: r.userId, type: "return.disputed", title: `Qaytarish ${r.number}`, body: "Sotuvchi e’tiroz bildirdi — ANOR mutaxassislari ko‘rib chiqadi.", href: "/account/returns" });
  await audit({ actorId: seller.userId, actorLogin: seller.login, actorKind: "seller", action: "return.disputed", entityType: "Return", entityId: returnId, meta: { evidence: evidence.length } });
}

/** Add a note/evidence to an open dispute (seller side). */
export async function addDisputeNote(shopId: string, seller: Seller, disputeId: string, note: string, evidence: string[]) {
  const d = await db.dispute.findFirst({ where: { id: disputeId, shopId, status: { in: ["OPEN", "UNDER_REVIEW"] } } });
  if (!d) throw new AppError("notFound");
  const files = evidence.filter((u) => isOwnStorageUrl(u) && u.includes("/evidence/")).slice(0, 8);
  const timeline = [...(d.timeline as TimelineEntry[]), { at: new Date().toISOString(), actor: "seller" as const, event: "note", note, evidence: files }];
  await db.dispute.update({ where: { id: d.id }, data: { timeline, evidence: [...((d.evidence as string[] | null) ?? []), ...files] } });
  await audit({ actorId: seller.userId, actorLogin: seller.login, actorKind: "seller", action: "dispute.note", entityType: "Dispute", entityId: d.id });
}
