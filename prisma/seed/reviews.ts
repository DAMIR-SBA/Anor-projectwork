// Demo reviews: delivered orders from reviewer accounts, reviews (uz/ru) with photos, votes,
// seller replies, shop ratings, Q&A, and a few cases for the moderation queue.
import { randomBytes } from "node:crypto";
import { prisma } from "./client";
import { createUser, type DemoAccounts } from "./rbac";
import { evaluateReview, summarizeReviews, REVIEW_EDIT_DAYS } from "../../src/lib/review-moderation";
import { artUrl } from "../../src/lib/product-art";

const DAY = 86_400_000;
let seedState = 4_051_2026;
function rnd() {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const pickN = <T,>(a: readonly T[], n: number): T[] => [...a].sort(() => rnd() - 0.5).slice(0, n);
const pw = () => `Demo-${randomBytes(9).toString("base64url")}`;

type Lang = "uz" | "ru";
type Bank = { pros: string[]; cons: string[]; pos: string[]; mid: string[]; neg: string[] };
type Group = "gadget" | "audio" | "appliance" | "fashion" | "food" | "craft" | "general";

const BANK: Record<Group, Record<Lang, Bank>> = {
  gadget: {
    uz: {
      pros: ["Batareya uzoq ushlaydi", "Ekrani juda tiniq", "Tez ishlaydi va qotmaydi", "Original va kafolatli", "Kamerasi zo‘r", "Yetkazib berish tez bo‘ldi", "Qadoqlash puxta", "Narxiga arziydi"],
      cons: ["Zaryadlovchi qutida yo‘q", "Biroz qiziydi", "Narxi qimmatroq", "Chexol alohida sotib olish kerak", "Korpus tez chiziladi"],
      pos: ["Ikki haftadan beri ishlatyapman, hammasi a’lo. Do‘konga rahmat!", "Rasmiy kafolat bilan keldi, IMEI tekshirdim — original.", "Buyurtma bergan kunimning ertasiga keldi. Tavsiya qilaman.", "Sovg‘a uchun oldim, juda xursand bo‘lishdi."],
      mid: ["Umuman yaxshi, lekin kutganimdek emas.", "Narxiga mos, ammo batareya o‘rtacha."],
      neg: ["Qutisi ezilgan holda keldi, ichi butun ekan, lekin kayfiyat buzildi.", "Bir haftadan keyin zaryad olmay qoldi, qaytarishga ariza berdim.", "Rangini boshqa yuborishdi."],
    },
    ru: {
      pros: ["Батарея держит долго", "Очень чёткий экран", "Быстро работает", "Оригинал с гарантией", "Отличная камера", "Быстрая доставка", "Хорошая упаковка", "Стоит своих денег"],
      cons: ["Нет зарядки в комплекте", "Немного греется", "Цена кусается", "Чехол нужно покупать отдельно"],
      pos: ["Пользуюсь две недели, всё отлично. Спасибо магазину!", "Пришёл с официальной гарантией, проверил IMEI — оригинал.", "Заказал вечером, привезли на следующий день."],
      mid: ["В целом неплохо, но ожидал большего.", "За свои деньги нормально."],
      neg: ["Коробка пришла помятой.", "Через неделю перестал заряжаться, оформил возврат."],
    },
  },
  audio: {
    uz: {
      pros: ["Ovozi baland va toza", "Shovqinni yaxshi bosadi", "Quloqda qulay turadi", "Batareya uzoq ushlaydi", "Telefonga tez ulanadi", "Narxiga arziydi"],
      cons: ["Mikrofoni o‘rtacha", "Qutisi tez chiziladi", "Narxi qimmatroq"],
      pos: ["Har kuni metroda ishlataman, shovqinni deyarli eshitmayman.", "Original, ilovada seriya raqami tasdiqlandi.", "Sport bilan shug‘ullanganda ham tushib ketmaydi."],
      mid: ["Ovozi yaxshi, lekin bass kamroq."],
      neg: ["Bir tomoni pastroq eshitiladi, almashtirishni so‘radim."],
    },
    ru: {
      pros: ["Громкий и чистый звук", "Хорошее шумоподавление", "Удобно сидят", "Батарея держит долго"],
      cons: ["Микрофон средний", "Кейс быстро царапается"],
      pos: ["Каждый день в метро — шума почти не слышно.", "Оригинал, серийный номер подтвердился в приложении."],
      mid: ["Звук хороший, но басов маловато."],
      neg: ["Один наушник тише другого, запросил замену."],
    },
  },
  appliance: {
    uz: {
      pros: ["Shovqinsiz ishlaydi", "Kam elektr sarflaydi", "O‘rnatish oson", "Sifatli yig‘ilgan", "Yetkazib berish tez bo‘ldi", "Narxiga arziydi", "Kafolat taloni bor"],
      cons: ["Shnuri kalta", "Ko‘rsatma faqat rus tilida", "Narxi qimmatroq", "Biroz og‘ir"],
      pos: ["Bir oydan beri ishlatyapmiz, hammasi a’lo. Do‘konga rahmat!", "Kuryer uyga olib chiqib berdi, rahmat.", "Onamga sovg‘a qildim, juda xursand bo‘lishdi."],
      mid: ["Umuman yaxshi, lekin kutganimdek emas."],
      neg: ["Qutisi ezilgan holda keldi, korpusda chiziq bor.", "Bir haftada buzildi, servisga topshirdim."],
    },
    ru: {
      pros: ["Работает тихо", "Экономичный", "Легко установить", "Качественная сборка", "Быстрая доставка"],
      cons: ["Короткий шнур", "Тяжеловат"],
      pos: ["Пользуемся месяц, всё отлично.", "Курьер поднял до квартиры, спасибо."],
      mid: ["Нормально, но ожидал большего."],
      neg: ["Пришёл с вмятиной на корпусе."],
    },
  },
  fashion: {
    uz: {
      pros: ["Mato sifatli", "O‘lchami to‘g‘ri keldi", "Rangi rasmdagidek", "Tikilishi puxta", "Yumshoq va qulay", "Yuvgandan keyin kirishmadi"],
      cons: ["O‘lchami biroz katta", "Ipi chiqib turibdi", "Rangi rasmdagidan och", "Yuvishdan oldin hidi bor edi"],
      pos: ["Kundalik kiyish uchun juda qulay. Yana buyurtma qilaman.", "Turmush o‘rtog‘imga oldim, juda yoqdi.", "O‘lchamlar jadvaliga qarab oldim — aynan to‘g‘ri keldi."],
      mid: ["Yaxshi, lekin bir o‘lcham kichikroq olish kerak edi."],
      neg: ["Ikkinchi yuvishdan keyin rangi o‘chdi.", "O‘lcham jadvalga to‘g‘ri kelmadi, qaytardim."],
    },
    ru: {
      pros: ["Качественная ткань", "Размер подошёл", "Цвет как на фото", "Аккуратные швы", "Мягкая и удобная"],
      cons: ["Маломерит", "Торчат нитки", "Цвет светлее, чем на фото"],
      pos: ["Очень удобно на каждый день. Буду заказывать ещё.", "Брала по таблице размеров — подошло идеально."],
      mid: ["Хорошо, но стоило взять размер меньше."],
      neg: ["После второй стирки полинял."],
    },
  },
  food: {
    uz: {
      pros: ["Yangi va mazali", "Halol sertifikati bor", "Qadoqlash germetik", "Tabiiy ta’m", "Bolalarga juda yoqdi"],
      cons: ["Qadoqdagi miqdor kamroq tuyuldi", "Narxi bozordan qimmatroq", "Ba’zilari ezilgan"],
      pos: ["Haqiqiy tog‘ asali, ta’mi zo‘r.", "Mehmonlar uchun oldim, hammaga yoqdi.", "Har oy shu yerdan buyurtma qilaman."],
      mid: ["Mazali, lekin narxi biroz baland."],
      neg: ["Yaroqlilik muddati tugashiga oz qolgan ekan."],
    },
    ru: {
      pros: ["Свежие и вкусные", "Есть сертификат халяль", "Герметичная упаковка", "Натуральный вкус"],
      cons: ["Вес меньше заявленного", "Дороже, чем на рынке"],
      pos: ["Мёд настоящий горный, вкус отличный.", "Брали к приезду гостей — всем понравилось."],
      mid: ["Вкусно, но дороговато."],
      neg: ["Срок годности почти истёк."],
    },
  },
  craft: {
    uz: {
      pros: ["Qo‘l mehnati sezilib turadi", "Naqshlari juda chiroyli", "Sifatli material", "Sovg‘a uchun ideal", "Puxta qadoqlangan"],
      cons: ["Yetkazish biroz uzoq davom etdi", "Rangi rasmdagidan to‘qroq", "Narxi baland"],
      pos: ["Chet eldagi qarindoshlarimga sovg‘a qildim — juda xursand bo‘lishdi.", "Har bir naqsh qo‘lda chizilgan, haqiqiy usta ishi.", "Ustaga katta rahmat, puxta qadoqlab yuborishdi."],
      mid: ["Chiroyli, lekin kichikroq ekan."],
      neg: ["Yo‘lda bir cheti siniq holda keldi."],
    },
    ru: {
      pros: ["Чувствуется ручная работа", "Очень красивые узоры", "Идеально для подарка"],
      cons: ["Доставка заняла дольше", "Цвет темнее, чем на фото"],
      pos: ["Подарила родственникам за границей — в восторге.", "Роспись вручную, настоящая работа мастера."],
      mid: ["Красиво, но меньше, чем ожидала."],
      neg: ["Пришло со сколом на краю."],
    },
  },
  general: {
    uz: {
      pros: ["Sifati yaxshi", "Narxiga arziydi", "Tez yetkazishdi", "Rasmdagidek", "Ishlatish qulay"],
      cons: ["Ko‘rsatma yo‘q", "Qadoq oddiy", "Biroz kichik"],
      pos: ["Hammasi yoqdi, rahmat!", "Ikkinchi marta buyurtma qilyapman, sifat o‘zgarmagan.", "Bolalar juda xursand."],
      mid: ["Yomon emas, lekin yaxshiroq bo‘lishi mumkin edi."],
      neg: ["Tavsifga mos kelmadi."],
    },
    ru: {
      pros: ["Хорошее качество", "Стоит своих денег", "Быстро доставили", "Как на фото"],
      cons: ["Нет инструкции", "Простая упаковка"],
      pos: ["Всё понравилось, спасибо!", "Заказываю второй раз, качество не изменилось."],
      mid: ["Неплохо, но могло быть лучше."],
      neg: ["Не соответствует описанию."],
    },
  },
};

const REPLIES: Record<Lang, { pos: string[]; neg: string[] }> = {
  uz: {
    pos: ["Xaridingiz uchun rahmat! Yana kutib qolamiz.", "Iliq fikringiz uchun katta rahmat! Sizni yana ko‘rishdan xursand bo‘lamiz.", "Rahmat! Mahsulot sizga yoqqanidan xursandmiz."],
    neg: ["Noqulaylik uchun uzr so‘raymiz. Iltimos, chat orqali yozing — almashtirib beramiz.", "Fikringiz uchun rahmat. Buyurtma sahifasidan qaytarish arizasini qoldiring, tez ko‘rib chiqamiz.", "Uzr so‘raymiz! Qadoqlashni kuchaytirdik, bunday holat takrorlanmaydi."],
  },
  ru: {
    pos: ["Спасибо за покупку! Ждём вас снова.", "Благодарим за тёплый отзыв!"],
    neg: ["Приносим извинения. Напишите нам в чат — заменим товар.", "Спасибо за отзыв. Оформите возврат на странице заказа, рассмотрим быстро."],
  },
};

const TECH_QA = [
    { q: "Rasmiy kafolat necha yil?", a: "Rasmiy kafolat — 1 yil, servis markazi Toshkentda.", buyer: "Menga kafolat taloni bilan keldi, 12 oy." },
    { q: "O‘zbekistonda ro‘yxatdan o‘tganmi (IMEI)?", a: "Ha, barcha qurilmalar IMEI ro‘yxatidan o‘tgan." },
    { q: "Гарантия официальная?", a: "Да, официальная гарантия 12 месяцев." },
    { q: "Qutida zaryadlovchi bormi?", a: "Faqat kabel bor, zaryadlovchi blok alohida sotiladi." },
];

const QUESTIONS: Record<Group, Array<{ q: string; a: string; buyer?: string }>> = {
  gadget: TECH_QA,
  audio: TECH_QA.slice(0, 3),
  appliance: [
    { q: "Rasmiy kafolat necha yil?", a: "Ishlab chiqaruvchi kafolati — 2 yil.", buyer: "Menga kafolat taloni bilan keldi." },
    { q: "Доставка до квартиры?", a: "Да, курьер поднимет до двери." },
  ],
  fashion: [
    { q: "M o‘lcham 170 sm bo‘yga mos keladimi?", a: "Ha, 165–175 sm uchun M o‘lcham tavsiya qilamiz.", buyer: "Men 172 sm, M aynan to‘g‘ri keldi." },
    { q: "Mato tarkibi qanday?", a: "95% paxta, 5% elastan." },
    { q: "Ткань не просвечивает?", a: "Нет, ткань плотная." },
  ],
  food: [
    { q: "Yaroqlilik muddati qancha?", a: "Ishlab chiqarilgan kundan 12 oy." },
    { q: "Halol sertifikati bormi?", a: "Ha, sertifikat mahsulot sahifasidagi rasmlarda bor." },
  ],
  craft: [
    { q: "Buyurtma bo‘yicha boshqa rangda tayyorlab berasizmi?", a: "Ha, 7–10 kun ichida. Chat orqali yozing." },
    { q: "Idishni posudomoykada yuvsa bo‘ladimi?", a: "Qo‘lda yuvishni tavsiya qilamiz, naqsh uzoq saqlanadi." },
  ],
  general: [
    { q: "Qadoqlangan holda o‘lchami qanday?", a: "Taxminan 40×30×20 sm." },
    { q: "Есть доставка в Самарканд?", a: "Да, доставляем по всему Узбекистану." },
  ],
};

const REVIEWERS = [
  "Sardor Qodirov", "Dilfuza Rahimova", "Jasur Toshpo‘latov", "Malika Yusupova", "Bobur Ergashev", "Nigora Saidova", "Ulug‘bek Karimov", "Zarina Aliyeva",
  "Sherzod Mirzayev", "Kamola Nazarova", "Akmal Xoliqov", "Feruza Usmonova", "Elena Kim", "Dmitriy Pak", "Olga Tsoy", "Aleksandr Li",
  "Shohruh Abdurahmonov", "Mohira Jo‘rayeva", "Islom Valiyev", "Laylo Hasanova", "Rustam Qosimov", "Gulshan Ahmedova", "Murod Tursunov", "Sevara Islomova",
];

function groupFor(top: string, leaf: string): Group {
  if (leaf === "quloqchinlar") return "audio";
  if (top === "maishiy-texnika" || leaf === "televizorlar") return "appliance";
  if (top === "elektronika") return "gadget";
  if (top === "kiyim") return "fashion";
  if (top === "oziq-ovqat") return "food";
  if (top === "hunarmandchilik") return "craft";
  return "general";
}

function ratingSample(): number {
  const r = rnd();
  return r < 0.56 ? 5 : r < 0.8 ? 4 : r < 0.9 ? 3 : r < 0.95 ? 2 : 1;
}

function compose(g: Group, lang: Lang, rating: number) {
  const b = BANK[g][lang];
  const tone = rating >= 4 ? "pos" : rating === 3 ? "mid" : "neg";
  const pros = rating >= 3 || rnd() < 0.3 ? pickN(b.pros, rating >= 4 ? 2 : 1).join(", ") : null;
  const cons = rating <= 4 && (rating < 4 || rnd() < 0.5) ? pickN(b.cons, 1).join(", ") : rnd() < 0.15 ? pick(b.cons) : null;
  const comment = rnd() < 0.85 || rating <= 3 ? pick(b[tone]) : null;
  return { pros, cons, comment };
}

let orderSeq = 0;
async function deliveredOrder(userId: string, shopId: string, items: Array<{ productId: string; variantId: string; title: string; variantTitle: string | null; price: number; image: string | null; commission: number }>, deliveredAt: Date, opts: { fulfillment: "FBO" | "FBS" | "DBS"; withEvents?: boolean }) {
  orderSeq++;
  const d = new Date(deliveredAt.getTime() - 3 * DAY + 5 * 3_600_000).toISOString().slice(2, 10).replace(/-/g, "");
  const number = `${d}-9${String(orderSeq).padStart(4, "0")}`;
  const subtotal = items.reduce((s, i) => s + i.price, 0);
  const placedAt = new Date(deliveredAt.getTime() - 3 * DAY);
  const group = await prisma.orderGroup.create({
    data: {
      number,
      userId,
      subtotal,
      total: subtotal,
      paymentMethod: "CLICK",
      paymentStatus: "PAID",
      createdAt: placedAt,
      orders: {
        create: [
          {
            number: `${number}-1`,
            userId,
            shopId,
            status: "DELIVERED",
            fulfillment: opts.fulfillment,
            subtotal,
            total: subtotal,
            commissionTotal: items.reduce((s, i) => s + Math.round(i.price * i.commission), 0),
            deliveryMethod: "COURIER",
            region: "toshkent_sh",
            paymentMethod: "CLICK",
            address: { recipient: "—", phone: "", city: "Toshkent", street: "", house: "" },
            confirmedAt: new Date(placedAt.getTime() + 3_600_000),
            deliveredAt,
            createdAt: placedAt,
            items: { create: items.map((i) => ({ productId: i.productId, variantId: i.variantId, title: i.title, variantTitle: i.variantTitle, imageUrl: i.image, unitPrice: i.price, quantity: 1, commissionRate: i.commission, commissionAmount: Math.round(i.price * i.commission) })) },
            ...(opts.withEvents
              ? {
                  events: {
                    create: (["PLACED", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"] as const).map((status, k) => ({ status, createdAt: new Date(placedAt.getTime() + k * (k === 4 ? 0.75 * DAY : 0.5 * DAY)) })),
                  },
                }
              : {}),
          },
        ],
      },
    },
    include: { orders: true },
  });
  return group.orders[0];
}

async function recompute() {
  const products = await prisma.product.findMany({ select: { id: true, shopId: true } });
  for (const p of products) {
    const reviews = await prisma.review.findMany({ where: { productId: p.id, status: "APPROVED", deletedAt: null }, select: { rating: true, pros: true, cons: true, comment: true, helpfulCount: true, lang: true }, orderBy: { helpfulCount: "desc" } });
    const breakdown: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const r of reviews) breakdown[String(r.rating)]++;
    const avg = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : 0;
    await prisma.product.update({ where: { id: p.id }, data: { rating: avg, reviewCount: reviews.length, ratingBreakdown: breakdown, reviewSummary: reviews.length >= 3 ? summarizeReviews(reviews) : undefined } });
  }
  for (const s of await prisma.shop.findMany({ select: { id: true } })) {
    const agg = await prisma.review.aggregate({ _avg: { rating: true }, _count: { _all: true }, where: { status: "APPROVED", deletedAt: null, product: { shopId: s.id } } });
    const sr = await prisma.shopReview.findMany({ where: { shopId: s.id, status: "APPROVED" } });
    const shopAvg = sr.length ? sr.reduce((x, r) => x + (r.deliverySpeed + r.packaging + r.communication) / 3, 0) / sr.length : null;
    const prodAvg = agg._avg.rating;
    const rating = prodAvg != null && shopAvg != null ? prodAvg * 0.7 + shopAvg * 0.3 : (prodAvg ?? shopAvg ?? 0);
    const replies = await prisma.reviewReply.findMany({ where: { shopId: s.id }, include: { review: { select: { createdAt: true } } } });
    const mins = replies.map((r) => (r.createdAt.getTime() - r.review.createdAt.getTime()) / 60_000).filter((m) => m >= 0);
    await prisma.shop.update({ where: { id: s.id }, data: { rating: Math.round(rating * 10) / 10, reviewCount: agg._count._all + sr.length, responseTimeMins: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null } });
  }
}

export async function seedReviews(people: DemoAccounts) {
  // Demo personas are long-standing customers (fresh accounts posting 5★ are flagged for moderation).
  const since = new Date(Date.now() - 400 * DAY);
  await prisma.user.updateMany({ where: { id: { in: [people.buyer.id, people.business.id, people.seller.id, people.artisan.id, people.techSeller.id, ...people.extraBuyers.map((u) => u.id)] }, createdAt: { gt: new Date(Date.now() - 30 * DAY) } }, data: { createdAt: since } });
  if ((await prisma.review.count()) > 0) {
    await recompute();
    console.log("  reviews: already seeded (aggregates recomputed)");
    return;
  }
  const reviewers = [];
  for (const [i, name] of REVIEWERS.entries()) {
    const u = await createUser({ login: `reviewer_${String(i + 1).padStart(2, "0")}`, name, password: pw() });
    await prisma.user.update({ where: { id: u.id }, data: { createdAt: new Date(Date.now() - (60 + Math.floor(rnd() * 600)) * DAY) } });
    reviewers.push(u);
  }
  const voters = [...reviewers, ...people.extraBuyers];

  const products = await prisma.product.findMany({
    where: { status: "ACTIVE", deletedAt: null },
    include: { variants: { orderBy: { price: "asc" } }, media: { orderBy: { sort: "asc" }, take: 1 }, category: { include: { parent: { include: { parent: true } } } }, shop: true },
    orderBy: { soldCount: "desc" },
  });

  let created = 0;
  for (const [pi, p] of products.entries()) {
    const top = p.category.parent?.parent?.slug ?? p.category.parent?.slug ?? p.category.slug;
    const g = groupFor(top, p.category.slug);
    const n = pi < 10 ? 7 + Math.floor(rnd() * 6) : pi < 30 ? 3 + Math.floor(rnd() * 5) : Math.floor(rnd() * 4);
    const art = p.media[0]?.url.match(/\/media\/demo\/([a-z]+)-([0-9A-F]{6})-\d+\.svg/);
    for (const u of pickN(reviewers, n)) {
      const v = pick(p.variants);
      const daysAgo = Math.floor(rnd() ** 1.4 * 115) + 2;
      const at = new Date(Date.now() - daysAgo * DAY - Math.floor(rnd() * 12) * 3_600_000);
      const order = await deliveredOrder(u.id, p.shopId, [{ productId: p.id, variantId: v.id, title: p.titleUz, variantTitle: v.titleUz, price: v.price, image: p.media[0]?.url ?? null, commission: 0.1 }], new Date(at.getTime() - DAY), { fulfillment: p.fulfillment });
      const lang: Lang = /Elena|Dmitriy|Olga|Aleksandr/.test(u.name ?? "") || rnd() < 0.15 ? "ru" : "uz";
      const rating = ratingSample();
      const text = compose(g, lang, rating);
      const media = art && rnd() < 0.22 ? Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, k) => ({ url: artUrl(art[1], art[2], 7 + k * 20 + Math.floor(rnd() * 20)), type: "IMAGE" as const, sort: k })) : [];
      const anon = rnd() < 0.12;
      const review = await prisma.review.create({
        data: {
          productId: p.id,
          orderId: order.id,
          userId: u.id,
          variantId: v.id,
          rating,
          ...text,
          isAnonymous: anon,
          displayName: anon ? null : u.name!.split(" ")[0],
          status: "APPROVED",
          flags: [],
          hasMedia: media.length > 0,
          lang,
          editableUntil: new Date(at.getTime() + REVIEW_EDIT_DAYS * DAY),
          createdAt: at,
          bonusAwardedAt: media.length ? at : null,
          media: { create: media },
        },
      });
      created++;
      // Helpful votes from other accounts.
      const up = Math.floor(rnd() ** 2 * (rating >= 4 ? 14 : 8)) + (media.length ? 2 : 0);
      const down = rnd() < 0.3 ? Math.floor(rnd() * 3) : 0;
      const vs = pickN(voters.filter((x) => x.id !== u.id), Math.min(voters.length - 1, up + down));
      if (vs.length) await prisma.reviewVote.createMany({ data: vs.map((x, k) => ({ reviewId: review.id, userId: x.id, value: k < up ? 1 : -1 })) });
      await prisma.review.update({ where: { id: review.id }, data: { helpfulCount: Math.min(up, vs.length), notHelpfulCount: Math.max(0, vs.length - up) } });
      // Seller replies: most negative reviews, some positive ones (the moda shop leaves many unanswered).
      const replyChance = p.shop.slug === "moda-bazar" ? 0.15 : rating <= 3 ? 0.85 : 0.35;
      if (rnd() < replyChance) {
        await prisma.reviewReply.create({ data: { reviewId: review.id, shopId: p.shopId, authorId: p.shop.ownerId, text: pick(REPLIES[lang][rating <= 3 ? "neg" : "pos"]), createdAt: new Date(at.getTime() + (0.5 + rnd() * 30) * 3_600_000) } });
      }
      if (rnd() < 0.5) {
        await prisma.shopReview.create({ data: { shopId: p.shopId, orderId: order.id, userId: u.id, deliverySpeed: Math.max(1, Math.min(5, rating + (rnd() < 0.3 ? 1 : 0))), packaging: Math.max(2, rating), communication: rnd() < 0.8 ? 5 : 4, createdAt: at } });
      }
    }
    // Q&A on the most popular products.
    if (pi < 16) {
      for (const [k, item] of pickN(QUESTIONS[g], 1 + Math.floor(rnd() * 2)).entries()) {
        const asker = pick(voters);
        const at = new Date(Date.now() - (5 + Math.floor(rnd() * 60)) * DAY);
        // A couple of questions stay unanswered so the seller inbox has work.
        const unanswered = (pi === 3 || pi === 7 || p.shop.slug === "moda-bazar") && k === 0;
        await prisma.question.create({
          data: {
            productId: p.id,
            userId: asker.id,
            text: item.q,
            createdAt: at,
            answers: unanswered
              ? undefined
              : { create: [{ userId: p.shop.ownerId, isSeller: true, text: item.a, createdAt: new Date(at.getTime() + 2 * 3_600_000) }, ...(item.buyer ? [{ userId: pick(reviewers).id, isSeller: false, text: item.buyer, createdAt: new Date(at.getTime() + DAY) }] : [])] },
          },
        });
      }
    }
  }

  await seedModerationCases(products, reviewers, people);
  await seedDemoBuyer(products, people);
  await recompute();
  console.log(`  reviews: ${created} demo reviews, Q&A and moderation cases`);
}

