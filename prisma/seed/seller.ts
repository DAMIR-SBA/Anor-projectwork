// Phase 6 demo data: seller cabinet (active orders with SLA timers, payouts, ads with stats, FBO
// supplies, a disputed return, penalties, certifications, promotions, an A/B test, competitor shop).
import { randomBytes } from "node:crypto";
import { prisma } from "./client";
import { createUser, type DemoAccounts } from "./rbac";
import { logisticsFee } from "../../src/lib/pricing";
import { payoutWeek, payoutNet } from "../../src/lib/seller";
import { dayKey } from "../../src/lib/chat";

const DAY = 86_400_000;
const HOUR = 3_600_000;
let seed = 4242;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join("");

type Shop = { id: string; slug: string; ownerId: string };

async function shopBySlug(slug: string): Promise<Shop> {
  const s = await prisma.shop.findUniqueOrThrow({ where: { slug }, select: { id: true, slug: true, ownerId: true } });
  return s;
}

/** Realistic logistics fees and private cost prices on existing data. */
async function backfillEconomics() {
  const variants = await prisma.variant.findMany({ where: { costPrice: null }, select: { id: true, price: true } });
  for (const v of variants) await prisma.variant.update({ where: { id: v.id }, data: { costPrice: Math.round((v.price * (0.52 + rnd() * 0.2)) / 100) * 100 } });
  const orders = await prisma.order.findMany({ where: { logisticsFee: 0, fulfillment: { not: "DBS" } }, select: { id: true, fulfillment: true, items: { select: { quantity: true, product: { select: { weightGrams: true } } } } } });
  for (const o of orders) {
    const fee = o.items.reduce((s, i) => s + logisticsFee(o.fulfillment, i.product.weightGrams, i.quantity), 0);
    await prisma.order.update({ where: { id: o.id }, data: { logisticsFee: fee } });
  }
}

async function activeOrder(shop: Shop, buyerId: string, opts: { status: "PLACED" | "CONFIRMED" | "PACKED" | "SHIPPED"; fulfillment: "FBS" | "DBS" | "FBO"; ageHours: number; slaHours?: number; method?: "COURIER" | "PICKUP"; pickupPointId?: string | null }) {
  const variant = await prisma.variant.findFirst({ where: { stock: { gt: 0 }, product: { shopId: shop.id, status: "ACTIVE", fulfillment: opts.fulfillment } }, orderBy: { sku: "asc" }, skip: Math.floor(rnd() * 5), include: { product: { include: { media: { take: 1, orderBy: { sort: "asc" } }, category: { select: { commissionRate: true } } } } } });
  if (!variant) return null;
  const qty = rnd() < 0.25 ? 2 : 1;
  const subtotal = variant.price * qty;
  const rate = variant.product.category.commissionRate ?? 0.1;
  const placedAt = new Date(Date.now() - opts.ageHours * HOUR);
  const n = `${dayKey(placedAt).slice(2).replace(/-/g, "")}-6${digits(4)}`;
  const confirmedAt = opts.status === "PLACED" ? null : new Date(placedAt.getTime() + 0.5 * HOUR);
  const sla = opts.fulfillment === "FBS" && confirmedAt ? new Date(Date.now() + (opts.slaHours ?? 20) * HOUR) : null;
  const method = opts.method ?? "COURIER";
  const group = await prisma.orderGroup.create({
    data: {
      number: n,
      userId: buyerId,
      subtotal,
      total: subtotal,
      paymentMethod: "PAYME",
      paymentStatus: "PAID",
      createdAt: placedAt,
      orders: {
        create: {
          number: `${n}-1`,
          userId: buyerId,
          shopId: shop.id,
          status: opts.status,
          fulfillment: opts.fulfillment,
          subtotal,
          total: subtotal,
          commissionTotal: Math.round(subtotal * rate),
          logisticsFee: logisticsFee(opts.fulfillment, variant.product.weightGrams, qty),
          deliveryMethod: method,
          pickupPointId: method === "PICKUP" ? (opts.pickupPointId ?? null) : null,
          region: "toshkent_sh",
          paymentMethod: "PAYME",
          address: method === "COURIER" ? { recipient: "Madina Saidova", phone: "+998901234567", city: "Toshkent", street: "Amir Temur ko‘chasi", house: String(10 + Math.floor(rnd() * 90)), apartment: String(1 + Math.floor(rnd() * 60)) } : undefined,
          recipientName: "Madina Saidova",
          recipientPhone: "+998901234567",
          pickupCode: opts.fulfillment === "DBS" ? digits(4) : null,
          confirmedAt,
          slaDeadline: sla,
          createdAt: placedAt,
          items: { create: { productId: variant.productId, variantId: variant.id, title: variant.product.titleUz, variantTitle: variant.titleUz || null, imageUrl: variant.product.media[0]?.url ?? null, unitPrice: variant.price, oldPrice: variant.oldPrice, quantity: qty, commissionRate: rate, commissionAmount: Math.round(subtotal * rate) } },
          events: { create: (["PLACED", "CONFIRMED", "PACKED", "SHIPPED"] as const).slice(0, ["PLACED", "CONFIRMED", "PACKED", "SHIPPED"].indexOf(opts.status) + 1).map((status, k) => ({ status, createdAt: new Date(placedAt.getTime() + k * 0.5 * HOUR) })) },
        },
      },
    },
    include: { orders: true },
  });
  const order = group.orders[0];
  if (opts.status !== "PLACED")
    await prisma.shipment.create({
      data: {
        orderId: order.id,
        type: method,
        status: opts.status === "SHIPPED" ? "IN_TRANSIT" : opts.fulfillment === "FBS" ? "AWAITING_HANDOVER" : "PENDING",
        trackingNumber: `ANR${digits(10)}`,
        handoverDeadline: sla,
        handedOverAt: opts.status === "SHIPPED" && opts.fulfillment === "FBS" ? new Date(Date.now() - 2 * HOUR) : null,
      },
    });
  return order;
}

