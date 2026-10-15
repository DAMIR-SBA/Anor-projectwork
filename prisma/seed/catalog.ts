import { randomBytes } from "node:crypto";
import { prisma } from "./client";
import { createUser, type DemoAccounts } from "./rbac";
import { BRANDS, CATEGORIES, PICKUP_POINTS, PRODUCTS, SHOPS, SIZE_GUIDE, type CatSeed, type ShopKey } from "./catalog-data";
import { artUrl } from "../../src/lib/product-art";
import { buildSearchText } from "../../src/lib/search-text";
import { DEFAULT_PLANS } from "../../src/lib/installment";

const DAY = 86_400_000;

// Deterministic PRNG so demo data is stable between resets.
let seedState = 20261015;
function rnd() {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}

async function seedCategories() {
  const map = new Map<string, { id: string; parentId: string | null; nameUz: string; nameRu: string }>();
  let sort = 0;
  async function walk(c: CatSeed, parentId: string | null, inheritedCommission: number) {
    const commission = c.commission ?? inheritedCommission;
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, nameUz: c.uz, nameRu: c.ru, icon: c.icon, parentId, sort: sort++, commissionRate: commission, sizeGuide: c.sizeGuide ? SIZE_GUIDE : undefined, nasiyaEligible: !["oziq-ovqat"].includes(c.slug) },
      update: { nameUz: c.uz, nameRu: c.ru, icon: c.icon, parentId, commissionRate: commission },
    });
    map.set(c.slug, { id: row.id, parentId, nameUz: c.uz, nameRu: c.ru });
    for (const ch of c.children ?? []) await walk(ch, row.id, commission);
  }
  for (const c of CATEGORIES) await walk(c, null, 0.12);
  // Commission tables: PRO sellers pay 2 p.p. less.
  for (const [, cat] of map) {
    const base = (await prisma.category.findUniqueOrThrow({ where: { id: cat.id } })).commissionRate;
    await prisma.commissionRule.upsert({ where: { categoryId_tier: { categoryId: cat.id, tier: "BASIC" } }, create: { categoryId: cat.id, tier: "BASIC", rate: base }, update: { rate: base } });
    await prisma.commissionRule.upsert({ where: { categoryId_tier: { categoryId: cat.id, tier: "PRO" } }, create: { categoryId: cat.id, tier: "PRO", rate: Math.max(0.03, base - 0.02) }, update: {} });
  }
  return map;
}

function ancestors(map: Map<string, { id: string; parentId: string | null; nameUz: string; nameRu: string }>, slug: string) {
  const out = [];
  let cur = map.get(slug);
  while (cur) {
    out.push(cur);
    const parentId: string | null = cur.parentId;
    cur = [...map.values()].find((c) => c.id === parentId);
  }
  return out;
}

