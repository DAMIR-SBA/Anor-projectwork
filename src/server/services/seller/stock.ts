import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { randomDigits } from "@/server/security/crypto";
import { syncStock } from "@/server/services/products";
import { setWarehouseStock } from "./products";
import type { Prisma } from "@/generated/prisma/client";

export async function stockOverview(shopId: string, opts: { q?: string; low?: boolean; page: number }, pageSize = 30) {
  const q = opts.q?.trim();
  const where: Prisma.VariantWhereInput = {
    product: { shopId, deletedAt: null },
    ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { barcode: q }, { product: { titleUz: { contains: q, mode: "insensitive" } } }] } : {}),
    ...(opts.low ? { stock: { lte: 3 } } : {}),
  };
  const [rows, total, warehouses] = await Promise.all([
    db.variant.findMany({ where, orderBy: [{ stock: "asc" }, { sku: "asc" }], skip: (opts.page - 1) * pageSize, take: pageSize, include: { product: { select: { id: true, titleUz: true, fulfillment: true, media: { take: 1, orderBy: { sort: "asc" }, select: { url: true } } } }, stocks: true } }),
    db.variant.count({ where }),
    db.warehouse.findMany({ where: { OR: [{ shopId }, { type: "PLATFORM" }], isActive: true }, select: { id: true, name: true, type: true, code: true, city: true }, orderBy: [{ type: "desc" }, { name: "asc" }] }),
  ]);
  return {
    total,
    warehouses,
    rows: rows.map((v) => ({
      variantId: v.id,
      productId: v.product.id,
      title: v.product.titleUz + (v.titleUz ? ` · ${v.titleUz}` : ""),
      sku: v.sku,
      barcode: v.barcode,
      image: v.product.media[0]?.url ?? null,
      fulfillment: v.product.fulfillment,
      total: v.stock,
      byWarehouse: Object.fromEntries(v.stocks.map((s) => [s.warehouseId, { quantity: s.quantity, reserved: s.reserved, lowStockAt: s.lowStockAt }])) as Record<string, { quantity: number; reserved: number; lowStockAt: number }>,
    })),
  };
}

async function ownVariant(shopId: string, variantId: string) {
  const v = await db.variant.findFirst({ where: { id: variantId, product: { shopId } } });
  if (!v) throw new AppError("notFound");
  return v;
}

async function ownWarehouse(shopId: string, warehouseId: string) {
  const wh = await db.warehouse.findFirst({ where: { id: warehouseId, shopId, type: "SELLER" } });
  if (!wh) throw new AppError("forbidden");
  return wh;
}

export async function setStock(shopId: string, actorId: string, variantId: string, warehouseId: string, quantity: number, lowStockAt?: number) {
  await ownVariant(shopId, variantId);
  await ownWarehouse(shopId, warehouseId);
  await setWarehouseStock(variantId, warehouseId, quantity, actorId);
  if (lowStockAt !== undefined) await db.warehouseStock.update({ where: { variantId_warehouseId: { variantId, warehouseId } }, data: { lowStockAt } });
  await syncStock(variantId);
}

/** Barcode/SKU lookup for the scanner (own catalog only). */
export async function scanLookup(shopId: string, code: string) {
  const c = code.trim();
  const v = await db.variant.findFirst({ where: { product: { shopId, deletedAt: null }, OR: [{ barcode: c }, { sku: { equals: c, mode: "insensitive" } }] }, include: { product: { select: { titleUz: true, media: { take: 1, orderBy: { sort: "asc" }, select: { url: true } } } }, stocks: { include: { warehouse: { select: { type: true, shopId: true } } } } } });
  if (!v) return null;
  const own = v.stocks.find((s) => s.warehouse.shopId === shopId);
  return { variantId: v.id, title: v.product.titleUz + (v.titleUz ? ` · ${v.titleUz}` : ""), sku: v.sku, barcode: v.barcode, image: v.product.media[0]?.url ?? null, sellerQty: own?.quantity ?? 0, total: v.stock };
}

