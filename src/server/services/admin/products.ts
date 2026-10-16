import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { inflatedOldPrice, prohibitedTerms } from "@/lib/seller";
import type { Prisma } from "@/generated/prisma/client";
import type { Staff } from "./shops";

export const PRODUCT_TABS = ["pending", "rejected", "active", "all"] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

const TAB_WHERE: Record<ProductTab, Prisma.ProductWhereInput> = {
  pending: { status: "PENDING" },
  rejected: { status: "REJECTED" },
  active: { status: "ACTIVE" },
  all: {},
};

/** Moderation queue with risk signals computed per listing. */
export async function moderationQueue(tab: ProductTab, opts: { q?: string; shopId?: string; page: number }, pageSize = 20) {
  const q = opts.q?.trim();
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...TAB_WHERE[tab],
    ...(opts.shopId ? { shopId: opts.shopId } : {}),
    ...(q ? { OR: [{ titleUz: { contains: q, mode: "insensitive" } }, { titleRu: { contains: q, mode: "insensitive" } }, { slug: { contains: q } }, { variants: { some: { sku: { contains: q, mode: "insensitive" } } } }] } : {}),
  };
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [rows, total, counts] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: tab === "pending" ? { updatedAt: "asc" } : { updatedAt: "desc" },
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
      include: {
        shop: { select: { id: true, name: true, slug: true, approvedAt: true, status: true } },
        category: { select: { nameUz: true, nameRu: true } },
        brand: { select: { name: true } },
        media: { orderBy: { sort: "asc" }, take: 4, select: { url: true } },
        variants: { select: { sku: true, price: true, oldPrice: true, priceHistory: { where: { recordedAt: { gte: since } }, select: { price: true } } } },
      },
    }),
    db.product.count({ where }),
    Promise.all(PRODUCT_TABS.map((t) => db.product.count({ where: { deletedAt: null, ...TAB_WHERE[t] } }))),
  ]);
  return {
    total,
    counts: Object.fromEntries(PRODUCT_TABS.map((t, i) => [t, counts[i]])) as Record<ProductTab, number>,
    rows: rows.map((p) => {
      const terms = prohibitedTerms(`${p.titleUz} ${p.titleRu} ${p.descriptionUz} ${p.descriptionRu}`);
      const inflated = p.variants.filter((v) => inflatedOldPrice(v.oldPrice, v.priceHistory.map((h) => h.price), v.price)).map((v) => v.sku);
      const newShop = !p.shop.approvedAt || Date.now() - p.shop.approvedAt.getTime() < 14 * 86_400_000;
      const signals = [...(terms.length ? [{ key: "terms", value: terms.join(", ") }] : []), ...(inflated.length ? [{ key: "inflatedOldPrice", value: inflated.join(", ") }] : []), ...(newShop ? [{ key: "newShop", value: "" }] : []), ...(!p.media.length ? [{ key: "noPhotos", value: "" }] : []), ...(p.descriptionUz.length < 40 ? [{ key: "shortDescription", value: "" }] : [])];
      return {
        id: p.id,
        slug: p.slug,
        titleUz: p.titleUz,
        titleRu: p.titleRu,
        description: p.descriptionUz.slice(0, 400),
        status: p.status,
        note: p.moderationNote,
        shop: p.shop,
        category: p.category,
        brand: p.brand?.name ?? null,
        images: p.media.map((m) => m.url),
        price: p.price,
        oldPrice: p.oldPrice,
        variants: p.variants.length,
        signals,
        updatedAt: p.updatedAt.toISOString(),
      };
    }),
  };
}

async function notifyShops(productIds: string[], title: string, body: (n: number) => string, href: string) {
  const owners = await db.product.groupBy({ by: ["shopId"], where: { id: { in: productIds } }, _count: { _all: true } });
  for (const o of owners) {
    const shop = await db.shop.findUnique({ where: { id: o.shopId }, select: { ownerId: true } });
    if (shop) await notify({ userId: shop.ownerId, type: "seller.products_moderated", title, body: body(o._count._all), href });
  }
}

export async function approveProducts(ids: string[], staff: Staff) {
  const rows = await db.product.findMany({ where: { id: { in: ids }, status: { in: ["PENDING", "REJECTED"] }, deletedAt: null }, select: { id: true, publishedAt: true } });
  for (const p of rows) await db.product.update({ where: { id: p.id }, data: { status: "ACTIVE", moderationNote: null, publishedAt: p.publishedAt ?? new Date() } });
  for (const p of rows) await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: "product.approved", entityType: "Product", entityId: p.id });
  await notifyShops(rows.map((r) => r.id), "Mahsulotlar tasdiqlandi", (n) => `${n} ta mahsulot sotuvga chiqdi`, "/seller/products?status=ACTIVE");
  return rows.length;
}

/** Reject pending listings or take an active one off sale; the seller sees the note and can fix it. */
export async function rejectProducts(ids: string[], staff: Staff, reason: string) {
  const rows = await db.product.findMany({ where: { id: { in: ids }, status: { in: ["PENDING", "ACTIVE", "DRAFT"] }, deletedAt: null }, select: { id: true, status: true } });
  if (!rows.length) throw new AppError("invalidTransition");
  await db.product.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "REJECTED", moderationNote: reason } });
  for (const p of rows) await audit({ actorId: staff.userId, actorLogin: staff.login, actorKind: "staff", action: p.status === "ACTIVE" ? "product.taken_down" : "product.rejected", entityType: "Product", entityId: p.id, meta: { reason } });
  await notifyShops(rows.map((r) => r.id), "Mahsulot rad etildi", (n) => `${n} ta mahsulot: ${reason}`, "/seller/products?status=REJECTED");
  return rows.length;
}
