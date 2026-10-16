import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { loc } from "@/lib/localized";
import type { PromotionType } from "@/generated/prisma/enums";

type Actor = { userId: string; login: string };

/**
 * Reference price for "honest discount" checks: the lowest price of the default variant in the
 * last 30 days, so a seller cannot raise the price right before a sale to fake a bigger discount.
 */
async function referencePrices(productIds: string[]) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const variants = await db.variant.findMany({ where: { productId: { in: productIds } }, orderBy: [{ isDefault: "desc" }, { price: "asc" }], include: { priceHistory: { where: { recordedAt: { gte: since } }, select: { price: true } } } });
  const out = new Map<string, { current: number; reference: number }>();
  for (const v of variants) {
    if (out.has(v.productId)) continue;
    out.set(v.productId, { current: v.price, reference: Math.min(v.price, ...v.priceHistory.map((h) => h.price)) });
  }
  return out;
}

export async function promotionsOverview(shopId: string, locale: string) {
  const now = new Date();
  const [campaigns, mine, products] = await Promise.all([
    db.campaign.findMany({ where: { status: { in: ["SCHEDULED", "ACTIVE"] }, endsAt: { gt: now } }, orderBy: { startsAt: "asc" }, include: { products: { where: { shopId }, include: { product: { select: { titleUz: true, titleRu: true, price: true } } } } } }),
    db.promotion.findMany({ where: { shopId }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] }),
    db.product.findMany({ where: { shopId, status: "ACTIVE", deletedAt: null }, select: { id: true, titleUz: true, titleRu: true, price: true }, orderBy: { soldCount: "desc" }, take: 300 }),
  ]);
  const refs = await referencePrices(products.map((p) => p.id));
  const title = new Map(products.map((p) => [p.id, loc(p, "title", locale)]));
  return {
    campaigns: campaigns.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: loc(c, "name", locale),
      description: loc(c, "description", locale),
      type: c.type,
      status: c.status,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      minDiscount: c.minDiscountPercent,
      live: c.status === "ACTIVE" && c.startsAt <= now,
      joined: c.products.map((p) => ({ productId: p.productId, title: loc(p.product, "title", locale), price: p.product.price, salePrice: p.salePrice, stockLimit: p.stockLimit, sold: p.sold, status: p.status })),
    })),
    promotions: mine.map((p) => ({
      id: p.id,
      type: p.type,
      name: loc(p, "name", locale),
      nameUz: p.nameUz,
      nameRu: p.nameRu,
      discountPercent: p.discountPercent,
      minQty: p.minQty,
      productIds: p.productIds,
      products: p.productIds.map((id) => title.get(id) ?? "—"),
      startsAt: p.startsAt?.toISOString() ?? null,
      endsAt: p.endsAt?.toISOString() ?? null,
      isActive: p.isActive,
      live: p.isActive && (!p.startsAt || p.startsAt <= now) && (!p.endsAt || p.endsAt > now),
    })),
    products: products.map((p) => ({ id: p.id, title: title.get(p.id)!, price: p.price, reference: refs.get(p.id)?.reference ?? p.price })),
  };
}

export async function joinCampaign(shop: { id: string; restrictedAt: Date | null }, actor: Actor, campaignId: string, items: Array<{ productId: string; salePrice: number; stockLimit?: number | null }>) {
  if (shop.restrictedAt) throw new AppError("shopRestricted");
  const c = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!c || !["SCHEDULED", "ACTIVE"].includes(c.status) || c.endsAt <= new Date()) throw new AppError("notFound");
  const ids = [...new Set(items.map((i) => i.productId))];
  const own = await db.product.count({ where: { id: { in: ids }, shopId: shop.id, status: "ACTIVE", deletedAt: null } });
  if (own !== ids.length) throw new AppError("forbidden");
  const refs = await referencePrices(ids);
  for (const it of items) {
    const ref = refs.get(it.productId)!.reference;
    const max = Math.floor(ref * (1 - c.minDiscountPercent / 100));
    if (it.salePrice > max) throw new AppError("discountTooLow", { min: c.minDiscountPercent, max }, "salePrice");
    if (it.salePrice < 1000) throw new AppError("invalidInput", undefined, "salePrice");
  }
  // Rule checks passed (honest discount, own active products): approved automatically; admins can still reject.
  for (const it of items)
    await db.campaignProduct.upsert({
      where: { campaignId_productId: { campaignId, productId: it.productId } },
      create: { campaignId, productId: it.productId, shopId: shop.id, salePrice: it.salePrice, stockLimit: it.stockLimit ?? null, status: "APPROVED" },
      update: { salePrice: it.salePrice, stockLimit: it.stockLimit ?? null, status: "APPROVED" },
    });
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: "campaign.join", entityType: "Campaign", entityId: campaignId, after: { products: ids.length } });
  return { joined: items.length };
}

/** Leaving is allowed until the campaign starts; buyers rely on sale prices once it is live. */
export async function leaveCampaign(shopId: string, campaignId: string, productId: string) {
  const c = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new AppError("notFound");
  if (c.status === "ACTIVE" && c.startsAt <= new Date()) throw new AppError("campaignLive");
  await db.campaignProduct.deleteMany({ where: { campaignId, productId, shopId } });
}

export type PromotionInput = { type: PromotionType; nameUz: string; nameRu: string; discountPercent: number; minQty: number; productIds: string[]; startsAt?: Date | null; endsAt?: Date | null };

export async function savePromotion(shopId: string, actor: Actor, input: PromotionInput, id?: string) {
  const ids = [...new Set(input.productIds)];
  const own = await db.product.count({ where: { id: { in: ids }, shopId, deletedAt: null } });
  if (!ids.length || own !== ids.length) throw new AppError("forbidden", undefined, "productIds");
  if (input.type !== "MULTI_BUY" && ids.length < 2) throw new AppError("bundleProducts", undefined, "productIds");
  if (input.type === "MULTI_BUY" && input.minQty < 2) throw new AppError("invalidInput", undefined, "minQty");
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) throw new AppError("dateRange", undefined, "endsAt");
  const data = { type: input.type, nameUz: input.nameUz.trim(), nameRu: input.nameRu.trim() || input.nameUz.trim(), discountPercent: input.discountPercent, minQty: input.type === "MULTI_BUY" ? input.minQty : ids.length, productIds: ids, startsAt: input.startsAt ?? null, endsAt: input.endsAt ?? null };
  const row = id ? await db.promotion.update({ where: { id, shopId }, data }) : await db.promotion.create({ data: { ...data, shopId } });
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: id ? "promotion.update" : "promotion.create", entityType: "Promotion", entityId: row.id, after: { type: row.type, discountPercent: row.discountPercent } });
  return row;
}

export async function setPromotionActive(shopId: string, id: string, isActive: boolean) {
  const res = await db.promotion.updateMany({ where: { id, shopId }, data: { isActive } });
  if (!res.count) throw new AppError("notFound");
}

export async function deletePromotion(shopId: string, id: string) {
  const res = await db.promotion.deleteMany({ where: { id, shopId } });
  if (!res.count) throw new AppError("notFound");
}
