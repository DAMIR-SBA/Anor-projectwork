import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { isOwnStorageUrl } from "@/server/storage";
import { randomToken } from "@/server/security/crypto";
import { generateJson, aiEnabled } from "@/server/ai/gemini";
import { rebuildSearchText, syncProductPrice, syncStock } from "@/server/services/products";
import { searchProductIds } from "@/server/services/catalog";
import { productNeedsReview, slugify, toCsv, type ImportRow } from "@/lib/seller";
import { Prisma } from "@/generated/prisma/client";
import type { FulfillmentModel, ItemCondition, ProductStatus } from "@/generated/prisma/enums";

export type ShopRef = { id: string; status: string; tier: string };

// ── Listing ──────────────────────────────────────────────────────────────

export type SellerProductFilter = { q?: string; status?: ProductStatus | "LOW_STOCK" | "ALL"; page: number; sort?: "new" | "sold" | "stock" | "price" };

export async function listSellerProducts(shopId: string, f: SellerProductFilter, pageSize = 25) {
  const q = f.q?.trim();
  const where: Prisma.ProductWhereInput = {
    shopId,
    deletedAt: null,
    ...(f.status && f.status !== "ALL" && f.status !== "LOW_STOCK" ? { status: f.status } : {}),
    ...(f.status === "LOW_STOCK" ? { variants: { some: { stock: { lte: 3 } } }, status: "ACTIVE" } : {}),
    ...(q ? { OR: [{ titleUz: { contains: q, mode: "insensitive" } }, { titleRu: { contains: q, mode: "insensitive" } }, { variants: { some: { OR: [{ sku: { contains: q, mode: "insensitive" } }, { barcode: q }] } } }] } : {}),
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput = f.sort === "sold" ? { soldCount: "desc" } : f.sort === "price" ? { price: "asc" } : { createdAt: "desc" };
  const [rows, total, counts] = await Promise.all([
    db.product.findMany({ where, orderBy, skip: (f.page - 1) * pageSize, take: pageSize, include: { variants: { select: { id: true, sku: true, stock: true, price: true } }, media: { take: 1, orderBy: { sort: "asc" } }, category: { select: { nameUz: true, nameRu: true } }, experiments: { where: { status: "RUNNING" }, select: { id: true } } } }),
    db.product.count({ where }),
    db.product.groupBy({ by: ["status"], where: { shopId, deletedAt: null }, _count: { _all: true } }),
  ]);
  const items = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    titleUz: p.titleUz,
    titleRu: p.titleRu,
    status: p.status,
    moderationNote: p.moderationNote,
    image: p.media[0]?.url ?? null,
    category: { uz: p.category.nameUz, ru: p.category.nameRu },
    price: p.price,
    oldPrice: p.oldPrice,
    stock: p.variants.reduce((s, v) => s + v.stock, 0),
    lowStock: p.variants.some((v) => v.stock <= 3),
    variants: p.variants.length,
    sku: p.variants[0]?.sku ?? "",
    sold: p.soldCount,
    views: p.viewCount,
    rating: p.rating,
    fulfillment: p.fulfillment,
    experiment: p.experiments.length > 0,
  }));
  return { items, total, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<string, number> };
}

// ── Editor ───────────────────────────────────────────────────────────────

