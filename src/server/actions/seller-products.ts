"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, AppError, zBool, zInt } from "@/server/action";
import { LIMITS } from "@/server/security/rate-limit";
import { activeShop } from "@/server/services/seller/context";
import { bulkUpdate, cancelScheduledPrice, importRows, saveProduct, schedulePrice, startExperiment, stopExperiment, suggestCategory } from "@/server/services/seller/products";
import { db } from "@/server/db";
import { parseCsv, validateImport } from "@/lib/seller";

const rl = { key: "seller.products", ...LIMITS.mutation };
const price = zInt(1000, 1_000_000_000);

const zProduct = z.object({
  id: z.string().optional(),
  titleUz: z.string().trim().min(5).max(200),
  titleRu: z.string().trim().min(5).max(200),
  descriptionUz: z.string().max(10_000).default(""),
  descriptionRu: z.string().max(10_000).default(""),
  categoryId: z.string().min(1),
  brandId: z.string().nullable().optional(),
  specs: z.array(z.object({ keyUz: z.string().max(80), keyRu: z.string().max(80), value: z.string().max(200) })).max(40).default([]),
  media: z.array(z.string().max(500)).max(12).default([]),
  videoUrl: z.string().url().max(500).nullable().optional().or(z.literal("")),
  fulfillment: z.enum(["FBO", "FBS", "DBS"]),
  weightGrams: zInt(1, 200_000),
  isHalal: zBool.default(false),
  madeInUz: zBool.default(false),
  condition: z.enum(["NEW", "USED_A", "USED_B", "USED_C"]).default("NEW"),
  isPreorder: zBool.default(false),
  wholesale: z.array(z.object({ minQty: zInt(2, 100_000), price })).max(5).default([]),
  keywords: z.string().max(300).optional(),
  variants: z
    .array(z.object({ id: z.string().optional(), titleUz: z.string().max(80).default(""), titleRu: z.string().max(80).default(""), sku: z.string().trim().regex(/^[A-Za-z0-9._-]{2,40}$/, "invalidFormat"), barcode: z.string().trim().regex(/^\d{8,14}$/, "invalidFormat").optional().or(z.literal("")), price, oldPrice: zInt(1000, 1_000_000_000).nullable().optional(), costPrice: zInt(0, 1_000_000_000).nullable().optional(), stock: zInt(0, 1_000_000) }))
    .min(1)
    .max(50),
  publish: z.boolean(),
});

export const saveProductAction = action({ rateLimit: rl, schema: zProduct }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  const res = await saveProduct(shop, { userId: ctx.user.id, login: ctx.user.login }, { ...input, videoUrl: input.videoUrl || null });
  revalidatePath("/[locale]/seller/products", "page");
  return { ok: true, data: res };
});

export const bulkProductsAction = action(
  {
    rateLimit: rl,
    schema: z.object({
      ids: z.array(z.string()).min(1).max(500),
      op: z.discriminatedUnion("kind", [z.object({ kind: z.literal("pricePercent"), percent: z.number().int().min(-90).max(300) }), z.object({ kind: z.literal("status"), status: z.enum(["ACTIVE", "ARCHIVED"]) }), z.object({ kind: z.literal("stock"), quantity: zInt(0, 1_000_000) }), z.object({ kind: z.literal("delete") })]),
    }),
  },
  async (input, ctx) => {
    const shop = await activeShop(ctx.user.id);
    const count = await bulkUpdate(shop, { userId: ctx.user.id, login: ctx.user.login }, input.ids, input.op);
    revalidatePath("/[locale]/seller/products", "page");
    return { ok: true, data: { count } };
  },
);

export const schedulePriceAction = action({ rateLimit: rl, schema: z.object({ variantId: z.string(), newPrice: price, newOldPrice: zInt(1000, 1_000_000_000).nullable().optional(), startsAt: z.coerce.date(), endsAt: z.coerce.date().nullable().optional() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await schedulePrice(shop.id, input.variantId, input);
});

export const cancelScheduledPriceAction = action({ schema: z.object({ id: z.string() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  await cancelScheduledPrice(shop.id, input.id);
});

export const suggestCategoryAction = action({ rateLimit: { key: "seller.suggest", limit: 30, window: 300 }, schema: z.object({ title: z.string().min(3).max(200), description: z.string().max(5000).optional() }) }, async (input) => ({ ok: true, data: await suggestCategory(input.title, input.description) }));

export const startExperimentAction = action({ rateLimit: rl, schema: z.object({ productId: z.string(), type: z.enum(["title", "image"]), title: z.string().max(200).optional(), image: z.string().max(500).optional() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  if (shop.tier !== "PRO") throw new AppError("proOnly");
  await startExperiment(shop.id, input.productId, input);
});

export const stopExperimentAction = action({ schema: z.object({ experimentId: z.string(), apply: z.boolean() }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  return { ok: true, data: { winner: await stopExperiment(shop.id, input.experimentId, input.apply) } };
});

const MAX_CSV = 2_000_000;

async function parseImport(csv: string) {
  if (csv.length > MAX_CSV) throw new AppError("fileSize");
  const categories = new Set((await db.category.findMany({ where: { children: { none: {} } }, select: { slug: true } })).map((c) => c.slug));
  return validateImport(parseCsv(csv), categories);
}

export const importPreviewAction = action({ rateLimit: { key: "seller.import", limit: 20, window: 600 }, schema: z.object({ csv: z.string().max(MAX_CSV) }) }, async (input) => {
  const r = await parseImport(input.csv);
  return { ok: true, data: { valid: r.rows.length, sample: r.rows.slice(0, 8), issues: r.issues.slice(0, 200), issueCount: r.issues.length } };
});

export const importCommitAction = action({ rateLimit: { key: "seller.import", limit: 20, window: 600 }, schema: z.object({ csv: z.string().max(MAX_CSV) }) }, async (input, ctx) => {
  const shop = await activeShop(ctx.user.id);
  const r = await parseImport(input.csv);
  if (!r.rows.length) throw new AppError("importEmpty");
  const res = await importRows(shop, { userId: ctx.user.id, login: ctx.user.login }, r.rows.slice(0, 2000));
  revalidatePath("/[locale]/seller/products", "page");
  return { ok: true, data: res };
});
