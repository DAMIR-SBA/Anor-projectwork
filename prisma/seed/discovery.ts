// Phase 9 discovery demo: short videos (rendered clips in /public/demo/videos), one stream on air,
// one scheduled and one finished, and trade-in requests at every stage.
import { prisma } from "./client";
import type { DemoAccounts } from "./rbac";

const DAY = 86_400_000;

const VIDEOS = [
  { file: "bolalar-futbolkasi", product: "bolalar-futbolkasi", likes: 214, views: 3_120, uz: "Organik paxta: yuvilgandan keyin ham yumshoq", ru: "Органический хлопок: мягкий и после стирки" },
  { file: "krossovka-runner", product: "krossovka-runner", likes: 389, views: 5_870, uz: "Har kungi yugurish uchun yengil krossovka", ru: "Лёгкие кроссовки для ежедневного бега" },
  { file: "redmi-buds", product: "xiaomi-redmi-buds-5", likes: 512, views: 9_410, uz: "Shovqinni bostirish: metroda sinab ko‘rdik", ru: "Шумоподавление: проверили в метро" },
  { file: "redmi-note-13", product: "xiaomi-redmi-note-13-pro", likes: 640, views: 12_300, uz: "200 MP kamera: kechki Toshkent", ru: "Камера 200 МП: вечерний Ташкент" },
  { file: "chust-pichogi", product: "chust-pichog-i", likes: 902, views: 15_480, uz: "Chust pichog‘i usta qo‘lida qanday tug‘iladi", ru: "Как рождается чустский нож в руках мастера" },
  { file: "kuk-choy", product: "kuk-choy-95", likes: 277, views: 4_050, uz: "Ko‘k choyni to‘g‘ri damlash: 3 qoida", ru: "Как правильно заваривать зелёный чай: 3 правила" },
];