/** Weekly settlements for the last six weeks from delivered orders (older weeks paid, last week pending). */
async function payouts(shopId: string) {
  const now = new Date();
  const current = payoutWeek(now).start;
  for (let w = 6; w >= 1; w--) {
    const start = new Date(current.getTime() - w * 7 * DAY);
    const end = new Date(start.getTime() + 7 * DAY);
    const orders = await prisma.order.findMany({ where: { shopId, status: "DELIVERED", deliveredAt: { gte: start, lt: end } }, select: { total: true, commissionTotal: true, logisticsFee: true } });
    if (!orders.length) continue;
    const totals = { gross: orders.reduce((s, o) => s + o.total, 0), commission: orders.reduce((s, o) => s + o.commissionTotal, 0), logistics: orders.reduce((s, o) => s + o.logisticsFee, 0), adSpend: 0, penalties: 0, refunds: 0 };
    const paid = w > 1;
    await prisma.payout.upsert({
      where: { shopId_periodStart: { shopId, periodStart: start } },
      update: {},
      create: { shopId, periodStart: start, periodEnd: end, ...totals, net: payoutNet(totals), ordersCount: orders.length, status: paid ? "PAID" : "PENDING", reference: paid ? `ANR-PO-${digits(10)}` : null, paidAt: paid ? new Date(end.getTime() + 2 * DAY + 10 * HOUR) : null },
    });
  }
}

async function adCampaign(shop: Shop, data: { name: string; placement: "SEARCH" | "CATEGORY"; bidModel: "CPC" | "CPM"; bid: number; dailyBudget: number; keywords?: string[]; categorySlug?: string; status?: "ACTIVE" | "PAUSED" }) {
  const products = await prisma.product.findMany({ where: { shopId: shop.id, status: "ACTIVE", ...(data.categorySlug ? { category: { OR: [{ slug: data.categorySlug }, { parent: { slug: data.categorySlug } }] } } : {}) }, orderBy: { soldCount: "desc" }, take: 4, select: { id: true, price: true } });
  if (!products.length) return;
  const category = data.categorySlug ? await prisma.category.findUnique({ where: { slug: data.categorySlug } }) : null;
  const c = await prisma.adCampaign.create({ data: { shopId: shop.id, name: data.name, placement: data.placement, bidModel: data.bidModel, bid: data.bid, dailyBudget: data.dailyBudget, keywords: data.keywords ?? [], categoryId: category?.id ?? null, productIds: products.map((p) => p.id), status: data.status ?? "ACTIVE", startsAt: new Date(Date.now() - 21 * DAY) } });
  let spent = 0;
  const avgPrice = products.reduce((s, p) => s + p.price, 0) / products.length;
  for (let d = 20; d >= 1; d--) {
    const impressions = 600 + Math.floor(rnd() * 900);
    const clicks = Math.floor(impressions * (0.018 + rnd() * 0.025));
    const orders = Math.floor(clicks * (0.03 + rnd() * 0.05));
    const spend = Math.min(data.dailyBudget, data.bidModel === "CPC" ? clicks * data.bid : Math.ceil((impressions * data.bid) / 1000));
    spent += spend;
    await prisma.adStat.create({ data: { adCampaignId: c.id, day: dayKey(new Date(Date.now() - d * DAY)), impressions, clicks, orders, revenue: Math.round(orders * avgPrice), spend } });
  }
  await prisma.adCampaign.update({ where: { id: c.id }, data: { spent } });
}