export async function seedCatalog(people: DemoAccounts) {
  const cats = await seedCategories();
  for (const b of BRANDS) await prisma.brand.upsert({ where: { slug: b.slug }, create: { slug: b.slug, name: b.name, isOfficial: b.official }, update: {} });
  const brands = new Map((await prisma.brand.findMany()).map((b) => [b.slug, b]));

  // Installment plans (ANOR NASIYA).
  for (const p of DEFAULT_PLANS) await prisma.installmentPlan.upsert({ where: { months: p.months }, create: p, update: {} });

  // Warehouses: platform fulfillment centers + seller warehouses.
  const fc = [
    { code: "TAS-FC1", name: "ANOR FC Toshkent (Sergeli)", type: "PLATFORM" as const, region: "toshkent_sh", city: "Toshkent", address: "Sergeli tumani, Yangi Sergeli 1", lat: 41.22, lng: 69.22 },
    { code: "SAM-FC1", name: "ANOR FC Samarqand", type: "PLATFORM" as const, region: "samarqand", city: "Samarqand", address: "Samarqand, Logistika markazi", lat: 39.65, lng: 66.97 },
  ];
  const platform = await Promise.all(fc.map((w) => prisma.warehouse.upsert({ where: { code: w.code }, create: w, update: {} })));

  // Sellers & shops.
  const owners: Record<ShopKey, string> = {
    techhub: people.techSeller.id,
    moda: people.seller.id,
    hunarmand: people.artisan.id,
    nematlar: (await createUser({ login: "demo_food", name: "Kamola Usmonova", password: `Demo-${randomBytes(9).toString("base64url")}`, phone: "+998665551122" })).id,
  };
  const shops = new Map<ShopKey, { id: string; warehouseId: string }>();
  for (const [key, s] of Object.entries(SHOPS) as Array<[ShopKey, (typeof SHOPS)[ShopKey]]>) {
    const found = await prisma.shop.findUnique({ where: { slug: s.slug } });
    const shop = found ?? await prisma.shop.create({
      data: {
        ownerId: owners[key],
        slug: s.slug,
        name: s.name,
        descriptionUz: s.uz,
        descriptionRu: s.ru,
        logoUrl: artUrl(s.logo[0], s.logo[1], 7),
        bannerUrl: artUrl(s.logo[0], s.logo[1], 3),
        legalType: s.legal,
        legalName: s.name,
        taxId: s.taxId,
        bankName: "Kapitalbank",
        bankAccount: `20208000${randomBytes(6).toString("hex").replace(/\D/g, "").padEnd(12, "7").slice(0, 12)}`,
        bankMfo: "01088",
        status: "APPROVED",
        kycLevel: s.official ? 3 : 2,
        tier: s.tier,
        isOfficial: s.official,
        city: s.city,
        approvedAt: new Date(Date.now() - 200 * DAY),
        responseTimeMins: 10 + Math.round(rnd() * 50),
        slaCompliance: 92 + Math.round(rnd() * 8),
      },
    });
    const code = `SELLER-${s.slug.toUpperCase().slice(0, 10)}`;
    const wh = await prisma.warehouse.upsert({ where: { code }, update: {}, create: { code, name: `${s.name} ombori`, type: "SELLER", shopId: shop.id, region: s.city === "Toshkent" ? "toshkent_sh" : s.city === "Samarqand" ? "samarqand" : "fargona", city: s.city, address: `${s.city}` } });
    shops.set(key, { id: shop.id, warehouseId: wh.id });
  }

  let productCount = 0;
  for (const [index, p] of PRODUCTS.entries()) {
    if (await prisma.product.findUnique({ where: { slug: p.slug }, select: { id: true } })) continue;
    const cat = cats.get(p.cat);
    if (!cat) throw new Error(`Unknown category ${p.cat}`);
    const chain = ancestors(cats, p.cat);
    const shop = shops.get(p.shop)!;
    const brand = p.brand ? brands.get(p.brand) : undefined;
    const createdAt = new Date(Date.now() - (5 + Math.round(rnd() * 160)) * DAY);
    const variants = p.variants ?? [{ uz: "", ru: "", stock: 20 }];
    const minVariant = variants.reduce((m, v) => ((v.price ?? p.price) < (m.price ?? p.price) ? v : m), variants[0]);
    const price = minVariant.price ?? p.price;
    const oldPrice = minVariant.price ? (minVariant.old ?? null) : (p.old ?? null);

    const product = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: cat.id,
        brandId: brand?.id,
        slug: p.slug,
        titleUz: p.uz,
        titleRu: p.ru,
        descriptionUz: p.dUz,
        descriptionRu: p.dRu,
        specs: p.specs.map(([keyUz, keyRu, value]) => ({ keyUz, keyRu, value })),
        attributes: variants[0].opt ?? {},
        status: "ACTIVE",
        price,
        oldPrice,
        discountPct: oldPrice && oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0,
        isHalal: !!p.halal,
        madeInUz: !!p.madeInUz,
        fulfillment: p.f,
        condition: p.condition ?? "NEW",
        isPreorder: !!p.preorder,
        preorderDate: p.preorder ? new Date(Date.now() + p.preorder * DAY) : null,
        wholesaleTiers: p.wholesale,
        weightGrams: p.w ?? 500,
        soldCount: p.sold ?? Math.round(rnd() * 200),
        viewCount: (p.sold ?? 100) * (8 + Math.round(rnd() * 10)),
        videoUrl: p.video ? "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" : null,
        searchText: buildSearchText({ titleUz: p.uz, titleRu: p.ru, brand: brand?.name, categories: chain, keywords: p.kw }),
        createdAt,
        publishedAt: createdAt,
        nasiyaEligible: p.cat.startsWith("quruq") || p.cat.startsWith("choy") || p.cat.startsWith("asal") ? false : null,
      },
    });

    // Gallery: 3–4 illustrations per product (variant colors + alternate backdrops).
    const hexes = [...new Set(variants.map((v) => v.hex ?? p.art[1]))];
    const media = [
      ...hexes.map((h, i) => ({ url: artUrl(p.art[0], h, index * 3 + i + 1), alt: p.uz })),
      { url: artUrl(p.art[0], p.art[1], index * 3 + 11), alt: p.uz },
      { url: artUrl(p.art[0], p.art[1], index * 3 + 23), alt: p.uz },
    ].slice(0, 4);
    await prisma.productMedia.createMany({ data: media.map((m, i) => ({ productId: product.id, url: m.url, alt: m.alt, sort: i, type: "IMAGE" as const })) });
    if (p.video) await prisma.productMedia.create({ data: { productId: product.id, type: "VIDEO", url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", sort: 99, alt: p.uz } });

    for (const [vi, v] of variants.entries()) {
      const vPrice = v.price ?? p.price;
      const vOld = v.price ? (v.old ?? null) : (p.old ?? null);
      const variant = await prisma.variant.create({
        data: {
          productId: product.id,
          sku: `${p.slug.slice(0, 18).toUpperCase()}-${vi + 1}`,
          titleUz: v.uz,
          titleRu: v.ru,
          options: v.opt ?? {},
          price: vPrice,
          oldPrice: vOld,
          stock: v.stock,
          barcode: `478${String(index).padStart(4, "0")}${String(vi).padStart(2, "0")}${String(Math.round(rnd() * 999)).padStart(3, "0")}`,
          imageUrl: artUrl(p.art[0], v.hex ?? p.art[1], index * 3 + (hexes.indexOf(v.hex ?? p.art[1]) + 1)),
          isDefault: vi === 0,
        },
      });
      // FBO stock sits in platform FCs (Tashkent gets most), FBS/DBS in the seller warehouse.
      if (p.f === "FBO") {
        const tas = Math.ceil(v.stock * 0.7);
        await prisma.warehouseStock.create({ data: { variantId: variant.id, warehouseId: platform[0].id, quantity: tas } });
        await prisma.warehouseStock.create({ data: { variantId: variant.id, warehouseId: platform[1].id, quantity: v.stock - tas } });
      } else {
        await prisma.warehouseStock.create({ data: { variantId: variant.id, warehouseId: shop.warehouseId, quantity: v.stock } });
      }
      // 90 days of price history: gentle random walk around the old price with a recent drop.
      const points = [];
      let cur = vOld ?? Math.round(vPrice * 1.08);
      for (let d = 120; d >= 0; d -= 6) {
        const drift = (rnd() - 0.5) * 0.06;
        cur = Math.round((cur * (1 + drift)) / 1000) * 1000;
        if (d < 10) cur = vPrice;
        points.push({ variantId: variant.id, price: Math.max(Math.round(vPrice * 0.92), cur), recordedAt: new Date(Date.now() - d * DAY) });
      }
      await prisma.priceHistory.createMany({ data: points });
    }
    const minRecent = await prisma.priceHistory.aggregate({ _min: { price: true }, where: { variant: { productId: product.id }, recordedAt: { gte: new Date(Date.now() - 90 * DAY) } } });
    await prisma.product.update({ where: { id: product.id }, data: { lowest90: minRecent._min.price } });
    productCount++;
  }

  // Pickup points.
  for (const pp of PICKUP_POINTS) {
    await prisma.pickupPoint.upsert({
      where: { code: pp.code },
      update: {},
      create: { ...pp, phone: "+998712000000", hours: { mon: "09:00-21:00", tue: "09:00-21:00", wed: "09:00-21:00", thu: "09:00-21:00", fri: "09:00-21:00", sat: "10:00-20:00", sun: "10:00-18:00" } },
    });
  }

  await seedMarketing(cats);
  console.log(`  catalog: ${cats.size} categories, ${shops.size} shops, ${productCount} products, ${PICKUP_POINTS.length} pickup points`);
}

async function seedMarketing(cats: Map<string, { id: string }>) {
  const now = Date.now();
  if (await prisma.campaign.count()) return;
  await prisma.coupon.createMany({
    data: [
      { code: "ANOR10", type: "PERCENT", value: 10, maxDiscount: 150_000, minCartTotal: 100_000, firstOrderOnly: true, perUserLimit: 1, descriptionUz: "Birinchi buyurtmaga 10% chegirma", descriptionRu: "10% на первый заказ" },
      { code: "XUSH50", type: "FIXED", value: 50_000, minCartTotal: 400_000, perUserLimit: 3, usageLimit: 5000, descriptionUz: "400 000 so‘mdan 50 000 so‘m chegirma", descriptionRu: "Скидка 50 000 сум от 400 000 сум" },
      { code: "BEPUL", type: "FREE_DELIVERY", value: 0, minCartTotal: 0, perUserLimit: 5, descriptionUz: "Bepul yetkazib berish", descriptionRu: "Бесплатная доставка" },
      { code: "TEXNO5", type: "PERCENT", value: 5, maxDiscount: 500_000, minCartTotal: 1_000_000, categoryId: cats.get("elektronika")!.id, perUserLimit: 2, descriptionUz: "Elektronikaga 5%", descriptionRu: "5% на электронику" },
      { code: "ESKI2025", type: "PERCENT", value: 20, minCartTotal: 0, endsAt: new Date(now - 30 * DAY), perUserLimit: 1, isActive: true, descriptionUz: "Muddati o‘tgan kupon", descriptionRu: "Истёкший купон" },
    ],
  });
  const tea = await prisma.product.findUniqueOrThrow({ where: { slug: "kuk-choy-95" } });
  const phone = await prisma.product.findUniqueOrThrow({ where: { slug: "samsung-galaxy-a55" } });
  const buds = await prisma.product.findUniqueOrThrow({ where: { slug: "xiaomi-redmi-buds-5" } });
  const nuts = await prisma.product.findUniqueOrThrow({ where: { slug: "quritilgan-orik-1kg" } });
  const honey = await prisma.product.findUniqueOrThrow({ where: { slug: "tog-asali-1kg" } });
  await prisma.promotion.createMany({
    data: [
      { shopId: tea.shopId, type: "MULTI_BUY", nameUz: "3 ta choy oling — 15% chegirma", nameRu: "Купите 3 чая — скидка 15%", discountPercent: 15, minQty: 3, productIds: [tea.id] },
      { type: "BUY_TOGETHER", nameUz: "Smartfon + quloqchin birga −10%", nameRu: "Смартфон + наушники вместе −10%", discountPercent: 10, minQty: 2, productIds: [phone.id, buds.id] },
      { shopId: nuts.shopId, type: "BUNDLE", nameUz: "Dasturxon to‘plami: o‘rik + asal −12%", nameRu: "Набор к дастархану: курага + мёд −12%", discountPercent: 12, minQty: 2, productIds: [nuts.id, honey.id] },
    ],
  });
  await prisma.banner.createMany({
    data: [
      { titleUz: "Kuzgi chegirmalar haftaligi", titleRu: "Неделя осенних скидок", subtitleUz: "Elektronika va maishiy texnikaga −40% gacha", subtitleRu: "До −40% на электронику и бытовую технику", href: "/deals", bgColor: "#C8102E", sort: 0, imageUrl: artUrl("tv", "C8102E", 41) },
      { titleUz: "O‘zbekistonda ishlab chiqarilgan", titleRu: "Сделано в Узбекистане", subtitleUz: "Rishton kulolchiligi, Marg‘ilon atlasi va boshqalar", subtitleRu: "Риштанская керамика, маргиланский атлас и другое", href: "/made-in-uzbekistan", bgColor: "#0E6E6E", sort: 1, imageUrl: artUrl("plate", "0E8C8C", 42) },
      { titleUz: "ANOR NASIYA — 12 oygacha", titleRu: "ANOR NASIYA — до 12 месяцев", subtitleUz: "Boshlang‘ich to‘lovsiz, bir daqiqada qaror", subtitleRu: "Без первого взноса, решение за минуту", href: "/nasiya", bgColor: "#1A1A1F", sort: 2, imageUrl: artUrl("phone", "F5B301", 43) },
      { titleUz: "ANOR Plus bilan bepul yetkazish", titleRu: "Бесплатная доставка с ANOR Plus", subtitleUz: "+2% keshbek va flesh-savdolarga erta kirish", subtitleRu: "+2% кешбэк и ранний доступ к флеш-распродажам", href: "/plus", bgColor: "#8E0B22", placement: "HOME_STRIP", sort: 0 },
    ],
  });
  // Deal of the day + an active flash sale with timed prices.
  const dealProducts = await prisma.product.findMany({ where: { slug: { in: ["xiaomi-redmi-note-13-pro", "tefal-express-kettle", "krossovka-runner", "atlas-ko-ylak-guldasta", "xiaomi-robot-vacuum-s10", "yuz-kremi-anor-ekstrakti"] } } });
  const startOfDay = new Date(new Date().setUTCHours(-5, 0, 0, 0));
  const deal = await prisma.campaign.create({
    data: { slug: "kun-taklifi", type: "DEAL_OF_DAY", nameUz: "Kun taklifi", nameRu: "Предложение дня", startsAt: startOfDay, endsAt: new Date(startOfDay.getTime() + DAY), status: "ACTIVE", minDiscountPercent: 10 },
  });
  const flash = await prisma.campaign.create({
    data: {
      slug: "kuzgi-flesh", type: "FLASH_SALE", nameUz: "Kuzgi flesh-savdo", nameRu: "Осенняя флеш-распродажа", descriptionUz: "Faqat 48 soat! Cheklangan miqdor.", descriptionRu: "Только 48 часов! Количество ограничено.",
      startsAt: new Date(now - 6 * 3_600_000), endsAt: new Date(now + 42 * 3_600_000), status: "ACTIVE", minDiscountPercent: 15, plusEarlyHours: 6, themeColor: "#C8102E",
      blocks: [{ type: "hero" }, { type: "countdown" }, { type: "products" }, { type: "coupons", codes: ["XUSH50"] }],
    },
  });
  for (const [i, p] of dealProducts.entries()) {
    const campaign = i < 3 ? deal : flash;
    await prisma.campaignProduct.create({ data: { campaignId: campaign.id, productId: p.id, shopId: p.shopId, salePrice: Math.round((p.price * (i < 3 ? 0.85 : 0.8)) / 1000) * 1000, stockLimit: 30, sold: Math.round(rnd() * 20), status: "APPROVED" } });
  }
  // Seasonal campaigns scheduled for the year (auto-activated by the scheduler).
  const y = new Date().getUTCFullYear();
  const seasonal = [
    ["navruz", "NAVRUZ", "Navro‘z bayrami", "Праздник Навруз", `${y + 1}-03-14`, `${y + 1}-03-22`],
    ["mustaqillik", "MUSTAQILLIK", "Mustaqillik kuni", "День Независимости", `${y + 1}-08-25`, `${y + 1}-09-02`],
    ["11-11", "11_11", "11.11 — Buyuk savdo", "11.11 — Большая распродажа", `${y}-11-10`, `${y}-11-12`],
    ["qora-juma", "QORA_JUMA", "Qora juma", "Чёрная пятница", `${y}-11-27`, `${y}-11-30`],
  ] as const;
  for (const [slug, season, uz, ru, from, to] of seasonal) {
    await prisma.campaign.create({ data: { slug, type: "SEASONAL", season, nameUz: uz, nameRu: ru, startsAt: new Date(`${from}T00:00:00+05:00`), endsAt: new Date(`${to}T23:59:59+05:00`), status: "SCHEDULED", recurring: true, minDiscountPercent: 15, spinEnabled: true, plusEarlyHours: 12 } });
  }
}
