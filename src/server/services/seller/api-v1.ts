import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { syncProductPrice } from "@/server/services/products";
import { scanAdjust } from "./stock";
import { advanceOrder } from "./orders";
import type { OrderStatus } from "@/generated/prisma/enums";

type Actor = { userId: string; login: string };

// Field names are part of the public contract; keep them stable (snake_case, documented on /seller/api).

const variantOut = (v: { sku: string; barcode: string | null; titleUz: string; price: number; oldPrice: number | null; stock: number }) => ({ sku: v.sku, barcode: v.barcode, title: v.titleUz || null, price: v.price, old_price: v.oldPrice, stock: v.stock });

export async function apiListProducts(shopId: string, q: { page: number; perPage: number; updatedSince?: Date }) {
  const where = { shopId, deletedAt: null, ...(q.updatedSince ? { updatedAt: { gte: q.updatedSince } } : {}) };
  const [rows, total] = await Promise.all([
    db.product.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (q.page - 1) * q.perPage, take: q.perPage, include: { variants: { orderBy: { sku: "asc" } }, category: { select: { slug: true } } } }),
    db.product.count({ where }),
  ]);
  return {
    items: rows.map((p) => ({ id: p.id, slug: p.slug, title_uz: p.titleUz, title_ru: p.titleRu, status: p.status, fulfillment: p.fulfillment, category: p.category.slug, updated_at: p.updatedAt.toISOString(), variants: p.variants.map(variantOut) })),
    page: q.page,
    per_page: q.perPage,
    total,
  };
}

async function variantBySku(shopId: string, sku: string) {
  const v = await db.variant.findFirst({ where: { sku, product: { shopId, deletedAt: null } }, include: { product: { select: { id: true, fulfillment: true } } } });
  if (!v) throw new AppError("notFound");
  return v;
}

export async function apiGetSku(shopId: string, sku: string) {
  const v = await variantBySku(shopId, sku);
  return { product_id: v.product.id, fulfillment: v.product.fulfillment, ...variantOut(v) };
}

/** Sets the seller-warehouse quantity. FBO stock lives in ANOR warehouses and changes only via supplies. */
export async function apiSetStock(shopId: string, actor: Actor, sku: string, quantity: number) {
  const v = await variantBySku(shopId, sku);
  if (v.product.fulfillment === "FBO") throw new AppError("fboPlatform");
  const q = await scanAdjust(shopId, actor.userId, v.id, { set: quantity });
  const fresh = await db.variant.findUniqueOrThrow({ where: { id: v.id }, select: { stock: true } });
  return { sku, warehouse_quantity: q, stock: fresh.stock };
}

export async function apiBulkStock(shopId: string, actor: Actor, items: Array<{ sku: string; quantity: number }>) {
  const results: Array<{ sku: string; ok: boolean; stock?: number; error?: string }> = [];
  for (const it of items) {
    try {
      const r = await apiSetStock(shopId, actor, it.sku, it.quantity);
      results.push({ sku: it.sku, ok: true, stock: r.stock });
    } catch (e) {
      results.push({ sku: it.sku, ok: false, error: e instanceof AppError ? e.code : "internal" });
    }
  }
  return { updated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

export async function apiSetPrice(shopId: string, sku: string, price: number, oldPrice: number | null | undefined) {
  const v = await variantBySku(shopId, sku);
  if (oldPrice && oldPrice <= price) throw new AppError("oldPriceLow");
  await db.variant.update({ where: { id: v.id }, data: { price, ...(oldPrice !== undefined ? { oldPrice } : {}) } });
  if (v.price !== price) await db.priceHistory.create({ data: { variantId: v.id, price } });
  await syncProductPrice(v.product.id);
  return { sku, price, old_price: oldPrice === undefined ? v.oldPrice : oldPrice };
}

const orderInclude = { items: { include: { variant: { select: { sku: true } } } }, shipments: { select: { trackingNumber: true, handoverDeadline: true, status: true } } } as const;

type ApiOrder = NonNullable<Awaited<ReturnType<typeof db.order.findFirst<{ include: typeof orderInclude }>>>>;

function orderOut(o: ApiOrder) {
  const addr = o.address as { recipient?: string; phone?: string; city?: string; street?: string; house?: string; apartment?: string; note?: string } | null;
  // Same privacy rule as the cabinet: the delivery address only for orders the seller delivers (DBS).
  const dbs = o.fulfillment === "DBS";
  return {
    number: o.number,
    status: o.status,
    fulfillment: o.fulfillment,
    delivery_method: o.deliveryMethod,
    payment_method: o.paymentMethod,
    created_at: o.createdAt.toISOString(),
    sla_deadline: (o.slaDeadline ?? o.shipments[0]?.handoverDeadline)?.toISOString() ?? null,
    total: o.total,
    items: o.items.map((i) => ({ sku: i.variant.sku, title: i.title, variant: i.variantTitle, quantity: i.quantity, unit_price: i.unitPrice, discount: i.discount })),
    tracking_number: o.shipments[0]?.trackingNumber ?? null,
    delivery: dbs && addr ? { recipient: o.recipientName ?? addr.recipient ?? null, phone: o.recipientPhone ?? addr.phone ?? null, address: [addr.city, addr.street, addr.house, addr.apartment].filter(Boolean).join(", "), note: addr.note ?? null } : null,
  };
}

export async function apiListOrders(shopId: string, q: { page: number; perPage: number; status?: OrderStatus; since?: Date }) {
  const where = { shopId, status: q.status ?? { not: "PENDING_PAYMENT" as const }, ...(q.since ? { createdAt: { gte: q.since } } : {}) };
  const [rows, total] = await Promise.all([db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.perPage, take: q.perPage, include: orderInclude }), db.order.count({ where })]);
  return { items: rows.map(orderOut), page: q.page, per_page: q.perPage, total };
}

async function orderByNumber(shopId: string, number: string) {
  const o = await db.order.findFirst({ where: { shopId, number, status: { not: "PENDING_PAYMENT" } }, include: orderInclude });
  if (!o) throw new AppError("notFound");
  return o;
}

export const apiGetOrder = async (shopId: string, number: string) => orderOut(await orderByNumber(shopId, number));

export async function apiSetOrderStatus(shopId: string, actor: Actor, number: string, to: "CONFIRMED" | "PACKED" | "SHIPPED") {
  const o = await orderByNumber(shopId, number);
  await advanceOrder(shopId, actor, o.id, to);
  return orderOut(await orderByNumber(shopId, number));
}