export async function editableProduct(shopId: string, productId: string) {
  const p = await db.product.findFirst({
    where: { id: productId, shopId, deletedAt: null },
    include: {
      media: { orderBy: { sort: "asc" } },
      variants: { orderBy: { createdAt: "asc" }, include: { stocks: { include: { warehouse: { select: { id: true, type: true, name: true } } } }, scheduledPrices: { where: { revertedAt: null }, orderBy: { startsAt: "asc" } }, _count: { select: { orderItems: true } } } },
      experiments: { orderBy: { createdAt: "desc" }, take: 1 },
      category: { select: { id: true, slug: true } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    slug: p.slug,
    status: p.status,
    moderationNote: p.moderationNote,
    titleUz: p.titleUz,
    titleRu: p.titleRu,
    descriptionUz: p.descriptionUz,
    descriptionRu: p.descriptionRu,
    categoryId: p.categoryId,
    brandId: p.brandId,
    specs: ((p.specs as Array<{ keyUz: string; keyRu: string; value: string }> | null) ?? []).map((s) => ({ keyUz: s.keyUz, keyRu: s.keyRu, value: s.value })),
    media: p.media.filter((m) => m.type === "IMAGE").map((m) => m.url),
    videoUrl: p.videoUrl,
    fulfillment: p.fulfillment,
    weightGrams: p.weightGrams,
    isHalal: p.isHalal,
    madeInUz: p.madeInUz,
    condition: p.condition,
    isPreorder: p.isPreorder,
    wholesale: (p.wholesaleTiers as Array<{ minQty: number; price: number }> | null) ?? [],
    variants: p.variants.map((v) => ({
      id: v.id,
      titleUz: v.titleUz,
      titleRu: v.titleRu,
      sku: v.sku,
      barcode: v.barcode ?? "",
      price: v.price,
      oldPrice: v.oldPrice,
      costPrice: v.costPrice,
      stock: v.stocks.filter((s) => s.warehouse.type === "SELLER").reduce((a, s) => a + s.quantity, 0),
      platformStock: v.stocks.filter((s) => s.warehouse.type === "PLATFORM").reduce((a, s) => a + s.quantity, 0),
      hasOrders: v._count.orderItems > 0,
      scheduled: v.scheduledPrices.map((c) => ({ id: c.id, newPrice: c.newPrice, startsAt: c.startsAt.toISOString(), endsAt: c.endsAt?.toISOString() ?? null, applied: !!c.appliedAt })),
    })),
    experiment: p.experiments[0] ? { id: p.experiments[0].id, type: p.experiments[0].type, status: p.experiments[0].status, a: p.experiments[0].variantA as Record<string, string>, b: p.experiments[0].variantB as Record<string, string>, impressionsA: p.experiments[0].impressionsA, impressionsB: p.experiments[0].impressionsB, clicksA: p.experiments[0].clicksA, clicksB: p.experiments[0].clicksB, winner: p.experiments[0].winner } : null,
  };
}

export type EditableProduct = NonNullable<Awaited<ReturnType<typeof editableProduct>>>;

export type ProductInput = {
  id?: string;
  titleUz: string;
  titleRu: string;
  descriptionUz: string;
  descriptionRu: string;
  categoryId: string;
  brandId?: string | null;
  specs: Array<{ keyUz: string; keyRu: string; value: string }>;
  media: string[];
  videoUrl?: string | null;
  fulfillment: FulfillmentModel;
  weightGrams: number;
  isHalal: boolean;
  madeInUz: boolean;
  condition: ItemCondition;
  isPreorder: boolean;
  wholesale: Array<{ minQty: number; price: number }>;
  keywords?: string;
  variants: Array<{ id?: string; titleUz: string; titleRu: string; sku: string; barcode?: string; price: number; oldPrice?: number | null; costPrice?: number | null; stock: number }>;
  publish: boolean;
};

async function sellerWarehouse(shopId: string) {
  const wh = await db.warehouse.findFirst({ where: { shopId, type: "SELLER", isActive: true } });
  if (!wh) throw new AppError("noWarehouse");
  return wh;
}

/** Create or update a listing with its variants, media and seller-warehouse stock. */
export async function saveProduct(shop: ShopRef, actor: { userId: string; login: string }, input: ProductInput) {
  const existing = input.id ? await db.product.findFirst({ where: { id: input.id, shopId: shop.id, deletedAt: null }, include: { variants: { include: { _count: { select: { orderItems: true } } } }, media: true } }) : null;
  if (input.id && !existing) throw new AppError("notFound");
  const category = await db.category.findUnique({ where: { id: input.categoryId }, include: { _count: { select: { children: true } } } });
  if (!category || category._count.children > 0) throw new AppError("categoryLeaf", undefined, "categoryId");

  // SKUs are globally unique (the seller API addresses variants by SKU); barcodes are unique per shop,
  // since several shops legitimately sell the same EAN.
  const skus = input.variants.map((v) => v.sku.trim());
  if (new Set(skus).size !== skus.length) throw new AppError("skuDuplicate", undefined, "variants");
  const barcodes = input.variants.map((v) => v.barcode?.trim()).filter((b): b is string => !!b);
  if (new Set(barcodes).size !== barcodes.length) throw new AppError("skuDuplicate", undefined, "variants");
  const clash = await db.variant.findFirst({ where: { OR: [{ sku: { in: skus } }, ...(barcodes.length ? [{ barcode: { in: barcodes }, product: { shopId: shop.id } }] : [])], NOT: { productId: existing?.id ?? "-" } }, select: { sku: true } });
  if (clash) throw new AppError("skuTaken", { sku: clash.sku }, "variants");
  for (const v of input.variants) if (v.oldPrice && v.oldPrice <= v.price) throw new AppError("oldPriceLow", undefined, "variants");

  // Keep URLs already on the product (e.g. demo art) and accept new uploads from the products folder only.
  const knownUrls = new Set(existing?.media.map((m) => m.url) ?? []);
  const media = input.media.filter((u) => knownUrls.has(u) || (isOwnStorageUrl(u) && u.includes("/products/"))).slice(0, 12);
  if (!media.length && input.publish) throw new AppError("mediaRequired", undefined, "media");

  const removed = existing?.variants.filter((v) => !input.variants.some((x) => x.id === v.id)) ?? [];
  if (removed.some((v) => v._count.orderItems > 0)) throw new AppError("variantInUse", undefined, "variants");

  const flagged = productNeedsReview([input.titleUz, input.titleRu, input.descriptionUz, input.descriptionRu].join(" "));
  const canPublish = shop.status === "APPROVED";
  const status: ProductStatus = !input.publish ? (existing?.status === "ACTIVE" ? "ACTIVE" : "DRAFT") : !canPublish ? "DRAFT" : flagged ? "PENDING" : "ACTIVE";
  const minVariant = input.variants.reduce((m, v) => (v.price < m.price ? v : m), input.variants[0]);
  const data = {
    titleUz: input.titleUz.trim(),
    titleRu: input.titleRu.trim(),
    descriptionUz: input.descriptionUz.trim(),
    descriptionRu: input.descriptionRu.trim(),
    categoryId: category.id,
    brandId: input.brandId || null,
    specs: input.specs.filter((s) => s.keyUz.trim() && s.value.trim()),
    fulfillment: input.fulfillment,
    weightGrams: input.weightGrams,
    isHalal: input.isHalal,
    madeInUz: input.madeInUz,
    condition: input.condition,
    isPreorder: input.isPreorder,
    wholesaleTiers: input.wholesale.length ? input.wholesale : Prisma.DbNull,
    videoUrl: input.videoUrl || null,
    status,
    moderationNote: status === "PENDING" ? "auto:keywords" : null,
    price: minVariant.price,
    ...(status === "ACTIVE" && existing?.status !== "ACTIVE" ? { publishedAt: new Date() } : {}),
  };

  const productId = await db.$transaction(async (tx) => {
    const p = existing
      ? await tx.product.update({ where: { id: existing.id }, data })
      : await tx.product.create({ data: { ...data, shopId: shop.id, slug: `${slugify(input.titleUz).slice(0, 60)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}` } });
    await tx.productMedia.deleteMany({ where: { productId: p.id } });
    await tx.productMedia.createMany({ data: media.map((url, i) => ({ productId: p.id, url, type: "IMAGE" as const, sort: i, alt: input.titleUz })) });
    if (removed.length) await tx.variant.deleteMany({ where: { id: { in: removed.map((v) => v.id) } } });
    return p.id;
  });

  const wh = input.fulfillment === "FBO" ? null : await sellerWarehouse(shop.id);
  for (const [i, v] of input.variants.entries()) {
    const before = v.id ? existing?.variants.find((x) => x.id === v.id) : undefined;
    const vdata = { titleUz: v.titleUz.trim(), titleRu: v.titleRu.trim(), sku: v.sku.trim(), barcode: v.barcode?.trim() || null, price: v.price, oldPrice: v.oldPrice || null, costPrice: v.costPrice ?? null, isDefault: i === 0 };
    const row = before ? await db.variant.update({ where: { id: before.id }, data: vdata }) : await db.variant.create({ data: { ...vdata, productId } });
    if (!before || before.price !== v.price) await db.priceHistory.create({ data: { variantId: row.id, price: v.price } });
    if (wh) await setWarehouseStock(row.id, wh.id, v.stock, actor.userId, "ADJUST");
    await syncStock(row.id);
  }
  await syncProductPrice(productId);
  await rebuildSearchText(productId, input.keywords);
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: existing ? "product.update" : "product.create", entityType: "Product", entityId: productId, after: { status, variants: input.variants.length } });
  return { id: productId, status };
}

/** Set an absolute quantity, logging the delta as a stock movement. */
export async function setWarehouseStock(variantId: string, warehouseId: string, quantity: number, actorId: string | null, reason: "ADJUST" | "SUPPLY" | "RETURN" = "ADJUST") {
  const cur = await db.warehouseStock.findUnique({ where: { variantId_warehouseId: { variantId, warehouseId } } });
  const delta = quantity - (cur?.quantity ?? 0);
  if (!delta && cur) return 0;
  await db.$transaction([
    db.warehouseStock.upsert({ where: { variantId_warehouseId: { variantId, warehouseId } }, create: { variantId, warehouseId, quantity }, update: { quantity } }),
    db.stockMovement.create({ data: { variantId, warehouseId, delta, reason, actorId } }),
  ]);
  return delta;
}

// ── Bulk operations ──────────────────────────────────────────────────────

export type BulkOp = { kind: "pricePercent"; percent: number } | { kind: "status"; status: "ACTIVE" | "ARCHIVED" } | { kind: "stock"; quantity: number } | { kind: "delete" };

export async function bulkUpdate(shop: ShopRef, actor: { userId: string; login: string }, ids: string[], op: BulkOp) {
  const products = await db.product.findMany({ where: { id: { in: ids }, shopId: shop.id, deletedAt: null }, include: { variants: true } });
  let changed = 0;
  for (const p of products) {
    if (op.kind === "pricePercent") {
      for (const v of p.variants) {
        const price = Math.max(1000, Math.round((v.price * (100 + op.percent)) / 100 / 100) * 100);
        await db.variant.update({ where: { id: v.id }, data: { price, oldPrice: v.oldPrice && v.oldPrice > price ? v.oldPrice : null } });
        await db.priceHistory.create({ data: { variantId: v.id, price } });
      }
      await syncProductPrice(p.id);
    } else if (op.kind === "status") {
      const flagged = productNeedsReview(`${p.titleUz} ${p.titleRu} ${p.descriptionUz} ${p.descriptionRu}`);
      const next = op.status === "ARCHIVED" ? "ARCHIVED" : shop.status !== "APPROVED" ? "DRAFT" : flagged ? "PENDING" : "ACTIVE";
      if (p.status === "REJECTED" && op.status === "ACTIVE") continue;
      await db.product.update({ where: { id: p.id }, data: { status: next, ...(next === "ACTIVE" && !p.publishedAt ? { publishedAt: new Date() } : {}) } });
    } else if (op.kind === "stock") {
      if (p.fulfillment === "FBO") continue;
      const wh = await sellerWarehouse(shop.id);
      for (const v of p.variants) {
        await setWarehouseStock(v.id, wh.id, op.quantity, actor.userId);
        await syncStock(v.id);
      }
    } else if (op.kind === "delete") {
      await db.product.update({ where: { id: p.id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
    }
    changed++;
  }
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: `product.bulk_${op.kind}`, entityType: "Shop", entityId: shop.id, meta: { count: changed, op } });
  return changed;
}

export async function schedulePrice(shopId: string, variantId: string, input: { newPrice: number; newOldPrice?: number | null; startsAt: Date; endsAt?: Date | null }) {
  const v = await db.variant.findFirst({ where: { id: variantId, product: { shopId } } });
  if (!v) throw new AppError("notFound");
  if (input.endsAt && input.endsAt <= input.startsAt) throw new AppError("dateRange", undefined, "endsAt");
  if (input.startsAt.getTime() < Date.now() - 60_000) throw new AppError("dateRange", undefined, "startsAt");
  return db.scheduledPriceChange.create({ data: { variantId, newPrice: input.newPrice, newOldPrice: input.newOldPrice ?? null, startsAt: input.startsAt, endsAt: input.endsAt ?? null } });
}

export async function cancelScheduledPrice(shopId: string, id: string) {
  await db.scheduledPriceChange.deleteMany({ where: { id, appliedAt: null, variant: { product: { shopId } } } });
}

// ── CSV ──────────────────────────────────────────────────────────────────

export async function importRows(shop: ShopRef, actor: { userId: string; login: string }, rows: ImportRow[]) {
  const cats = new Map((await db.category.findMany({ where: { slug: { in: [...new Set(rows.map((r) => r.category))] } }, select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));
  const brands = await db.brand.findMany({ select: { id: true, name: true, slug: true } });
  const wh = await sellerWarehouse(shop.id);
  let created = 0;
  let updated = 0;
  const errors: Array<{ line: number; code: string }> = [];
  for (const r of rows) {
    try {
      const v = await db.variant.findUnique({ where: { sku: r.sku }, include: { product: true } });
      if (v && v.product.shopId !== shop.id) {
        errors.push({ line: r.line, code: "skuTaken" });
        continue;
      }
      const brand = r.brand ? brands.find((b) => b.slug === r.brand!.toLowerCase() || b.name.toLowerCase() === r.brand!.toLowerCase()) : null;
      if (v) {
        await db.variant.update({ where: { id: v.id }, data: { price: r.price, oldPrice: r.oldPrice, barcode: r.barcode ?? v.barcode, costPrice: r.costPrice ?? v.costPrice } });
        if (v.price !== r.price) await db.priceHistory.create({ data: { variantId: v.id, price: r.price } });
        await db.product.update({ where: { id: v.productId }, data: { titleUz: r.titleUz, titleRu: r.titleRu, ...(r.descriptionUz ? { descriptionUz: r.descriptionUz } : {}), ...(r.descriptionRu ? { descriptionRu: r.descriptionRu } : {}), weightGrams: r.weightGrams, categoryId: cats.get(r.category) ?? v.product.categoryId } });
        if (v.product.fulfillment !== "FBO") await setWarehouseStock(v.id, wh.id, r.stock, actor.userId);
        await syncStock(v.id);
        await syncProductPrice(v.productId);
        await rebuildSearchText(v.productId);
        updated++;
      } else {
        const p = await db.product.create({
          data: {
            shopId: shop.id,
            slug: `${slugify(r.titleUz).slice(0, 60)}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`,
            titleUz: r.titleUz,
            titleRu: r.titleRu,
            descriptionUz: r.descriptionUz,
            descriptionRu: r.descriptionRu,
            categoryId: cats.get(r.category)!,
            brandId: brand?.id ?? null,
            price: r.price,
            weightGrams: r.weightGrams,
            fulfillment: "FBS",
            status: "DRAFT",
            variants: { create: { sku: r.sku, price: r.price, oldPrice: r.oldPrice, barcode: r.barcode, costPrice: r.costPrice, isDefault: true } },
          },
          include: { variants: true },
        });
        await db.priceHistory.create({ data: { variantId: p.variants[0].id, price: r.price } });
        await setWarehouseStock(p.variants[0].id, wh.id, r.stock, actor.userId);
        await syncStock(p.variants[0].id);
        await syncProductPrice(p.id);
        await rebuildSearchText(p.id);
        created++;
      }
    } catch {
      errors.push({ line: r.line, code: "generic" });
    }
  }
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: "product.import", entityType: "Shop", entityId: shop.id, meta: { created, updated, errors: errors.length } });
  return { created, updated, errors };
}

export async function exportCsv(shopId: string) {
  const products = await db.product.findMany({ where: { shopId, deletedAt: null }, include: { variants: true, category: { select: { slug: true } }, brand: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
  const rows: Array<Array<string | number | null>> = [["sku", "title_uz", "title_ru", "category", "price", "old_price", "stock", "description_uz", "description_ru", "brand", "weight_g", "barcode", "cost_price", "status"]];
  for (const p of products) for (const v of p.variants) rows.push([v.sku, v.titleUz ? `${p.titleUz} — ${v.titleUz}` : p.titleUz, v.titleRu ? `${p.titleRu} — ${v.titleRu}` : p.titleRu, p.category.slug, v.price, v.oldPrice, v.stock, p.descriptionUz, p.descriptionRu, p.brand?.name ?? "", p.weightGrams, v.barcode, v.costPrice, p.status]);
  return toCsv(rows);
}

// ── Category suggestion ──────────────────────────────────────────────────

/** Gemini when configured; otherwise the majority category of similar listings, then name overlap. */
export async function suggestCategory(title: string, description = "") {
  const leaves = await db.category.findMany({ where: { children: { none: {} } }, select: { id: true, slug: true, nameUz: true, nameRu: true } });
  if (aiEnabled() && title.length > 3) {
    const ai = await generateJson<{ slug: string; attributes?: Array<{ keyUz: string; keyRu: string; value: string }> }>([
      { text: `Pick the best category slug for this marketplace listing and suggest up to 5 attributes (uz/ru keys) found in the text. JSON {"slug": string, "attributes": [{"keyUz","keyRu","value"}]}. Slugs: ${leaves.map((l) => l.slug).join(", ")}\nTitle: ${title}\nDescription: ${description.slice(0, 1500)}` },
    ]);
    const hit = ai && leaves.find((l) => l.slug === ai.slug);
    if (hit) return { categoryId: hit.id, source: "ai" as const, attributes: (ai.attributes ?? []).slice(0, 5) };
  }
  const ids = await searchProductIds(title, 40);
  if (ids.length) {
    const rows = await db.product.groupBy({ by: ["categoryId"], where: { id: { in: ids } }, _count: { _all: true }, orderBy: { _count: { categoryId: "desc" } }, take: 1 });
    if (rows[0] && leaves.some((l) => l.id === rows[0].categoryId)) return { categoryId: rows[0].categoryId, source: "similar" as const, attributes: [] };
  }
  const words = title.toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length > 3);
  const scored = leaves.map((l) => ({ l, s: words.filter((w) => l.nameUz.toLowerCase().includes(w.slice(0, 5)) || l.nameRu.toLowerCase().includes(w.slice(0, 5))).length })).sort((a, b) => b.s - a.s);
  return scored[0]?.s ? { categoryId: scored[0].l.id, source: "name" as const, attributes: [] } : null;
}

// ── A/B experiments ──────────────────────────────────────────────────────

export async function startExperiment(shopId: string, productId: string, input: { type: "title" | "image"; title?: string; image?: string }) {
  const p = await db.product.findFirst({ where: { id: productId, shopId }, include: { media: { orderBy: { sort: "asc" } } } });
  if (!p) throw new AppError("notFound");
  if (await db.productExperiment.findFirst({ where: { productId, status: "RUNNING" } })) throw new AppError("experimentRunning");
  const a = input.type === "title" ? { title: p.titleUz } : { image: p.media[0]?.url ?? "" };
  const b = input.type === "title" ? { title: input.title?.trim() ?? "" } : { image: input.image ?? "" };
  if (input.type === "title" && (b.title?.length ?? 0) < 5) throw new AppError("invalidInput");
  if (input.type === "image" && !p.media.some((m) => m.url === b.image)) throw new AppError("invalidInput");
  return db.productExperiment.create({ data: { productId, type: input.type, variantA: a, variantB: b } });
}

/** Stop the test; applying the winner rewrites the title or reorders photos. */
export async function stopExperiment(shopId: string, experimentId: string, apply: boolean) {
  const e = await db.productExperiment.findFirst({ where: { id: experimentId, product: { shopId } } });
  if (!e || e.status !== "RUNNING") throw new AppError("notFound");
  const ctrA = e.impressionsA ? e.clicksA / e.impressionsA : 0;
  const ctrB = e.impressionsB ? e.clicksB / e.impressionsB : 0;
  const winner = ctrB > ctrA ? "B" : "A";
  await db.productExperiment.update({ where: { id: e.id }, data: { status: "ENDED", winner, endedAt: new Date() } });
  if (apply && winner === "B") {
    const b = e.variantB as { title?: string; image?: string };
    if (e.type === "title" && b.title) {
      await db.product.update({ where: { id: e.productId }, data: { titleUz: b.title } });
      await rebuildSearchText(e.productId);
    }
    if (e.type === "image" && b.image) {
      const media = await db.productMedia.findMany({ where: { productId: e.productId }, orderBy: { sort: "asc" } });
      const ordered = [...media.filter((m) => m.url === b.image), ...media.filter((m) => m.url !== b.image)];
      for (const [i, m] of ordered.entries()) await db.productMedia.update({ where: { id: m.id }, data: { sort: i } });
    }
  }
  return winner;
}

/** Leaf categories as "Parent › Child" options with their commission rate (for the editor). */
export async function categoryOptions(locale: string) {
  const all = await db.category.findMany({ where: { isActive: true }, select: { id: true, parentId: true, nameUz: true, nameRu: true, commissionRate: true, sort: true }, orderBy: { sort: "asc" } });
  const byId = new Map(all.map((c) => [c.id, c]));
  const name = (c: (typeof all)[number]) => (locale === "ru" ? c.nameRu : c.nameUz);
  const leaves = all.filter((c) => !all.some((x) => x.parentId === c.id));
  return leaves.map((c) => {
    const chain = [];
    let cur: (typeof all)[number] | undefined = c;
    while (cur) {
      chain.unshift(name(cur));
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    let rate = c.commissionRate;
    let p = c.parentId ? byId.get(c.parentId) : undefined;
    while (rate == null && p) {
      rate = p.commissionRate;
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return { id: c.id, label: chain.join(" › "), commissionRate: rate ?? 0.1 };
  }).sort((a, b) => a.label.localeCompare(b.label));
}