/** A second electronics shop listing some of the same items (same EAN) — feeds competitor monitoring. */
async function competitorShop(tech: Shop) {
  if (await prisma.shop.findUnique({ where: { slug: "gadjet-markaz" } })) return;
  const owner = await createUser({ login: "demo_gadget", name: "Ulug‘bek Hamidov", password: `Demo-${randomBytes(9).toString("base64url")}`, phone: "+998998887766" });
  const shop = await prisma.shop.create({
    data: { ownerId: owner.id, slug: "gadjet-markaz", name: "Gadjet Markaz", descriptionUz: "Smartfonlar, aksessuarlar va gadjetlar — qulay narxlarda.", descriptionRu: "Смартфоны, аксессуары и гаджеты по доступным ценам.", legalType: "INDIVIDUAL_ENTREPRENEUR", legalName: "Gadjet Markaz", taxId: "498765432", bankName: "Ipoteka bank", bankAccount: null, bankMfo: "00873", status: "APPROVED", kycLevel: 2, city: "Toshkent", approvedAt: new Date(Date.now() - 120 * DAY), rating: 4.5, reviewCount: 38, fulfillmentScore: 91 },
  });
  const wh = await prisma.warehouse.create({ data: { code: "SELLER-GADJET", name: "Gadjet Markaz ombori", type: "SELLER", shopId: shop.id, region: "toshkent_sh", city: "Toshkent", address: "Chilonzor, 9-kvartal" } });
  const originals = await prisma.product.findMany({ where: { shopId: tech.id, status: "ACTIVE", variants: { some: { barcode: { not: null } } } }, orderBy: { soldCount: "desc" }, take: 6, include: { variants: true, media: true } });
  for (const [i, p] of originals.entries()) {
    // Mix of cheaper and pricier offers so every position (cheapest / competitive / expensive) shows up.
    const factor = [0.94, 1.03, 0.97, 1.08, 0.99, 0.92][i] ?? 1;
    const round = (v: number) => Math.round((v * factor) / 1000) * 1000;
    await prisma.product.create({
      data: {
        shopId: shop.id,
        slug: `${p.slug}-gm`,
        titleUz: p.titleUz,
        titleRu: p.titleRu,
        descriptionUz: p.descriptionUz,
        descriptionRu: p.descriptionRu,
        categoryId: p.categoryId,
        brandId: p.brandId,
        status: "ACTIVE",
        fulfillment: "FBS",
        price: round(p.price),
        oldPrice: p.oldPrice ? round(p.oldPrice) : null,
        discountPct: p.discountPct,
        weightGrams: p.weightGrams,
        rating: 4.3 + rnd() * 0.6,
        reviewCount: 3 + Math.floor(rnd() * 20),
        soldCount: 10 + Math.floor(rnd() * 80),
        searchText: p.searchText,
        publishedAt: new Date(Date.now() - 60 * DAY),
        media: { create: p.media.map((m) => ({ url: m.url, type: m.type, sort: m.sort, alt: m.alt })) },
        variants: {
          create: p.variants.map((v) => ({ sku: `GM-${v.sku}`.slice(0, 60), barcode: v.barcode, titleUz: v.titleUz, titleRu: v.titleRu, options: v.options ?? undefined, price: round(v.price), oldPrice: v.oldPrice ? round(v.oldPrice) : null, stock: 5 + Math.floor(rnd() * 20), isDefault: v.isDefault, stocks: { create: { warehouseId: wh.id, quantity: 5 + Math.floor(rnd() * 20) } } })),
        },
      },
    });
  }
}

