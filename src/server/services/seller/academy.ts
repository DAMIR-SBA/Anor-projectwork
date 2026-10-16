import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/action";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { gradeQuiz, proEligibility } from "@/lib/seller";
import { latinToCyrillic } from "@/lib/translit";

type L = { uz: string; ru: string };
type Question = { q: L; options: L[]; answer: number };
type Course = { key: string; required: boolean; minutes: number; title: L; summary: L; lessons: Array<{ title: L; body: L }>; quiz: Question[] };

const tx = (o: L, locale: string) => (locale === "ru" ? o.ru : locale === "uz-Cyrl" ? latinToCyrillic(o.uz) : o.uz);

/** Course content lives on the server so quiz answers never reach the browser. */
const COURSES: Course[] = [
  {
    key: "basics",
    required: true,
    minutes: 15,
    title: { uz: "ANOR’da sotish asoslari", ru: "Основы продаж на ANOR" },
    summary: { uz: "Qoidalar, komissiya, to‘lovlar va reyting qanday ishlaydi.", ru: "Как устроены правила, комиссия, выплаты и рейтинг." },
    lessons: [
      {
        title: { uz: "Platforma qoidalari", ru: "Правила площадки" },
        body: {
          uz: "Faqat qonuniy, o‘zingizga tegishli yoki sotish huquqi bor tovarlarni joylang. Qalbaki, taqiqlangan va retsept talab qiladigan dori-darmonlar avtomatik moderatsiyaga tushadi. Xaridor bilan muloqot faqat ANOR chatida: telefon raqami va tashqi havolalar avtomatik yashiriladi.",
          ru: "Размещайте только законные товары, которые принадлежат вам или которые вы вправе продавать. Подделки, запрещённые товары и рецептурные лекарства автоматически уходят на модерацию. Общение с покупателем — только в чате ANOR: номера телефонов и внешние ссылки скрываются автоматически.",
        },
      },
      {
        title: { uz: "Komissiya va to‘lovlar", ru: "Комиссия и выплаты" },
        body: {
          uz: "Komissiya kategoriya bo‘yicha belgilanadi; Pro sotuvchilar uchun 2 foiz punkt past. Hisob-kitob haftalik: dushanbadan yakshanbagacha yetkazilgan buyurtmalar uchun pul chorshanba kuni hisobingizga o‘tkaziladi. Hisobotni Excel’da yuklab olishingiz mumkin.",
          ru: "Комиссия зависит от категории; для Pro-продавцов она на 2 п.п. ниже. Расчёт еженедельный: за заказы, доставленные с понедельника по воскресенье, деньги приходят на счёт в среду. Отчёт можно выгрузить в Excel.",
        },
      },
      {
        title: { uz: "Reyting", ru: "Рейтинг" },
        body: {
          uz: "Bajarish ko‘rsatkichi 90 kunlik ma’lumot asosida hisoblanadi: SLA (35%), sharhlar (35%), bekor qilishlar (20%) va qaytarishlar (10%). 80 dan past — ogohlantirish, 65 dan past — reklama to‘xtatiladi va qidiruvda pastroq ko‘rsatiladi.",
          ru: "Показатель исполнения считается по данным за 90 дней: SLA (35%), отзывы (35%), отмены (20%) и возвраты (10%). Ниже 80 — предупреждение, ниже 65 — реклама останавливается, а товары опускаются в поиске.",
        },
      },
    ],
    quiz: [
      { q: { uz: "Haftalik to‘lov qaysi kuni o‘tkaziladi?", ru: "В какой день приходит еженедельная выплата?" }, options: [{ uz: "Dushanba", ru: "Понедельник" }, { uz: "Chorshanba", ru: "Среда" }, { uz: "Juma", ru: "Пятница" }], answer: 1 },
      { q: { uz: "Xaridor telefon raqamini chatda so‘rasa nima qilasiz?", ru: "Покупатель просит номер телефона в чате. Что делать?" }, options: [{ uz: "Raqamni yuboraman", ru: "Отправлю номер" }, { uz: "Muloqotni ANOR chatida davom ettiraman", ru: "Продолжу общение в чате ANOR" }, { uz: "Telegram’ga taklif qilaman", ru: "Позову в Telegram" }], answer: 1 },
      { q: { uz: "Ko‘rsatkich 65 dan tushsa nima bo‘ladi?", ru: "Что происходит, если показатель ниже 65?" }, options: [{ uz: "Hech narsa", ru: "Ничего" }, { uz: "Faqat SMS keladi", ru: "Приходит только SMS" }, { uz: "Reklama to‘xtaydi, qidiruvda pastga tushadi", ru: "Реклама останавливается, товары ниже в поиске" }], answer: 2 },
      { q: { uz: "Reytingda eng katta ulushga ega omillar:", ru: "Наибольший вес в рейтинге имеют:" }, options: [{ uz: "SLA va sharhlar", ru: "SLA и отзывы" }, { uz: "Mahsulotlar soni", ru: "Количество товаров" }, { uz: "Reklama byudjeti", ru: "Рекламный бюджет" }], answer: 0 },
      { q: { uz: "Pro tarifda komissiya qanday?", ru: "Какая комиссия на тарифе Pro?" }, options: [{ uz: "O‘zgarmaydi", ru: "Не меняется" }, { uz: "2 foiz punkt past", ru: "На 2 п.п. ниже" }, { uz: "Ikki barobar past", ru: "В два раза ниже" }], answer: 1 },
    ],
  },
  {
    key: "fulfillment",
    required: true,
    minutes: 12,
    title: { uz: "Buyurtmalarni o‘z vaqtida topshirish", ru: "Своевременная отгрузка заказов" },
    summary: { uz: "FBO, FBS, DBS modellari, SLA va jarimalar.", ru: "Модели FBO, FBS, DBS, SLA и штрафы." },
    lessons: [
      {
        title: { uz: "Uch model", ru: "Три модели" },
        body: {
          uz: "FBO — tovar ANOR omborida saqlanadi va biz yig‘ib yetkazamiz; siz ta’minot (postavka) yuborasiz. FBS — tovar sizda, buyurtmani yig‘ib ANOR’ga topshirasiz. DBS — o‘zingiz yetkazasiz va xaridor kodini kiritib topshirishni tasdiqlaysiz.",
          ru: "FBO — товар хранится на складе ANOR, сборку и доставку делаем мы; вы отправляете поставку. FBS — товар у вас, вы собираете заказ и передаёте его ANOR. DBS — доставляете сами и подтверждаете вручение кодом покупателя.",
        },
      },
      {
        title: { uz: "SLA va jarimalar", ru: "SLA и штрафы" },
        body: {
          uz: "FBS buyurtmasi tasdiqlangandan keyin 24 soat ichida topshirilishi kerak. Kechikish uchun jarima — buyurtma summasining 2%, kamida 10 000 so‘m. Sotuvchi tomonidan bekor qilish reytingga eng kuchli ta’sir qiladi: qoldiqlarni doim yangilab boring.",
          ru: "Заказ FBS нужно передать в течение 24 часов после подтверждения. Штраф за опоздание — 2% суммы заказа, минимум 10 000 сум. Отмена продавцом сильнее всего бьёт по рейтингу: держите остатки актуальными.",
        },
      },
      {
        title: { uz: "Qaytarishlar", ru: "Возвраты" },
        body: {
          uz: "Qaytarish so‘roviga 72 soat ichida javob bering — aks holda u avtomatik tasdiqlanadi. Rozi bo‘lmasangiz, dalillar (foto, video) bilan nizo oching; yakuniy qarorni ANOR moderatori chiqaradi.",
          ru: "Отвечайте на заявку на возврат в течение 72 часов — иначе она одобряется автоматически. Если не согласны, откройте спор с доказательствами (фото, видео); окончательное решение принимает модератор ANOR.",
        },
      },
    ],
    quiz: [
      { q: { uz: "FBS buyurtmasini qancha vaqtda topshirish kerak?", ru: "За какое время нужно передать заказ FBS?" }, options: [{ uz: "24 soat", ru: "24 часа" }, { uz: "3 kun", ru: "3 дня" }, { uz: "1 hafta", ru: "1 неделя" }], answer: 0 },
      { q: { uz: "Qaysi modelda tovar ANOR omborida saqlanadi?", ru: "При какой модели товар хранится на складе ANOR?" }, options: [{ uz: "FBS", ru: "FBS" }, { uz: "DBS", ru: "DBS" }, { uz: "FBO", ru: "FBO" }], answer: 2 },
      { q: { uz: "DBS’da topshirish qanday tasdiqlanadi?", ru: "Как подтверждается вручение при DBS?" }, options: [{ uz: "Xaridor kodi bilan", ru: "Кодом покупателя" }, { uz: "Qo‘ng‘iroq bilan", ru: "Звонком" }, { uz: "Tasdiqlash shart emas", ru: "Подтверждать не нужно" }], answer: 0 },
      { q: { uz: "Qaytarish so‘roviga 72 soatda javob bermasangiz:", ru: "Если не ответить на возврат за 72 часа:" }, options: [{ uz: "Rad etiladi", ru: "Он отклоняется" }, { uz: "Avtomatik tasdiqlanadi", ru: "Он одобряется автоматически" }, { uz: "Kutib turadi", ru: "Он ждёт дальше" }], answer: 1 },
      { q: { uz: "Kechikkan topshirish uchun minimal jarima:", ru: "Минимальный штраф за опоздание с передачей:" }, options: [{ uz: "5 000 so‘m", ru: "5 000 сум" }, { uz: "10 000 so‘m", ru: "10 000 сум" }, { uz: "50 000 so‘m", ru: "50 000 сум" }], answer: 1 },
    ],
  },
  {
    key: "content",
    required: false,
    minutes: 10,
    title: { uz: "Sotadigan mahsulot kartochkasi", ru: "Карточка товара, которая продаёт" },
    summary: { uz: "Rasm, nom, xususiyatlar va A/B test.", ru: "Фото, название, характеристики и A/B-тест." },
    lessons: [
      {
        title: { uz: "Rasmlar", ru: "Фотографии" },
        body: {
          uz: "Birinchi rasm — muqova: oq yoki neytral fon, tovar kadrning 80% qismida. Kamida 4 ta rasm qo‘shing: umumiy ko‘rinish, detallar, o‘lcham va qadoq. Matnli yoki suv belgili rasmlar CTR’ni pasaytiradi.",
          ru: "Первое фото — обложка: белый или нейтральный фон, товар занимает 80% кадра. Добавьте минимум 4 фото: общий вид, детали, размер и упаковку. Фото с текстом и водяными знаками снижают CTR.",
        },
      },
      {
        title: { uz: "Nom va xususiyatlar", ru: "Название и характеристики" },
        body: {
          uz: "Nom formulasi: tur + brend + model + asosiy xususiyat (masalan, «Smartfon Samsung Galaxy A15, 128 GB, qora»). Filtrlarda topilishi uchun barcha xususiyatlarni to‘ldiring. Pro tarifda nom va muqovani A/B test qilish mumkin.",
          ru: "Формула названия: тип + бренд + модель + ключевая характеристика (например, «Смартфон Samsung Galaxy A15, 128 ГБ, чёрный»). Заполняйте все характеристики, чтобы товар находился в фильтрах. На тарифе Pro можно A/B-тестировать название и обложку.",
        },
      },
    ],
    quiz: [
      { q: { uz: "Muqova rasmi uchun eng yaxshi fon:", ru: "Лучший фон для обложки:" }, options: [{ uz: "Yorqin naqshli", ru: "Яркий с узором" }, { uz: "Oq yoki neytral", ru: "Белый или нейтральный" }, { uz: "Matnli banner", ru: "Баннер с текстом" }], answer: 1 },
      { q: { uz: "Kartochkada kamida nechta rasm tavsiya etiladi?", ru: "Сколько фото рекомендуется минимум?" }, options: [{ uz: "1", ru: "1" }, { uz: "2", ru: "2" }, { uz: "4", ru: "4" }], answer: 2 },
      { q: { uz: "Xususiyatlarni to‘ldirish nima beradi?", ru: "Что даёт заполнение характеристик?" }, options: [{ uz: "Filtrlarda topiladi", ru: "Товар находится в фильтрах" }, { uz: "Komissiya kamayadi", ru: "Снижается комиссия" }, { uz: "Hech narsa", ru: "Ничего" }], answer: 0 },
      { q: { uz: "A/B testda nimani solishtirish mumkin?", ru: "Что можно сравнить в A/B-тесте?" }, options: [{ uz: "Narxni", ru: "Цену" }, { uz: "Nom yoki muqovani", ru: "Название или обложку" }, { uz: "Yetkazish vaqtini", ru: "Срок доставки" }], answer: 1 },
    ],
  },
  {
    key: "ads",
    required: false,
    minutes: 10,
    title: { uz: "Reklama va aksiyalar", ru: "Реклама и акции" },
    summary: { uz: "CPC va CPM, ROAS, aksiyalarda qatnashish.", ru: "CPC и CPM, ROAS, участие в акциях." },
    lessons: [
      {
        title: { uz: "To‘lov modellari", ru: "Модели оплаты" },
        body: {
          uz: "CPC — har bir bosish uchun to‘laysiz (kamida 300 so‘m), CPM — har 1000 ko‘rsatish uchun (kamida 10 000 so‘m). Kunlik byudjet kamida 20 000 so‘m; limit tugasa, e’lon ertasigacha to‘xtaydi. O‘rin taklif va sifat (CTR, reyting) bo‘yicha belgilanadi.",
          ru: "CPC — оплата за клик (от 300 сум), CPM — за 1000 показов (от 10 000 сум). Дневной бюджет от 20 000 сум; когда лимит исчерпан, показ останавливается до следующего дня. Позиция зависит от ставки и качества (CTR, рейтинг).",
        },
      },
      {
        title: { uz: "Samaradorlik", ru: "Эффективность" },
        body: {
          uz: "ROAS = reklamadan tushum / xarajat. ACOS = xarajat / tushum. Buyurtma bosishdan keyin 7 kun ichida bo‘lsa, kampaniyaga yoziladi. Aksiyalarda qatnashish uchun minimal chegirma talab qilinadi — narxni sun’iy oshirib chegirma qilish taqiqlanadi.",
          ru: "ROAS = выручка от рекламы / расходы. ACOS = расходы / выручка. Заказ засчитывается кампании, если он сделан в течение 7 дней после клика. Для участия в акциях нужна минимальная скидка — завышать цену ради скидки запрещено.",
        },
      },
    ],
    quiz: [
      { q: { uz: "CPC modelida nima uchun to‘laysiz?", ru: "За что вы платите в модели CPC?" }, options: [{ uz: "Ko‘rsatish uchun", ru: "За показы" }, { uz: "Bosish uchun", ru: "За клики" }, { uz: "Buyurtma uchun", ru: "За заказы" }], answer: 1 },
      { q: { uz: "ROAS qanday hisoblanadi?", ru: "Как считается ROAS?" }, options: [{ uz: "Tushum / xarajat", ru: "Выручка / расходы" }, { uz: "Xarajat / tushum", ru: "Расходы / выручка" }, { uz: "Bosish / ko‘rsatish", ru: "Клики / показы" }], answer: 0 },
      { q: { uz: "Bosishdan keyin qancha vaqt ichidagi buyurtma kampaniyaga yoziladi?", ru: "Заказ в течение какого срока после клика засчитывается кампании?" }, options: [{ uz: "1 kun", ru: "1 день" }, { uz: "7 kun", ru: "7 дней" }, { uz: "30 kun", ru: "30 дней" }], answer: 1 },
      { q: { uz: "Kunlik byudjet tugasa nima bo‘ladi?", ru: "Что будет, когда дневной бюджет закончится?" }, options: [{ uz: "Qarzga ko‘rsatiladi", ru: "Показ продолжится в долг" }, { uz: "Ertasigacha to‘xtaydi", ru: "Показ остановится до завтра" }, { uz: "Kampaniya o‘chiriladi", ru: "Кампания удалится" }], answer: 1 },
    ],
  },
];

