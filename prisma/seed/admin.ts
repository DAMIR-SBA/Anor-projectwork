// Phase 7 demo data for the admin panel: a shop and products waiting for moderation, campaign
// applications, fraud cases (shared device, pre-sale price raise, serial returner), a Nasiya
// portfolio with overdue payments, refunds, feature flags with A/B results, platform settings,
// and 60 days of visitor history so platform analytics has a real funnel.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "./client";
import { createUser, type DemoAccounts } from "./rbac";
import { artUrl } from "../../src/lib/product-art";
import { buildSearchText } from "../../src/lib/search-text";

const DAY = 86_400_000;
let seed = 7007;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const round = (v: number, to = 1000) => Math.round(v / to) * to;

/** A one-page PDF that says what it is — stands in for an uploaded KYC scan. */
function demoPdf(title: string): Buffer {
  const text = `ANOR demo document: ${title}. Not a real document.`.replace(/[()\\]/g, "");
  const stream = `BT /F1 14 Tf 60 760 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Store a private KYC file the way the upload route does (local driver only). */
function storeDocument(title: string): string {
  const month = new Date().toISOString().slice(0, 7);
  const name = `${randomBytes(8).toString("hex")}.pdf`;
  const dir = path.resolve(process.env.STORAGE_LOCAL_DIR || "./storage/uploads", "documents", month);
  if ((process.env.STORAGE_DRIVER ?? "local") === "local") {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, name), demoPdf(title));
  }
  return `/uploads/documents/${month}/${name}`;
}

let orderSeq = 0;
type Line = { productId: string; variantId: string; title: string; variantTitle: string | null; price: number; image: string | null; commission: number };

/** A delivered single-shop order (optionally paid by card, with a Payment row for refunds). */
async function deliveredOrder(userId: string, shopId: string, line: Line, deliveredAt: Date, method: "CLICK" | "PAYME" | "INSTALLMENT" = "CLICK") {
  orderSeq++;
  const placedAt = new Date(deliveredAt.getTime() - 3 * DAY);
  const number = `${placedAt.toISOString().slice(2, 10).replace(/-/g, "")}-7${String(orderSeq).padStart(4, "0")}`;
  const group = await prisma.orderGroup.create({
    data: {
      number,
      userId,
      subtotal: line.price,
      total: line.price,
      paymentMethod: method,
      paymentStatus: "PAID",
      createdAt: placedAt,
      orders: {
        create: [
          {
            number: `${number}-1`,
            userId,
            shopId,
            status: "DELIVERED",
            fulfillment: "FBS",
            subtotal: line.price,
            total: line.price,
            commissionTotal: Math.round(line.price * line.commission),
            deliveryMethod: "COURIER",
            region: rnd() < 0.6 ? "toshkent_sh" : rnd() < 0.5 ? "samarqand" : "fargona",
            paymentMethod: method,
            address: { recipient: "—", phone: "", city: "Toshkent", street: "", house: "" },
            confirmedAt: new Date(placedAt.getTime() + 3_600_000),
            deliveredAt,
            createdAt: placedAt,
            items: { create: [{ productId: line.productId, variantId: line.variantId, title: line.title, variantTitle: line.variantTitle, imageUrl: line.image, unitPrice: line.price, quantity: 1, commissionRate: line.commission, commissionAmount: Math.round(line.price * line.commission) }] },
          },
        ],
      },
    },
    include: { orders: { include: { items: true } } },
  });
  const payment = method === "INSTALLMENT" ? null : await prisma.payment.create({ data: { groupId: group.id, userId, method, amount: line.price, status: "PAID", paidAt: placedAt, createdAt: placedAt, externalId: `demo-${randomBytes(5).toString("hex")}` } });
  return { group, order: group.orders[0], item: group.orders[0].items[0], payment };
}

async function linesOf(shopSlug: string, take: number, minPrice = 0): Promise<Array<Line & { shopId: string }>> {
  const products = await prisma.product.findMany({
    where: { shop: { slug: shopSlug }, status: "ACTIVE", deletedAt: null, price: { gte: minPrice } },
    orderBy: { soldCount: "desc" },
    take,
    include: { variants: { where: { isDefault: true }, take: 1 }, media: { take: 1, orderBy: { sort: "asc" } }, category: { select: { commissionRate: true } } },
  });
  return products
    .filter((p) => p.variants[0])
    .map((p) => ({ shopId: p.shopId, productId: p.id, variantId: p.variants[0].id, title: p.titleUz, variantTitle: p.variants[0].titleUz, price: p.variants[0].price, image: p.media[0]?.url ?? null, commission: p.category.commissionRate ?? 0.1 }));
}

// ── Moderation queues ────────────────────────────────────────────────────

async function pendingShop() {
  const owner = await createUser({ login: "demo_newshop", name: "Jasur Qodirov", password: randomBytes(12).toString("base64url"), phone: "+998907770011" });
  if (await prisma.shop.findUnique({ where: { slug: "baraka-savdo" } })) return;
  const shop = await prisma.shop.create({
    data: {
      ownerId: owner.id,
      slug: "baraka-savdo",
      name: "Baraka Savdo",
      descriptionUz: "Uy-ro‘zg‘or buyumlari va oshxona anjomlari, Namangandan yetkazib beramiz.",
      descriptionRu: "Товары для дома и кухни с доставкой из Намангана.",
      logoUrl: artUrl("pan", "#2F6FDE", 7),
      legalType: "INDIVIDUAL_ENTREPRENEUR",
      legalName: "YaTT Qodirov Jasur Anvarovich",
      taxId: "512398764",
      bankName: "Ipoteka-bank",
      bankAccount: "20218000900123456001",
      bankMfo: "00873",
      status: "PENDING",
      kycLevel: 1,
      city: "Namangan",
      createdAt: ago(2),
    },
  });
  await prisma.warehouse.create({ data: { code: "SELLER-BARAKA", name: "Baraka Savdo ombori", type: "SELLER", shopId: shop.id, region: "namangan", city: "Namangan", address: "Namangan sh., Uychi ko‘chasi 14" } });
  await prisma.shopDocument.createMany({
    data: [
      { shopId: shop.id, type: "ie_certificate", fileUrl: storeDocument("YaTT guvohnomasi"), fileName: "yatt-guvohnoma.pdf", createdAt: ago(2) },
      { shopId: shop.id, type: "passport", fileUrl: storeDocument("Pasport nusxasi"), fileName: "pasport.pdf", createdAt: ago(2) },
    ],
  });
}

async function pendingProducts() {
  const moda = await prisma.shop.findUniqueOrThrow({ where: { slug: "moda-bazar" } });
  const tech = await prisma.shop.findUniqueOrThrow({ where: { slug: "techhub" } });
  const cat = async (slug: string) => prisma.category.findUniqueOrThrow({ where: { slug }, select: { id: true, nameUz: true, nameRu: true } });
  const items = [
    // Counterfeit wording → prohibited-terms signal.
    { shop: moda, cat: "poyabzal", slug: "krossovka-airstep-replika", uz: "Krossovka «AirStep» replika 1:1, original sifatida", ru: "Кроссовки «AirStep» реплика 1:1", dUz: "Mashhur modelning 1:1 replikasi. Barcha o‘lchamlar bor.", dRu: "Реплика 1:1 известной модели. Все размеры.", price: 289_000, old: null, art: ["sneaker", "#1A1A1F"], photos: true },
    // Crossed-out price never charged → inflated old price signal.
    { shop: moda, cat: "sumkalar", slug: "charm-sumka-milano", uz: "Ayollar charm sumkasi «Milano»", ru: "Женская кожаная сумка «Milano»", dUz: "Tabiiy charm, ikki bo‘limli, uzun tasmali. Kundalik va ofis uchun qulay.", dRu: "Натуральная кожа, два отделения, длинный ремень. Для города и офиса.", price: 349_000, old: 1_190_000, art: ["bag", "#8E0B22"], photos: true },
    // No photos and a one-line description.
    { shop: moda, cat: "ayollar-kiyimi", slug: "ayollar-futbolka-basic", uz: "Futbolka", ru: "Футболка", dUz: "Futbolka.", dRu: "Футболка.", price: 79_000, old: null, art: ["tshirt", "#F5B301"], photos: false },
    // A clean new listing.
    { shop: tech, cat: "quloqchinlar", slug: "simsiz-quloqchin-pulse-x", uz: "Simsiz quloqchin Pulse X, shovqinni bostirish bilan", ru: "Беспроводные наушники Pulse X с шумоподавлением", dUz: "Faol shovqin bostirish, 30 soatgacha ishlash, USB-C orqali tez quvvatlash, ikki qurilmaga bir vaqtda ulanish.", dRu: "Активное шумоподавление, до 30 часов работы, быстрая зарядка USB-C, подключение к двум устройствам.", price: 649_000, old: 749_000, art: ["headphones", "#2F6FDE"], photos: true },
  ];
  for (const [i, p] of items.entries()) {
    if (await prisma.product.findUnique({ where: { slug: p.slug } })) continue;
    const c = await cat(p.cat);
    const product = await prisma.product.create({
      data: {
        shopId: p.shop.id,
        categoryId: c.id,
        slug: p.slug,
        titleUz: p.uz,
        titleRu: p.ru,
        descriptionUz: p.dUz,
        descriptionRu: p.dRu,
        status: "PENDING",
        price: p.price,
        oldPrice: p.old,
        discountPct: p.old ? Math.round(((p.old - p.price) / p.old) * 100) : 0,
        fulfillment: "FBS",
        weightGrams: 600,
        searchText: buildSearchText({ titleUz: p.uz, titleRu: p.ru, categories: [c] }),
        createdAt: ago(1 - i * 0.2),
      },
    });
    if (p.photos) await prisma.productMedia.createMany({ data: [1, 2, 3].map((n) => ({ productId: product.id, url: artUrl(p.art[0], p.art[1], 40 + i * 3 + n), alt: p.uz, sort: n - 1, type: "IMAGE" as const })) });
    const variant = await prisma.variant.create({ data: { productId: product.id, sku: `${p.slug.slice(0, 16).toUpperCase()}-1`, titleUz: "Standart", titleRu: "Стандарт", options: {}, price: p.price, oldPrice: p.old, stock: 25, isDefault: true } });
    const wh = await prisma.warehouse.findFirst({ where: { shopId: p.shop.id, type: "SELLER" } });
    if (wh) await prisma.warehouseStock.create({ data: { variantId: variant.id, warehouseId: wh.id, quantity: 25 } });
    // The bag was never sold anywhere near its "old" price.
    await prisma.priceHistory.createMany({ data: [60, 30, 7].map((d) => ({ variantId: variant.id, price: p.old ? round(p.price * (1.02 + rnd() * 0.05)) : p.price, recordedAt: ago(d) })) });
  }
}

// ── Campaigns & fraud ────────────────────────────────────────────────────

/** Applications waiting for approval, one of them right after a 40% price hike. */
async function campaignApplications() {
  const now = new Date();
  const campaign = (await prisma.campaign.findFirst({ where: { type: "SEASONAL", status: "SCHEDULED", startsAt: { gt: now } }, orderBy: { startsAt: "asc" } })) ?? (await prisma.campaign.findFirst({ where: { status: "ACTIVE" } }));
  if (!campaign) return null;
  const lines = [...(await linesOf("moda-bazar", 6)), ...(await linesOf("samarqand-nematlari", 2))];
  let raised: (typeof lines)[number] | null = null;
  for (const [i, l] of lines.slice(2, 6).entries()) {
    if (await prisma.campaignProduct.findUnique({ where: { campaignId_productId: { campaignId: campaign.id, productId: l.productId } } })) continue;
    if (i === 0) {
      // Price history: steady for a month, then pushed up 40% ten days before applying.
      raised = l;
      const base = round(l.price * 0.78);
      await prisma.priceHistory.createMany({
        data: [
          { variantId: l.variantId, price: base, recordedAt: ago(40) },
          { variantId: l.variantId, price: base, recordedAt: ago(28) },
          { variantId: l.variantId, price: round(base * 1.4), recordedAt: ago(10) },
        ],
      });
    }
    const discount = i === 0 ? 0.16 : 0.2 + rnd() * 0.1;
    await prisma.campaignProduct.create({ data: { campaignId: campaign.id, productId: l.productId, shopId: l.shopId, salePrice: round(l.price * (1 - discount)), stockLimit: 20 + i * 10, status: "PENDING", createdAt: ago(1 + i) } });
  }
  if (raised) {
    const base = round(raised.price * 0.78);
    const peak = round(base * 1.4);
    const jump = (peak - base) / base;
    await prisma.fraudFlag.upsert({
      where: { type_entityType_entityId: { type: "PRICE_MANIPULATION", entityType: "Product", entityId: raised.productId } },
      update: {},
      create: { type: "PRICE_MANIPULATION", entityType: "Product", entityId: raised.productId, shopId: raised.shopId, score: Math.min(95, Math.round(50 + jump * 60)), details: { signal: "pre_sale_raise", title: raised.title, base, peak, salePrice: round(raised.price * 0.84), jumpPct: Math.round(jump * 100), campaignId: campaign.id }, createdAt: ago(1) },
    });
  }
  return campaign;
}

/** Three accounts on one phone handset (shared device cookie) chasing first-order coupons. */
async function sharedDevice(people: DemoAccounts) {
  const a = await createUser({ login: "promo_hunter1", name: "Sanjar B.", password: randomBytes(12).toString("base64url"), phone: "+998915550101" });
  const b = await createUser({ login: "promo_hunter2", name: "Sanjarbek", password: randomBytes(12).toString("base64url") });
  const c = people.extraBuyers[4];
  const fingerprint = sha("demo-shared-handset");
  for (const u of [a, b, c]) await prisma.device.upsert({ where: { userId_fingerprint: { userId: u.id, fingerprint } }, update: {}, create: { userId: u.id, fingerprint, name: "Android · Chrome", firstSeenAt: ago(12), lastSeenAt: ago(1), lastIp: "10.20.30.40" } });
  const users = [a, b, c];
  await prisma.fraudFlag.upsert({
    where: { type_entityType_entityId: { type: "DUPLICATE_ACCOUNT", entityType: "Device", entityId: fingerprint } },
    update: {},
    create: { type: "DUPLICATE_ACCOUNT", entityType: "Device", entityId: fingerprint, userId: a.id, score: Math.min(95, 40 + 15 * (users.length - 1)), details: { signal: "device", userIds: users.map((u) => u.id), logins: users.map((u) => u.login) }, createdAt: ago(1) },
  });
  await prisma.fraudFlag.upsert({
    where: { type_entityType_entityId: { type: "REFERRAL_ABUSE", entityType: "User", entityId: b.id } },
    update: {},
    create: { type: "REFERRAL_ABUSE", entityType: "User", entityId: b.id, userId: b.id, score: 55, details: { signal: "referral", referrer: a.login, sameDevice: true }, createdAt: ago(1) },
  });
}

/** A buyer who returns most of what they order. */
async function serialReturner() {
  const user = await createUser({ login: "buyer_qaytar", name: "Ulug‘bek Sobirov", password: randomBytes(12).toString("base64url"), phone: "+998936660202" });
  if (await prisma.return.count({ where: { userId: user.id } })) return user;
  const lines = await linesOf("moda-bazar", 5, 100_000);
  const reasons = ["size", "notAsDescribed", "changedMind", "size"];
  let amount = 0;
  for (const [i, l] of lines.entries()) {
    const { order, item, payment } = await deliveredOrder(user.id, l.shopId, l, ago(70 - i * 14));
    if (i >= 4) continue;
    const status = i < 2 ? "REFUNDED" : i === 2 ? "REJECTED" : "REQUESTED";
    const ret = await prisma.return.create({
      data: { number: `R-${order.number}`, orderId: order.id, orderItemId: item.id, userId: user.id, reason: reasons[i], description: i === 1 ? "Rasmdagidan farq qiladi" : null, status, refundMethod: "CARD", amount: item.unitPrice, resolution: status === "REJECTED" ? "Mahsulot ishlatilgan holatda qaytarildi" : null, decidedAt: status === "REQUESTED" ? null : ago(64 - i * 14), createdAt: ago(67 - i * 14) },
    });
    amount += item.unitPrice;
    if (status === "REFUNDED" && payment) {
      await prisma.refund.create({ data: { paymentId: payment.id, returnId: ret.id, amount: item.unitPrice, method: "CARD", status: "COMPLETED", externalId: `demo-rf-${randomBytes(4).toString("hex")}`, reason: reasons[i], createdAt: ago(63 - i * 14), completedAt: ago(62 - i * 14) } });
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAmount: item.unitPrice } });
    }
  }
  const delivered = lines.length;
  await prisma.fraudFlag.upsert({
    where: { type_entityType_entityId: { type: "SUSPICIOUS_RETURN", entityType: "User", entityId: user.id } },
    update: {},
    create: { type: "SUSPICIOUS_RETURN", entityType: "User", entityId: user.id, userId: user.id, score: Math.min(95, Math.round(40 + (4 / delivered) * 50)), details: { returns: 4, delivered, ratioPct: Math.round((4 / delivered) * 100), amount, reasons: { size: 2, notAsDescribed: 1, changedMind: 1 } }, createdAt: ago(1) },
  });
  return user;
}

/** Card refunds for returns that were refunded before payments were recorded. */
async function backfillRefunds() {
  const refunded = await prisma.return.findMany({ where: { status: "REFUNDED", refunds: { none: {} } }, include: { order: { select: { groupId: true, paymentMethod: true } } } });
  for (const r of refunded) {
    const payment = (await prisma.payment.findFirst({ where: { groupId: r.order.groupId } })) ?? (await prisma.payment.create({ data: { groupId: r.order.groupId, userId: r.userId, method: r.order.paymentMethod === "PAYME" ? "PAYME" : "CLICK", amount: r.amount, status: "PAID", paidAt: r.createdAt, externalId: `demo-${randomBytes(5).toString("hex")}` } }));
    await prisma.refund.create({ data: { paymentId: payment.id, returnId: r.id, amount: r.amount, method: r.refundMethod, status: "COMPLETED", externalId: `demo-rf-${randomBytes(4).toString("hex")}`, completedAt: r.decidedAt ?? new Date() } });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "PARTIALLY_REFUNDED", refundedAmount: { increment: r.amount } } });
  }
}

// ── Nasiya portfolio ─────────────────────────────────────────────────────

async function nasiyaPortfolio(people: DemoAccounts) {
  if (await prisma.installmentContract.count()) return;
  const plans = await prisma.installmentPlan.findMany();
  const plan = (m: number) => plans.find((p) => p.months === m) ?? plans[0];
  const lines = await linesOf("techhub", 5, 1_500_000);
  const cases: Array<{ user: { id: string; name: string | null }; months: number; signedDaysAgo: number; paidCount: number; status: "ACTIVE" | "OVERDUE" | "PAID" }> = [
    { user: people.buyer, months: 6, signedDaysAgo: 70, paidCount: 2, status: "ACTIVE" },
    { user: people.extraBuyers[2], months: 12, signedDaysAgo: 100, paidCount: 1, status: "OVERDUE" },
    { user: people.extraBuyers[6], months: 3, signedDaysAgo: 155, paidCount: 1, status: "OVERDUE" },
    { user: people.extraBuyers[7], months: 3, signedDaysAgo: 200, paidCount: 3, status: "PAID" },
    { user: people.business, months: 6, signedDaysAgo: 20, paidCount: 0, status: "ACTIVE" },
  ];
  for (const [i, c] of cases.entries()) {
    const l = lines[i % lines.length];
    const p = plan(c.months);
    const signedAt = ago(c.signedDaysAgo);
    const { group } = await deliveredOrder(c.user.id, l.shopId, l, new Date(signedAt.getTime() + 3 * DAY), "INSTALLMENT");
    const markup = Math.round(l.price * p.markupPercent);
    const total = l.price + markup;
    const monthly = Math.ceil(total / c.months / 1000) * 1000;
    await prisma.installmentApplication.create({
      data: { userId: c.user.id, status: "APPROVED", phone: "+998 ** *** ** " + String(10 + i * 7).slice(-2), fullName: c.user.name ?? "—", passportMasked: `AB*****${String(31 + i * 11).slice(-2)}`, pinflHash: sha(`demo-pinfl-${i}`), birthDate: new Date(1985 + i * 3, i, 10 + i), monthlyIncome: 4_000_000 + i * 1_500_000, employment: i === 4 ? "business_owner" : "employed", scoring: { score: 640 + i * 25, factors: ["income", "history"] }, approvedLimit: 12_000_000 + i * 3_000_000, createdAt: new Date(signedAt.getTime() - DAY), decidedAt: new Date(signedAt.getTime() - DAY + 120_000) },
    });
    const contract = await prisma.installmentContract.create({
      data: { number: `NS-${signedAt.toISOString().slice(2, 7).replace("-", "")}-${String(1001 + i)}`, userId: c.user.id, groupId: group.id, planId: p.id, principal: l.price, markup, total, months: c.months, status: c.status, signedAt, closedAt: c.status === "PAID" ? ago(c.signedDaysAgo - c.months * 30) : null },
    });
    // Limit from the approved application; outstanding principal counts as used.
    const paidShare = Math.round((l.price * Math.min(c.paidCount, c.months)) / c.months);
    await prisma.user.update({ where: { id: c.user.id }, data: { nasiyaLimit: 12_000_000 + i * 3_000_000, nasiyaUsed: c.status === "PAID" ? 0 : { increment: l.price - paidShare } } });
    await prisma.repaymentSchedule.createMany({
      data: Array.from({ length: c.months }, (_, k) => {
        const amount = k === c.months - 1 ? total - monthly * (c.months - 1) : monthly;
        const dueDate = new Date(signedAt.getTime() + (k + 1) * 30 * DAY);
        const paid = k < c.paidCount;
        const late = !paid && dueDate < new Date();
        return { contractId: contract.id, index: k + 1, dueDate, amount, paidAmount: paid ? amount : late && k === c.paidCount ? Math.round(amount * 0.3) : 0, status: paid ? "PAID" : late ? "OVERDUE" : "DUE", paidAt: paid ? new Date(dueDate.getTime() - 2 * DAY) : null };
      }),
    });
  }
  // Decisions that didn't end in a contract.
  const others = [
    { user: people.extraBuyers[3], status: "REJECTED" as const, income: 1_200_000, reason: "income_below_minimum" },
    { user: people.extraBuyers[5], status: "PENDING" as const, income: 5_500_000, reason: null },
  ];
  for (const [i, o] of others.entries()) {
    if (!o.user) continue;
    await prisma.installmentApplication.create({ data: { userId: o.user.id, status: o.status, phone: "+998 ** *** ** 0" + i, fullName: o.user.name ?? "—", passportMasked: `AC*****${70 + i}`, pinflHash: sha(`demo-pinfl-x${i}`), birthDate: new Date(1999, 4, 2), monthlyIncome: o.income, employment: "employed", reason: o.reason, decidedAt: o.status === "PENDING" ? null : ago(3), createdAt: ago(3 + i) } });
  }
}

// ── Flags, settings, analytics history ───────────────────────────────────

async function flagsAndSettings() {
  await prisma.featureFlag.upsert({ where: { key: "home.layout" }, update: {}, create: { key: "home.layout", description: "Bosh sahifa bloklari tartibi: aksiyalar yuqorida bo‘lsa xarid ko‘payadimi?", enabled: true, rolloutPercent: 100, variants: [{ key: "classic", weight: 50 }, { key: "deals_first", weight: 50 }] } });
  await prisma.featureFlag.upsert({ where: { key: "home.stories" }, update: {}, create: { key: "home.stories", description: "Sotuvchilar hikoyalari lentasi", enabled: true } });
  await prisma.featureFlag.upsert({ where: { key: "home.made_in_uz" }, update: {}, create: { key: "home.made_in_uz", description: "«O‘zbekistonda ishlab chiqarilgan» bloki", enabled: true } });
  // Two weeks of results: deals_first converts 4.2% vs 3.0% — enough visitors to be significant.
  if (!(await prisma.flagExposure.count({ where: { flagKey: "home.layout", visitorId: { startsWith: "seed-" } } }))) {
    const rows = [];
    for (const [arm, rate] of [["classic", 0.03], ["deals_first", 0.042]] as const) {
      for (let i = 0; i < 2400; i++) {
        const converted = i < Math.round(2400 * rate);
        const orders = converted ? (rnd() < 0.2 ? 2 : 1) : 0;
        rows.push({ flagKey: "home.layout", visitorId: `seed-${arm}-${i}`, variant: arm, orders, revenue: orders * round(180_000 + rnd() * 900_000), createdAt: ago(14 - (i / 2400) * 14) });
      }
    }
    await prisma.flagExposure.createMany({ data: rows, skipDuplicates: true });
  }
  await prisma.setting.upsert({
    where: { key: "platform" },
    update: {},
    create: {
      key: "platform",
      value: {
        announcement: { enabled: true, textUz: "Kuzgi flesh-savdo: 70% gacha chegirmalar faqat shu hafta", textRu: "Осенняя флеш-распродажа: скидки до 70% только на этой неделе", href: "/deals", tone: "promo", startsAt: null, endsAt: new Date(Date.now() + 10 * DAY).toISOString() },
        ordersPaused: { enabled: false, messageUz: "", messageRu: "" },
        sellerSignupOpen: true,
        support: { phone: "+998 71 000 00 00", email: "support@anor.local", telegram: "" },
      },
    },
  });
}

/** Sign-up dates spread over 90 days (before each buyer's first order) and visitor traffic. */
async function analyticsHistory() {
  const buyers = await prisma.user.findMany({ where: { staffProfile: null, deletedAt: null, login: { startsWith: "buyer_" } }, select: { id: true, createdAt: true, orders: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 } } });
  for (const b of buyers) {
    const first = b.orders[0]?.createdAt.getTime() ?? Date.now();
    const at = Math.min(first - DAY, Date.now() - (2 + rnd() * 88) * DAY);
    if (at < b.createdAt.getTime()) await prisma.user.update({ where: { id: b.id }, data: { createdAt: new Date(at) } });
  }
  if (await prisma.productView.count({ where: { anonId: { startsWith: "seed-" } } })) return;
  const products = await prisma.product.findMany({ where: { status: "ACTIVE", deletedAt: null }, select: { id: true } });
  const pick = () => products[Math.floor(rnd() * products.length)].id;
  const views: Array<{ productId: string; userId?: string; anonId?: string; createdAt: Date }> = [];
  // Anonymous browsing, busier on recent days.
  for (let v = 0; v < 900; v++) {
    const day = Math.floor(Math.pow(rnd(), 1.4) * 60);
    const n = 1 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) views.push({ productId: pick(), anonId: `seed-${v}`, createdAt: new Date(Date.now() - day * DAY - rnd() * DAY) });
  }
  // Signed-in buyers look at products before each order.
  const orders = await prisma.order.findMany({ where: { createdAt: { gte: ago(60) }, user: { staffProfile: null } }, select: { userId: true, createdAt: true, items: { select: { productId: true }, take: 1 } } });
  for (const o of orders) for (let k = 0; k < 2; k++) views.push({ productId: o.items[0]?.productId ?? pick(), userId: o.userId, createdAt: new Date(o.createdAt.getTime() - (k + 1) * 3_600_000) });
  await prisma.productView.createMany({ data: views });
}

export async function seedAdmin(people: DemoAccounts) {
  if (await prisma.setting.findUnique({ where: { key: "seed.admin" } })) return;
  await pendingShop();
  await pendingProducts();
  const campaign = await campaignApplications();
  await sharedDevice(people);
  await serialReturner();
  await backfillRefunds();
  await nasiyaPortfolio(people);
  await flagsAndSettings();
  await analyticsHistory();
  await prisma.setting.create({ data: { key: "seed.admin", value: { at: new Date().toISOString() } } });
  console.log(`  admin: pending shop + 4 products, campaign applications${campaign ? ` (${campaign.slug})` : ""}, fraud cases, Nasiya portfolio, refunds, A/B flag, settings, visitor history`);
}
