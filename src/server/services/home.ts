import "server-only";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { LIVE_SHOP, cardsByIds, cardInclude, getPlans, recentlyViewedIds, recommendedIds, toCard } from "./catalog";
import { getCurrentUser } from "@/server/auth/session";

export async function anonId(): Promise<string | null> {
  return (await cookies()).get("anor_aid")?.value ?? null;
}

async function campaignCards(type: "DEAL_OF_DAY" | "FLASH_SALE", locale: string) {
  const now = new Date();
  const campaign = await db.campaign.findFirst({ where: { type, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { endsAt: "asc" } });
  if (!campaign) return null;
  const items = await db.campaignProduct.findMany({ where: { campaignId: campaign.id, status: "APPROVED" }, select: { productId: true, sold: true, stockLimit: true } });
  const cards = await cardsByIds(items.map((i) => i.productId), locale);
  return { campaign, cards, progress: Object.fromEntries(items.map((i) => [i.productId, i.stockLimit ? Math.round((i.sold / i.stockLimit) * 100) : null])) };
}

export async function getHomeData(locale: string) {
  const user = await getCurrentUser();
  const aid = await anonId();
  const plans = await getPlans();
  const now = new Date();
  const [banners, strip, categories, deal, flash, popular, fresh, madeInUz, recIds, recentIds, stories] = await Promise.all([
    db.banner.findMany({ where: { placement: "HOME_HERO", isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] }, orderBy: { sort: "asc" } }),
    db.banner.findFirst({ where: { placement: "HOME_STRIP", isActive: true }, orderBy: { sort: "asc" } }),
    db.category.findMany({ where: { parentId: null, isActive: true }, orderBy: { sort: "asc" } }),
    campaignCards("DEAL_OF_DAY", locale),
    campaignCards("FLASH_SALE", locale),
    db.product.findMany({ where: { status: "ACTIVE", deletedAt: null, shop: LIVE_SHOP }, include: cardInclude(), orderBy: { soldCount: "desc" }, take: 10 }),
    db.product.findMany({ where: { status: "ACTIVE", deletedAt: null, shop: LIVE_SHOP }, include: cardInclude(), orderBy: { publishedAt: "desc" }, take: 10 }),
    db.product.findMany({ where: { status: "ACTIVE", deletedAt: null, shop: LIVE_SHOP, madeInUz: true }, include: cardInclude(), orderBy: [{ rating: "desc" }, { soldCount: "desc" }], take: 10 }),
    recommendedIds(user?.id ?? null, aid, 10),
    recentlyViewedIds(user?.id ?? null, aid, undefined, 10),
    db.story.findMany({ where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, include: { shop: { select: { name: true, slug: true, logoUrl: true } } }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const [recommended, recent] = await Promise.all([cardsByIds(recIds, locale), cardsByIds(recentIds, locale)]);
  return {
    banners,
    strip,
    categories,
    deal,
    flash,
    popular: popular.map((p) => toCard(p, locale, plans)),
    fresh: fresh.map((p) => toCard(p, locale, plans)),
    madeInUz: madeInUz.map((p) => toCard(p, locale, plans)),
    recommended,
    recent,
    stories,
  };
}