export const REQUIRED_COURSES = COURSES.filter((c) => c.required).map((c) => c.key);

export async function academyOverview(shopId: string, locale: string) {
  const certs = await db.sellerCertification.findMany({ where: { shopId }, orderBy: { createdAt: "desc" } });
  return COURSES.map((c) => {
    const attempts = certs.filter((x) => x.courseKey === c.key);
    const best = attempts.reduce<number | null>((m, x) => (m === null || x.score > m ? x.score : m), null);
    return {
      key: c.key,
      required: c.required,
      minutes: c.minutes,
      title: tx(c.title, locale),
      summary: tx(c.summary, locale),
      lessons: c.lessons.map((l) => ({ title: tx(l.title, locale), body: tx(l.body, locale) })),
      // Questions and options only — answers stay here.
      quiz: c.quiz.map((q) => ({ q: tx(q.q, locale), options: q.options.map((o) => tx(o, locale)) })),
      passed: attempts.some((x) => x.passed),
      best,
      attempts: attempts.length,
      passedAt: attempts.find((x) => x.passed)?.createdAt.toISOString() ?? null,
    };
  });
}

export async function submitQuiz(shopId: string, courseKey: string, answers: Array<number | null>) {
  const course = COURSES.find((c) => c.key === courseKey);
  if (!course || answers.length !== course.quiz.length) throw new AppError("invalidInput");
  const result = gradeQuiz(
    course.quiz.map((q) => q.answer),
    answers,
  );
  await db.sellerCertification.create({ data: { shopId, courseKey, score: result.score, passed: result.passed } });
  // Per-question feedback without revealing the right option for wrong answers.
  return { ...result, correct: course.quiz.map((q, i) => answers[i] === q.answer) };
}