type P = Awaited<ReturnType<typeof prisma.product.findMany<{ include: { variants: true; media: true; shop: true } }>>>[number];

async function seedModerationCases(products: P[], reviewers: Array<{ id: string; name: string | null }>, people: DemoAccounts) {
  const bySlug = (s: string) => products.find((p) => p.slug === s) ?? products[0];
  const make = async (p: P, userId: string, rating: number, text: { pros?: string; cons?: string; comment: string }, at: Date, accountAgeDays: number) => {
    const order = await deliveredOrder(userId, p.shopId, [{ productId: p.id, variantId: p.variants[0].id, title: p.titleUz, variantTitle: p.variants[0].titleUz, price: p.variants[0].price, image: p.media[0]?.url ?? null, commission: 0.1 }], new Date(at.getTime() - DAY), { fulfillment: p.fulfillment });
    const all = [text.pros, text.cons, text.comment].filter(Boolean).join("\n");
    const { flags, score } = evaluateReview({ text: all, rating, accountAgeDays, duplicateOfOwn: false, duplicateAcrossUsers: false, recentNewAccount5StarsOnProduct: 0 });
    const r = await prisma.review.create({ data: { productId: p.id, orderId: order.id, userId, variantId: p.variants[0].id, rating, ...text, displayName: "Mijoz", status: flags.length ? "PENDING" : "APPROVED", flags, flagScore: score, lang: "uz", editableUntil: new Date(at.getTime() + REVIEW_EDIT_DAYS * DAY), createdAt: at } });
    if (flags.length) await prisma.reviewModerationAction.create({ data: { reviewId: r.id, action: "AUTO_FLAG", reason: flags.join(","), createdAt: at } });
    return r;
  };
  const now = Date.now();
  // Contact details and a link → auto-flagged.
  await make(bySlug("samsung-galaxy-a55"), reviewers[2].id, 5, { comment: "Zo‘r telefon! Arzonroq kerak bo‘lsa +998 90 123 45 67 ga yozing, optom beraman." }, new Date(now - 2 * DAY), 300);
  await make(bySlug("xiaomi-redmi-buds-5"), reviewers[5].id, 4, { pros: "Ovozi yaxshi", comment: "Batafsil sharhim kanalimda: t.me/gadjet_sharh_uz" }, new Date(now - 1 * DAY), 200);
  await make(bySlug("lenovo-ideapad-slim-3"), reviewers[8].id, 1, { comment: "Sotuvchi ahmoq ekan, umuman javob bermaydi!!!!" }, new Date(now - 3 * DAY), 150);

  // Burst of 5★ from fresh accounts → fake-review fraud flag.
  const target = bySlug("apple-airpods-pro-2");
  const burst: string[] = [];
  for (let i = 0; i < 3; i++) {
    const u = await createUser({ login: `fresh_${i + 1}_${randomBytes(2).toString("hex")}`, name: `Yangi ${i + 1}`, password: pw() });
    await prisma.user.update({ where: { id: u.id }, data: { createdAt: new Date(now - (1 + i) * DAY) } });
    const order = await deliveredOrder(u.id, target.shopId, [{ productId: target.id, variantId: target.variants[0].id, title: target.titleUz, variantTitle: null, price: target.variants[0].price, image: null, commission: 0.08 }], new Date(now - 0.5 * DAY), { fulfillment: target.fulfillment });
    const r = await prisma.review.create({ data: { productId: target.id, orderId: order.id, userId: u.id, rating: 5, comment: "Eng zo‘r quloqchin, hammaga tavsiya qilaman!", displayName: `Yangi`, status: "PENDING", flags: i ? ["NEW_ACCOUNT_5STAR", "DUPLICATE", "BURST_5STAR"] : ["NEW_ACCOUNT_5STAR"], flagScore: i ? 85 : 15, lang: "uz", editableUntil: new Date(now + REVIEW_EDIT_DAYS * DAY), createdAt: new Date(now - (3 - i) * 3_600_000) } });
    await prisma.reviewModerationAction.create({ data: { reviewId: r.id, action: "AUTO_FLAG", reason: r.flags.join(",") } });
    burst.push(r.id);
  }
  await prisma.fraudFlag.upsert({
    where: { type_entityType_entityId: { type: "FAKE_REVIEW", entityType: "Product", entityId: target.id } },
    create: { type: "FAKE_REVIEW", entityType: "Product", entityId: target.id, shopId: target.shopId, score: 70, details: { reviews: burst } },
    update: {},
  });

  // An approved review with open user reports, and a seller removal request.
  const reported = await prisma.review.findFirst({ where: { status: "APPROVED", rating: { lte: 2 }, product: { shop: { slug: "techhub" } } }, orderBy: { createdAt: "desc" } });
  if (reported) {
    for (const u of reviewers.slice(10, 12)) if (u.id !== reported.userId) await prisma.reviewReport.create({ data: { reviewId: reported.id, userId: u.id, reason: "irrelevant", details: "Mahsulot haqida emas, yetkazish haqida" } });
  }
  const moda = products.filter((p) => p.shop.slug === "moda-bazar").map((p) => p.id);
  const removal = await prisma.review.findFirst({ where: { status: "APPROVED", productId: { in: moda }, rating: { lte: 3 } }, orderBy: { createdAt: "desc" } });
  if (removal) await prisma.reviewReport.create({ data: { reviewId: removal.id, userId: people.seller.id, source: "SELLER", reason: "extortion", details: "Xaridor chatda chegirma bermasak, salbiy sharh qoldirishini yozgan. Skrinshotlar chatda bor." } });

  // A question with a link waits in moderation.
  await prisma.question.create({ data: { productId: bySlug("apple-iphone-15").id, userId: reviewers[3].id, text: "Arzonini bilaman: www.arzon-iphone.uz — sizda nega qimmat?", status: "PENDING" } });
}

