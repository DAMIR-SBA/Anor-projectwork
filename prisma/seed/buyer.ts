// Phase 8 demo data: achievements and missions, a check-in streak and Plus members, and the
// wheel of fortune switched on for the running flash sale.
import { prisma } from "./client";
import type { DemoAccounts } from "./rbac";

const DAY = 86_400_000;
const dayKey = (d: Date) => new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);

const ACHIEVEMENTS = [
  { key: "first_order", icon: "🛍️", points: 1_000, criteria: { metric: "orders", gte: 1 }, nameUz: "Birinchi xarid", nameRu: "Первая покупка", descUz: "Birinchi buyurtmangiz yetkazildi", descRu: "Первый заказ доставлен" },
  { key: "regular", icon: "🎯", points: 5_000, criteria: { metric: "orders", gte: 10 }, nameUz: "Doimiy xaridor", nameRu: "Постоянный покупатель", descUz: "10 ta yetkazilgan buyurtma", descRu: "10 доставленных заказов" },
  { key: "first_review", icon: "✍️", points: 1_000, criteria: { metric: "reviews", gte: 1 }, nameUz: "Birinchi sharh", nameRu: "Первый отзыв", descUz: "Birinchi sharhingiz chop etildi", descRu: "Первый отзыв опубликован" },
  { key: "critic", icon: "🏆", points: 5_000, criteria: { metric: "reviews", gte: 10 }, nameUz: "Tanqidchi", nameRu: "Критик", descUz: "10 ta chop etilgan sharh", descRu: "10 опубликованных отзывов" },
  { key: "photographer", icon: "📸", points: 3_000, criteria: { metric: "photoReviews", gte: 3 }, nameUz: "Fotograf", nameRu: "Фотограф", descUz: "Rasmli 3 ta sharh", descRu: "3 отзыва с фото" },
  { key: "week_streak", icon: "🔥", points: 2_000, criteria: { metric: "checkinStreak", gte: 7 }, nameUz: "Haftalik seriya", nameRu: "Неделя подряд", descUz: "7 kun ketma-ket kirish", descRu: "7 дней подряд" },
  { key: "month_streak", icon: "🌟", points: 10_000, criteria: { metric: "checkinStreak", gte: 30 }, nameUz: "Oylik seriya", nameRu: "Месяц подряд", descUz: "30 kun ketma-ket kirish", descRu: "30 дней подряд" },
  { key: "friend", icon: "🤝", points: 2_000, criteria: { metric: "referrals", gte: 1 }, nameUz: "Do‘st taklif qildi", nameRu: "Пригласил друга", descUz: "Taklifingiz bilan bir do‘st qo‘shildi", descRu: "Друг зарегистрировался по приглашению" },
];

const MISSIONS = [
  { key: "daily_checkin", period: "DAILY", action: "CHECKIN", target: 1, rewardPoints: 200, titleUz: "Kunlik kirish", titleRu: "Ежедневный вход", descUz: "Bugun belgilaning", descRu: "Отметьтесь сегодня" },
  { key: "daily_browse", period: "DAILY", action: "VIEW_PRODUCTS", target: 5, rewardPoints: 300, titleUz: "Tanishib chiqing", titleRu: "Присмотритесь", descUz: "5 ta mahsulotni ko‘ring", descRu: "Посмотрите 5 товаров" },
  { key: "daily_wishlist", period: "DAILY", action: "ADD_WISHLIST", target: 2, rewardPoints: 200, titleUz: "Sevimlilar", titleRu: "Избранное", descUz: "2 ta mahsulotni sevimlilarga qo‘shing", descRu: "Добавьте 2 товара в избранное" },
  { key: "weekly_order", period: "WEEKLY", action: "ORDER", target: 1, rewardPoints: 2_000, titleUz: "Haftalik xarid", titleRu: "Покупка недели", descUz: "Bu hafta buyurtma oling", descRu: "Получите заказ на этой неделе" },
  { key: "weekly_review", period: "WEEKLY", action: "REVIEW", target: 2, rewardPoints: 1_500, titleUz: "Fikr bildiring", titleRu: "Поделитесь мнением", descUz: "2 ta sharh yozing", descRu: "Напишите 2 отзыва" },
  { key: "weekly_share", period: "WEEKLY", action: "SHARE", target: 3, rewardPoints: 1_000, titleUz: "Do‘stlarga ulashing", titleRu: "Поделитесь с друзьями", descUz: "3 ta mahsulotni ulashing", descRu: "Поделитесь 3 товарами" },
] as const;

export async function seedBuyerPhase8(people: DemoAccounts) {
  if (await prisma.setting.findUnique({ where: { key: "seed.buyer8" } })) return;
  for (const a of ACHIEVEMENTS) await prisma.achievement.upsert({ where: { key: a.key }, update: {}, create: a });
  for (const m of MISSIONS) await prisma.mission.upsert({ where: { key: m.key }, update: {}, create: m });

  // Four-day streak ending yesterday: checking in today continues it.
  const now = Date.now();
  for (let i = 4; i >= 1; i--) {
    const day = dayKey(new Date(now - i * DAY));
    const streak = 5 - i;
    await prisma.checkIn.upsert({ where: { userId_day: { userId: people.buyer.id, day } }, update: {}, create: { userId: people.buyer.id, day, streak, points: 100 + (streak - 1) * 50, createdAt: new Date(now - i * DAY) } });
  }

  // Two Plus members (one annual, one monthly that renews soon).
  const members = [
    { user: people.extraBuyers[1], plan: "PLUS_ANNUAL" as const, price: 249_000, started: 120, months: 12 },
    { user: people.business, plan: "PLUS_MONTHLY" as const, price: 29_000, started: 28, months: 1 },
  ];
  for (const m of members) {
    if (!m.user || (await prisma.subscription.count({ where: { userId: m.user.id } }))) continue;
    const startedAt = new Date(now - m.started * DAY);
    const end = new Date(startedAt);
    end.setUTCMonth(end.getUTCMonth() + m.months);
    await prisma.subscription.create({ data: { userId: m.user.id, plan: m.plan, price: m.price, status: "ACTIVE", autoRenew: true, startedAt, currentPeriodEnd: end } });
    await prisma.payment.create({ data: { userId: m.user.id, method: "CLICK", purpose: "SUBSCRIPTION", amount: m.price, status: "PAID", paidAt: startedAt, createdAt: startedAt, meta: { plan: m.plan } } });
  }

  // Spin days: the running flash sale opens the wheel.
  await prisma.campaign.updateMany({ where: { type: "FLASH_SALE", status: "ACTIVE" }, data: { spinEnabled: true } });

  await prisma.setting.create({ data: { key: "seed.buyer8", value: { at: new Date().toISOString() } } });
  console.log("  buyer: 8 achievements, 6 missions, check-in streak, 2 Plus members, spin wheel on the flash sale");
}