export async function seedSellerCabinet(people: DemoAccounts) {
  const tech = await shopBySlug("techhub");
  if (await prisma.adCampaign.findFirst({ where: { shopId: tech.id } })) return console.log("  seller cabinet: already seeded");
  const moda = await shopBySlug("moda-bazar");
  const hunar = await shopBySlug("hunarmand-ustaxonasi");
  const food = await shopBySlug("samarqand-nematlari");
  const buyers = [people.buyer, ...people.extraBuyers];
  const buyer = () => buyers[Math.floor(rnd() * buyers.length)].id;

  await backfillEconomics();

  // Active orders: new, SLA running (one urgent, one already late), packed, shipped DBS.
  const pvz = await prisma.pickupPoint.findFirst({ select: { id: true } });
  for (const [shop, fbs] of [
    [moda, true],
    [tech, true],
  ] as const) {
    for (let i = 0; i < 3; i++) await activeOrder(shop, buyer(), { status: "PLACED", fulfillment: fbs ? "FBS" : "FBO", ageHours: 1 + i * 2 });
    await activeOrder(shop, buyer(), { status: "CONFIRMED", fulfillment: "FBS", ageHours: 20, slaHours: 3 });
    await activeOrder(shop, buyer(), { status: "CONFIRMED", fulfillment: "FBS", ageHours: 30, slaHours: -2 });
    await activeOrder(shop, buyer(), { status: "PACKED", fulfillment: "FBS", ageHours: 8, slaHours: 14, method: "PICKUP", pickupPointId: pvz?.id });
  }
  await activeOrder(hunar, buyer(), { status: "PLACED", fulfillment: "DBS", ageHours: 3 });
  await activeOrder(hunar, buyer(), { status: "SHIPPED", fulfillment: "DBS", ageHours: 26 });
  await activeOrder(food, buyer(), { status: "PLACED", fulfillment: "FBO", ageHours: 2 });

  for (const s of [tech, moda, hunar, food]) await payouts(s.id);

  // Ads with three weeks of history.
  await adCampaign(tech, { name: "Smartfonlar — qidiruv", placement: "SEARCH", bidModel: "CPC", bid: 900, dailyBudget: 150_000, keywords: ["smartfon", "telefon", "iphone", "samsung", "смартфон"] });
  await adCampaign(tech, { name: "Noutbuklar kategoriyasi", placement: "CATEGORY", bidModel: "CPM", bid: 18_000, dailyBudget: 80_000, categorySlug: "noutbuklar", status: "PAUSED" });
  await adCampaign(moda, { name: "Ayollar kiyimi — kuz", placement: "CATEGORY", bidModel: "CPM", bid: 15_000, dailyBudget: 50_000, categorySlug: "ayollar-kiyimi" });

  // FBO supplies at each stage.
  const fc = await prisma.warehouse.findUniqueOrThrow({ where: { code: "TAS-FC1" } });
  const fboVariants = await prisma.variant.findMany({ where: { product: { shopId: tech.id, fulfillment: "FBO" } }, take: 4, select: { id: true } });
  if (fboVariants.length) {
    const stages = [
      { status: "IN_STOCK" as const, days: 12 },
      { status: "ACCEPTED" as const, days: 2 },
      { status: "CREATED" as const, days: 0 },
    ];
    for (const st of stages) {
      const created = new Date(Date.now() - st.days * DAY - 4 * HOUR);
      await prisma.supplyRequest.create({
        data: {
          number: `SUP-${digits(6)}`,
          shopId: tech.id,
          warehouseId: fc.id,
          status: st.status,
          plannedAt: new Date(created.getTime() + 2 * DAY),
          createdAt: created,
          acceptedAt: st.status !== "CREATED" ? new Date(created.getTime() + 6 * HOUR) : null,
          receivedAt: st.status === "IN_STOCK" ? new Date(created.getTime() + 2 * DAY) : null,
          stockedAt: st.status === "IN_STOCK" ? new Date(created.getTime() + 2 * DAY + 5 * HOUR) : null,
          items: { create: fboVariants.slice(0, 2 + (st.days % 2)).map((v) => ({ variantId: v.id, quantity: 10 + Math.floor(rnd() * 20), receivedQty: st.status === "IN_STOCK" ? 10 : null })) },
        },
      });
    }
  }

  // Returns: one awaiting the seller, one already disputed with evidence and a timeline.
  const delivered = await prisma.order.findMany({ where: { shopId: moda.id, status: "DELIVERED", returns: { none: {} } }, orderBy: { deliveredAt: "desc" }, take: 2, include: { items: true } });
  for (const [i, o] of delivered.entries()) {
    const item = o.items[0];
    const createdAt = new Date(Date.now() - (i + 1) * 20 * HOUR);
    const r = await prisma.return.create({ data: { number: `RT-${digits(6)}`, orderId: o.id, orderItemId: item.id, userId: o.userId, reason: i === 0 ? "size" : "notAsDescribed", description: i === 0 ? "O‘lcham kichik keldi, M o‘rniga L kerak edi." : "Rangi rasmdagidan ancha farq qiladi.", status: i === 0 ? "REQUESTED" : "DISPUTED", amount: item.unitPrice * item.quantity, createdAt } });
    if (i === 1)
      await prisma.dispute.create({
        data: {
          returnId: r.id,
          shopId: moda.id,
          sellerReason: "Rang rasmga mos, mahsulot kartochkasida yorug‘likka qarab farq qilishi yozilgan. Yorliq uzilgan — tovar kiyilgan.",
          evidence: [],
          timeline: [
            { at: createdAt.toISOString(), actor: "buyer", event: "return_requested", note: "notAsDescribed: Rangi rasmdagidan ancha farq qiladi.", evidence: [] },
            { at: new Date(createdAt.getTime() + 5 * HOUR).toISOString(), actor: "seller", event: "disputed", note: "Rang rasmga mos, yorliq uzilgan — tovar kiyilgan.", evidence: [] },
          ],
        },
      });
  }

  // A late-handover penalty and its resolved warning for the BASIC demo seller.
  const late = await prisma.order.findFirst({ where: { shopId: moda.id, status: "DELIVERED", fulfillment: "FBS" }, orderBy: { deliveredAt: "desc" }, skip: 3 });
  if (late) await prisma.penalty.create({ data: { shopId: moda.id, orderId: late.id, type: "LATE_HANDOVER", amount: Math.max(10_000, Math.round(late.total * 0.02)), reason: "SLA 24h", createdAt: new Date(Date.now() - 9 * DAY) } });
  await prisma.shopWarning.create({ data: { shopId: moda.id, type: "LOW_SCORE", message: "Fulfillment score dropped to 78", createdAt: new Date(Date.now() - 40 * DAY), resolvedAt: new Date(Date.now() - 25 * DAY) } });

  // Academy: TechHub is certified (already Pro); Moda Bazar passed the basics course only.
  for (const k of ["basics", "fulfillment"]) await prisma.sellerCertification.create({ data: { shopId: tech.id, courseKey: k, score: 100, passed: true, createdAt: new Date(Date.now() - 90 * DAY) } });
  await prisma.sellerCertification.create({ data: { shopId: moda.id, courseKey: "basics", score: 80, passed: true, createdAt: new Date(Date.now() - 15 * DAY) } });
  await prisma.shop.update({ where: { id: tech.id }, data: { tierSince: new Date(Date.now() - 150 * DAY) } });

  // Seller promotions and campaign participation.
  const foodIds = (await prisma.product.findMany({ where: { shopId: food.id, status: "ACTIVE" }, take: 4, select: { id: true } })).map((p) => p.id);
  if (foodIds.length) await prisma.promotion.create({ data: { shopId: food.id, type: "MULTI_BUY", nameUz: "3 ta oling — 10% chegirma", nameRu: "Возьмите 3 — скидка 10%", discountPercent: 10, minQty: 3, productIds: foodIds } });
  const craftIds = (await prisma.product.findMany({ where: { shopId: hunar.id, status: "ACTIVE" }, take: 2, select: { id: true } })).map((p) => p.id);
  if (craftIds.length === 2) await prisma.promotion.create({ data: { shopId: hunar.id, type: "BUNDLE", nameUz: "Dasturxon to‘plami", nameRu: "Набор для дастархана", discountPercent: 12, minQty: 2, productIds: craftIds } });
  const elevenEleven = await prisma.campaign.findUnique({ where: { slug: "11-11" } });
  if (elevenEleven) {
    const items = await prisma.product.findMany({ where: { shopId: tech.id, status: "ACTIVE" }, orderBy: { soldCount: "desc" }, take: 2, select: { id: true, price: true } });
    for (const p of items) await prisma.campaignProduct.upsert({ where: { campaignId_productId: { campaignId: elevenEleven.id, productId: p.id } }, update: {}, create: { campaignId: elevenEleven.id, productId: p.id, shopId: tech.id, salePrice: Math.floor((p.price * 0.85) / 1000) * 1000, stockLimit: 50, status: "APPROVED" } });
  }

  // A running title A/B test on TechHub's best seller.
  const best = await prisma.product.findFirst({ where: { shopId: tech.id, status: "ACTIVE" }, orderBy: { soldCount: "desc" } });
  if (best) await prisma.productExperiment.create({ data: { productId: best.id, type: "title", variantA: { title: best.titleUz }, variantB: { title: `${best.titleUz} — rasmiy kafolat` }, impressionsA: 1240, impressionsB: 1198, clicksA: 61, clicksB: 79, createdAt: new Date(Date.now() - 5 * DAY) } });

  await competitorShop(tech);
  console.log("  seller cabinet: active orders, payouts, ads, supplies, disputes, promotions, A/B test, competitor shop");
}