/** The demo buyer gets delivered orders to review (one already reviewed and still editable). */
async function seedDemoBuyer(products: P[], people: DemoAccounts) {
  const bySlug = (s: string) => products.find((p) => p.slug === s);
  const now = Date.now();
  const tech = [bySlug("apple-airpods-pro-2"), bySlug("xiaomi-redmi-buds-5")].filter(Boolean) as P[];
  if (tech.length) {
    await deliveredOrder(people.buyer.id, tech[0].shopId, tech.map((p) => ({ productId: p.id, variantId: p.variants[0].id, title: p.titleUz, variantTitle: p.variants[0].titleUz, price: p.variants[0].price, image: p.media[0]?.url ?? null, commission: 0.08 })), new Date(now - 2 * DAY), { fulfillment: "FBO", withEvents: true });
  }
  const fashion = products.find((p) => p.shop.slug === "moda-bazar");
  if (fashion) {
    const order = await deliveredOrder(people.buyer.id, fashion.shopId, [{ productId: fashion.id, variantId: fashion.variants[0].id, title: fashion.titleUz, variantTitle: fashion.variants[0].titleUz, price: fashion.variants[0].price, image: fashion.media[0]?.url ?? null, commission: 0.15 }], new Date(now - 6 * DAY), { fulfillment: fashion.fulfillment, withEvents: true });
    await prisma.review.create({ data: { productId: fashion.id, orderId: order.id, userId: people.buyer.id, variantId: fashion.variants[0].id, rating: 4, pros: "Mato sifatli, rangi rasmdagidek", cons: "O‘lchami biroz katta", comment: "Umuman yoqdi, lekin bir o‘lcham kichikroq olish kerak edi.", displayName: "Aziza", status: "APPROVED", flags: [], lang: "uz", editableUntil: new Date(now + 9 * DAY), createdAt: new Date(now - 5 * DAY) } });
  }
}