export async function tierStatus(shopId: string) {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [shop, orders90d, passed] = await Promise.all([
    db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { tier: true, tierSince: true, fulfillmentScore: true, approvedAt: true, kycLevel: true, restrictedAt: true } }),
    db.order.count({ where: { shopId, createdAt: { gte: since }, status: { in: ["DELIVERED", "SHIPPED", "PACKED", "CONFIRMED"] } } }),
    db.sellerCertification.findMany({ where: { shopId, passed: true, courseKey: { in: REQUIRED_COURSES } }, select: { courseKey: true }, distinct: ["courseKey"] }),
  ]);
  const certified = REQUIRED_COURSES.every((k) => passed.some((p) => p.courseKey === k));
  const e = proEligibility({ score: shop.fulfillmentScore, approvedAt: shop.approvedAt, orders90d, kycLevel: shop.kycLevel, certified, restricted: !!shop.restrictedAt }, new Date());
  return { tier: shop.tier, tierSince: shop.tierSince?.toISOString() ?? null, score: shop.fulfillmentScore, orders90d, kycLevel: shop.kycLevel, ...e };
}

export async function upgradeToPro(shopId: string, actor: { userId: string; login: string }) {
  const s = await tierStatus(shopId);
  if (s.tier === "PRO") return s;
  if (!s.eligible) throw new AppError("proNotEligible");
  await db.shop.update({ where: { id: shopId }, data: { tier: "PRO", tierSince: new Date() } });
  await audit({ actorId: actor.userId, actorLogin: actor.login, actorKind: "seller", action: "shop.tier_pro", entityType: "Shop", entityId: shopId, before: { tier: "BASIC" }, after: { tier: "PRO" } });
  await notify({ userId: actor.userId, type: "seller.tier", title: "Pro tarif yoqildi", body: "Past komissiya, A/B testlar va raqobatchilar narxlari endi mavjud.", href: "/seller/academy" });
  return { ...s, tier: "PRO" as const };
}