export async function scanAdjust(shopId: string, actorId: string, variantId: string, mode: { delta: number } | { set: number }) {
  await ownVariant(shopId, variantId);
  const wh = await db.warehouse.findFirst({ where: { shopId, type: "SELLER", isActive: true } });
  if (!wh) throw new AppError("noWarehouse");
  const cur = await db.warehouseStock.findUnique({ where: { variantId_warehouseId: { variantId, warehouseId: wh.id } } });
  const next = "set" in mode ? mode.set : Math.max(0, (cur?.quantity ?? 0) + mode.delta);
  await setWarehouseStock(variantId, wh.id, next, actorId);
  await syncStock(variantId);
  return next;
}

// ── FBO supplies ─────────────────────────────────────────────────────────

export async function listSupplies(shopId: string) {
  const rows = await db.supplyRequest.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 50, include: { warehouse: { select: { name: true, city: true } }, items: { include: { variant: { select: { sku: true, product: { select: { titleUz: true } } } } } } } });
  return rows.map((s) => ({
    id: s.id,
    number: s.number,
    status: s.status,
    warehouse: `${s.warehouse.name}`,
    plannedAt: s.plannedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    note: s.note,
    units: s.items.reduce((a, i) => a + i.quantity, 0),
    received: s.items.reduce((a, i) => a + (i.receivedQty ?? 0), 0),
    items: s.items.map((i) => ({ sku: i.variant.sku, title: i.variant.product.titleUz, quantity: i.quantity, receivedQty: i.receivedQty })),
  }));
}

export async function createSupply(shopId: string, actor: { userId: string; login: string }, input: { warehouseId: string; plannedAt: Date; note?: string; items: Array<{ variantId: string; quantity: number }> }) {
  const wh = await db.warehouse.findFirst({ where: { id: input.warehouseId, type: "PLATFORM", isActive: true } });
  if (!wh) throw new AppError("notFound");
  const ids = [...new Set(input.items.map((i) => i.variantId))];
  const own = await db.variant.count({ where: { id: { in: ids }, product: { shopId } } });
  if (own !== ids.length) throw new AppError("forbidden");
  const s = await db.supplyRequest.create({
    data: { number: `SUP-${randomDigits(6)}`, shopId, warehouseId: wh.id, plannedAt: input.plannedAt, note: input.note || null, items: { create: input.items.filter((i) => i.quantity > 0).map((i) => ({ variantId: i.variantId, quantity: i.quantity })) } },
  });
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: "supply.create", entityType: "SupplyRequest", entityId: s.id });
  return s;
}

export async function cancelSupply(shopId: string, supplyId: string) {
  const res = await db.supplyRequest.updateMany({ where: { id: supplyId, shopId, status: "CREATED" }, data: { status: "CANCELLED" } });
  if (!res.count) throw new AppError("invalidTransition");
}

/**
 * Warehouse side of a supply: accept → receive (counted) → in stock (platform stock increases).
 * Called by staff (logistics) and, in DEMO_MODE, by the seller to simulate the warehouse.
 */
export async function advanceSupply(supplyId: string, actorId: string | null) {
  const s = await db.supplyRequest.findUniqueOrThrow({ where: { id: supplyId }, include: { items: true } });
  const now = new Date();
  if (s.status === "CREATED") return db.supplyRequest.update({ where: { id: s.id }, data: { status: "ACCEPTED", acceptedAt: now } });
  if (s.status === "ACCEPTED") {
    for (const i of s.items) await db.supplyRequestItem.update({ where: { id: i.id }, data: { receivedQty: i.quantity } });
    return db.supplyRequest.update({ where: { id: s.id }, data: { status: "RECEIVED", receivedAt: now } });
  }
  if (s.status === "RECEIVED") {
    for (const i of s.items) {
      const qty = i.receivedQty ?? i.quantity;
      if (!qty) continue;
      await db.$transaction([
        db.warehouseStock.upsert({ where: { variantId_warehouseId: { variantId: i.variantId, warehouseId: s.warehouseId } }, create: { variantId: i.variantId, warehouseId: s.warehouseId, quantity: qty }, update: { quantity: { increment: qty } } }),
        db.stockMovement.create({ data: { variantId: i.variantId, warehouseId: s.warehouseId, delta: qty, reason: "SUPPLY", refType: "supply", refId: s.id, actorId } }),
      ]);
      await syncStock(i.variantId);
    }
    return db.supplyRequest.update({ where: { id: s.id }, data: { status: "IN_STOCK", stockedAt: now } });
  }
  throw new AppError("invalidTransition");
}
