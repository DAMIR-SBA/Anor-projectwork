import { prisma } from "./client";
import { artUrl } from "../../src/lib/product-art";

/** Seller stories and artisan stories (home page + Made in Uzbekistan). */
export async function seedStories() {
  if (await prisma.story.count()) return;
  const shops = Object.fromEntries((await prisma.shop.findMany()).map((s) => [s.slug, s]));
  const day = 86_400_000;
  const data = [
    { shop: "hunarmand-ustaxonasi", kind: "ARTISAN" as const, titleUz: "Rishtonlik usta Abdulla aka", titleRu: "Риштанский мастер Абдулла-ака", bodyUz: "40 yildan beri ishqor sirli lagan yasaydi. Har bir naqsh qo‘lda chiziladi.", bodyRu: "40 лет создаёт ляганы под щелочной глазурью. Каждый узор рисуется вручную.", media: artUrl("plate", "0E8C8C", 51), products: ["rishton-lagan-katta"] },
    { shop: "hunarmand-ustaxonasi", kind: "ARTISAN" as const, titleUz: "Marg‘ilon atlasi qanday to‘qiladi", titleRu: "Как ткут маргиланский атлас", bodyUz: "Abr usuli: iplar to‘qishdan oldin bo‘yaladi, shuning uchun naqsh «suzib» turadi.", bodyRu: "Техника абр: нити окрашивают до ткачества, поэтому узор будто «плывёт».", media: artUrl("atlas", "C8102E", 52), products: ["margilon-atlas-5m"] },
    { shop: "hunarmand-ustaxonasi", kind: "ARTISAN" as const, titleUz: "Chust pichoqchilari", titleRu: "Чустские мастера ножей", bodyUz: "Po‘lat qo‘lda toblanadi, dastasi shox va suyakdan naqshlanadi.", bodyRu: "Сталь закаляют вручную, рукоять украшают рогом и костью.", media: artUrl("knife", "B5651D", 53), products: ["chust-pichog-i"] },
    { shop: "techhub", kind: "SELLER_STORY" as const, titleUz: "iPhone 15 — narx tushdi", titleRu: "iPhone 15 подешевел", bodyUz: "Bugun 1 million so‘mdan ortiq chegirma va 12 oylik nasiya.", bodyRu: "Сегодня скидка более 1 млн сум и насия на 12 месяцев.", media: artUrl("phone", "2A2A33", 54), products: ["apple-iphone-15"] },
    { shop: "moda-bazar", kind: "SELLER_STORY" as const, titleUz: "Kuzgi kolleksiya", titleRu: "Осенняя коллекция", bodyUz: "Atlas naqshli ko‘ylaklar va issiq kurtkalar keldi.", bodyRu: "Поступили платья с атласным узором и тёплые куртки.", media: artUrl("dress", "C8102E", 55), products: ["atlas-ko-ylak-guldasta"] },
    { shop: "samarqand-nematlari", kind: "SELLER_STORY" as const, titleUz: "Yangi hosil o‘rigi", titleRu: "Курага нового урожая", bodyUz: "Farg‘ona vodiysidan quyoshda quritilgan o‘rik.", bodyRu: "Курага из Ферганской долины, высушенная на солнце.", media: artUrl("nuts", "F5B301", 56), products: ["quritilgan-orik-1kg"] },
  ];
  for (const s of data) {
    const shop = shops[s.shop];
    if (!shop) continue;
    await prisma.story.create({ data: { shopId: shop.id, kind: s.kind, titleUz: s.titleUz, titleRu: s.titleRu, bodyUz: s.bodyUz, bodyRu: s.bodyRu, mediaUrl: s.media, productIds: s.products, expiresAt: s.kind === "ARTISAN" ? null : new Date(Date.now() + 30 * day) } });
  }
  console.log(`  stories: ${data.length}`);
}