export async function seedDiscovery(people: DemoAccounts) {
  if (await prisma.setting.findUnique({ where: { key: "seed.discovery" } })) return;
  const now = Date.now();

  for (const [i, v] of VIDEOS.entries()) {
    const p = await prisma.product.findUnique({ where: { slug: v.product }, select: { id: true, shopId: true } });
    if (!p) continue;
    await prisma.shortVideo.create({ data: { shopId: p.shopId, productId: p.id, url: `/demo/videos/${v.file}.mp4`, posterUrl: `/demo/videos/${v.file}.jpg`, captionUz: v.uz, captionRu: v.ru, likes: v.likes, views: v.views, createdAt: new Date(now - (i + 1) * 9 * 3_600_000) } });
  }

  const shop = (slug: string) => prisma.shop.findUnique({ where: { slug }, select: { id: true, products: { where: { status: "ACTIVE", deletedAt: null }, orderBy: { soldCount: "desc" }, take: 5, select: { id: true } } } });
  const moda = await shop("moda-bazar");
  const tech = await shop("techhub");
  const food = await shop("samarqand-nematlari");
  if (moda?.products.length) {
    await prisma.liveStream.create({
      data: { shopId: moda.id, titleUz: "Kuzgi kolleksiya: jonli ko‘rsatuv va efir narxlari", titleRu: "Осенняя коллекция: живой показ и цены эфира", status: "LIVE", startsAt: new Date(now - 20 * 60_000), startedAt: new Date(now - 20 * 60_000), streamUrl: "/demo/videos/live-studio.mp4", posterUrl: "/demo/videos/live-studio.jpg", pinnedProductIds: moda.products.map((p) => p.id), currentProductId: moda.products[0].id, likes: 1_240, peakViewers: 86 },
    });
  }
  if (tech?.products.length) {
    await prisma.liveStream.create({
      data: { shopId: tech.id, titleUz: "Smartfon tanlaymiz: 5 mln gacha eng yaxshilari", titleRu: "Выбираем смартфон: лучшие до 5 млн", status: "SCHEDULED", startsAt: new Date(now + DAY + 2 * 3_600_000), streamUrl: "/demo/videos/redmi-note-13.mp4", posterUrl: "/demo/videos/redmi-note-13.jpg", pinnedProductIds: tech.products.map((p) => p.id), currentProductId: tech.products[0].id },
    });
  }
  if (food?.products.length) {
    await prisma.liveStream.create({
      data: { shopId: food.id, titleUz: "Samarqand non va choy: dasturxon tayyorlaymiz", titleRu: "Самаркандский чай и сладости: накрываем дастархан", status: "ENDED", startsAt: new Date(now - 2 * DAY), startedAt: new Date(now - 2 * DAY), endedAt: new Date(now - 2 * DAY + 50 * 60_000), posterUrl: "/demo/videos/kuk-choy.jpg", pinnedProductIds: food.products.map((p) => p.id), likes: 3_410, peakViewers: 212 },
    });
  }

  const answers = (o: Partial<Record<string, unknown>> = {}) => ({ powersOn: true, screen: "perfect", body: "light", battery: "good", accessories: true, locked: false, ...o });
  await prisma.tradeInRequest.createMany({
    data: [
      { number: "TI-100201", userId: people.buyer.id, category: "smartphone", deviceModel: "Apple iPhone 12", conditionGrade: "B", answers: answers({ modelKey: "iphone-12" }), estimatedValue: 2_880_000, offeredValue: 2_750_000, photos: ["/media/demo/phone-2A2A33-1.svg", "/media/demo/phone-2A2A33-11.svg"], status: "ESTIMATED", staffNote: "Korpusda chiziqlar bor, shu sababli narx biroz past.", reviewedAt: new Date(now - 3_600_000), createdAt: new Date(now - DAY) },
      { number: "TI-100188", userId: people.buyer.id, category: "watch", deviceModel: "Samsung Galaxy Watch 6", conditionGrade: "A", answers: answers({ modelKey: "galaxy-watch-6", body: "perfect" }), estimatedValue: 1_540_000, offeredValue: 1_540_000, photos: ["/media/demo/watch-2A2A33-30.svg", "/media/demo/watch-2A2A33-31.svg"], status: "COMPLETED", reviewedAt: new Date(now - 9 * DAY), acceptedAt: new Date(now - 9 * DAY), completedAt: new Date(now - 7 * DAY), createdAt: new Date(now - 10 * DAY) },
      { number: "TI-100215", userId: people.extraBuyers[0].id, category: "laptop", deviceModel: "Lenovo IdeaPad 5", conditionGrade: "C", answers: answers({ modelKey: "ideapad-5", battery: "poor" }), estimatedValue: 2_260_000, photos: ["/media/demo/laptop-6B4FBB-12.svg", "/media/demo/laptop-6B4FBB-13.svg"], imeiLast4: null, createdAt: new Date(now - 2 * 3_600_000) },
    ],
  });
  const paid = await prisma.tradeInRequest.findUnique({ where: { number: "TI-100188" } });
  if (paid) {
    const wallet = await prisma.wallet.upsert({ where: { userId: people.buyer.id }, create: { userId: people.buyer.id, balance: 1_540_000 }, update: { balance: { increment: 1_540_000 } } });
    await prisma.walletTransaction.create({ data: { walletId: wallet.id, type: "TRADE_IN", amount: 1_540_000, balanceAfter: wallet.balance, refType: "tradein", refId: paid.id, description: "Trade-in TI-100188: Samsung Galaxy Watch 6", createdAt: new Date(now - 7 * DAY) } });
  }
  await prisma.setting.create({ data: { key: "seed.discovery", value: { at: new Date().toISOString() } } });
}

/** The demo buyer's home address, so courier checkout and delivery slots work out of the box. */
export async function seedDemoAddresses(people: DemoAccounts) {
  if (await prisma.address.count({ where: { userId: people.buyer.id } })) return;
  await prisma.address.create({
    data: { userId: people.buyer.id, label: "Uy", recipient: "Aziza Karimova", phone: "+998901112233", region: "toshkent_sh", city: "Toshkent", district: "Chilonzor", street: "Bunyodkor shoh ko‘chasi", house: "24", apartment: "17", entrance: "2", floor: "5", lat: 41.2856, lng: 69.2034, isDefault: true },
  });
}
