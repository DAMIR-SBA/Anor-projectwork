// Demo data for chat + support: help center, canned replies, tickets in every state,
// buyer↔seller threads (with a masked contact and a report) and a past broadcast.
import { prisma } from "./client";
import type { DemoAccounts } from "./rbac";

const MIN = 60_000;

const HELP: Array<{ slug: string; section: string; sort: number; titleUz: string; titleRu: string; bodyUz: string; bodyRu: string }> = [
  {
    slug: "how-to-order", section: "buyers", sort: 1,
    titleUz: "Qanday buyurtma beriladi", titleRu: "Как оформить заказ",
    bodyUz: "ANOR’da buyurtma berish bir necha daqiqa oladi.\n\n1. Mahsulotni toping va variantini tanlang.\n2. «Savatga» tugmasini bosing.\n3. Savatda mahsulotlarni belgilang va «Rasmiylashtirish»ni bosing.\n4. Yetkazish usuli va to‘lovni tanlang.\n\nBuyurtma holatini **Buyurtmalarim** bo‘limida kuzatasiz, har bosqichda xabar keladi.",
    bodyRu: "Оформление заказа на ANOR занимает пару минут.\n\n1. Найдите товар и выберите вариант.\n2. Нажмите «В корзину».\n3. Отметьте товары в корзине и нажмите «Оформить».\n4. Выберите способ доставки и оплату.\n\nСтатус заказа виден в разделе **Мои заказы**, о каждом этапе приходит уведомление.",
  },
  {
    slug: "delivery", section: "buyers", sort: 2,
    titleUz: "Yetkazib berish muddatlari va narxi", titleRu: "Сроки и стоимость доставки",
    bodyUz: "## Muddatlar\n\n- Toshkent: ANOR omboridagi mahsulotlar 14:00 gacha buyurtma qilinsa — shu kuni\n- Viloyat markazlari: 1–3 kun\n- Tumanlar: 2–5 kun\n\n## Narxi\n\n200 000 so‘mdan ortiq buyurtmalar topshirish punktiga bepul yetkaziladi. Kuryer va ekspress yetkazish narxi rasmiylashtirishda ko‘rsatiladi.",
    bodyRu: "## Сроки\n\n- Ташкент: товары со склада ANOR при заказе до 14:00 — в тот же день\n- Областные центры: 1–3 дня\n- Районы: 2–5 дней\n\n## Стоимость\n\nЗаказы от 200 000 сум доставляются в пункт выдачи бесплатно. Стоимость курьерской и экспресс-доставки видна при оформлении.",
  },
  {
    slug: "pickup-points", section: "buyers", sort: 3,
    titleUz: "Topshirish punktlari (PVZ)", titleRu: "Пункты выдачи (ПВЗ)",
    bodyUz: "Buyurtma punktga kelganda SMS va bildirishnoma olasiz. Mahsulot **5 kun** saqlanadi.\n\n- Olish uchun 4 xonali kod yoki QR’ni ko‘rsating\n- Mahsulotni joyida tekshirib, kerak bo‘lsa qaytarishingiz mumkin\n- Muddat tugasa, buyurtma qaytariladi va pul avtomatik qaytadi",
    bodyRu: "Когда заказ прибудет в пункт, придёт SMS и уведомление. Товар хранится **5 дней**.\n\n- Для получения покажите 4-значный код или QR\n- Товар можно проверить на месте и при необходимости вернуть\n- По истечении срока заказ возвращается, деньги возвращаются автоматически",
  },
  {
    slug: "payment", section: "buyers", sort: 4,
    titleUz: "To‘lov usullari", titleRu: "Способы оплаты",
    bodyUz: "ANOR’da quyidagilar orqali to‘lash mumkin:\n\n- Click, Payme\n- Uzcard, Humo, Visa / Mastercard\n- Anor Hamyon balansi va bonuslar (buyurtmaning 30% gacha)\n- ANOR NASIYA — muddatli to‘lov\n- Qabul qilganda naqd yoki karta orqali\n\nKarta ma’lumotlari ANOR’da saqlanmaydi — to‘lov tizimi tokenidan foydalaniladi.",
    bodyRu: "Оплатить на ANOR можно:\n\n- Click, Payme\n- Uzcard, Humo, Visa / Mastercard\n- Балансом Anor Hamyon и бонусами (до 30% заказа)\n- ANOR NASIYA — рассрочка\n- Наличными или картой при получении\n\nДанные карт не хранятся на ANOR — используется токен платёжной системы.",
  },
  {
    slug: "returns", section: "buyers", sort: 5,
    titleUz: "Qaytarish va pulni qaytarib olish", titleRu: "Возврат товара и денег",
    bodyUz: "Mahsulotni olgan kundan boshlab **14 kun** ichida qaytarish mumkin.\n\n1. Buyurtmalarim → buyurtma → «Qaytarish».\n2. Sababni tanlang va rasm biriktiring.\n3. Mahsulotni topshirish punktiga olib boring yoki kuryerni chaqiring.\n\nPul to‘lov usuliga qarab 1–5 ish kunida qaytadi; Anor Hamyonga — darhol.",
    bodyRu: "Вернуть товар можно в течение **14 дней** с момента получения.\n\n1. Мои заказы → заказ → «Возврат».\n2. Выберите причину и приложите фото.\n3. Отнесите товар в пункт выдачи или вызовите курьера.\n\nДеньги возвращаются за 1–5 рабочих дней в зависимости от способа оплаты; на Anor Hamyon — сразу.",
  },
  {
    slug: "cancel-order", section: "buyers", sort: 6,
    titleUz: "Buyurtmani bekor qilish", titleRu: "Отмена заказа",
    bodyUz: "Buyurtma jo‘natilmaguncha uni o‘zingiz bekor qilishingiz mumkin: Buyurtmalarim → buyurtma → «Bekor qilish». To‘langan summa avtomatik qaytariladi.",
    bodyRu: "Пока заказ не отправлен, его можно отменить самостоятельно: Мои заказы → заказ → «Отменить». Оплаченная сумма вернётся автоматически.",
  },
  {
    slug: "promo-codes", section: "buyers", sort: 7,
    titleUz: "Promo-kodlar", titleRu: "Промокоды",
    bodyUz: "Promo-kodni savatda kiriting. Agar kod qo‘llanmasa, sababi ko‘rsatiladi: muddati o‘tgan, minimal summa yetmaydi yoki kod boshqa toifaga tegishli.\n\nBir buyurtmada bitta promo-kod ishlatiladi.",
    bodyRu: "Введите промокод в корзине. Если код не применился, мы покажем причину: истёк срок, не хватает минимальной суммы или код для другой категории.\n\nВ одном заказе можно использовать один промокод.",
  },
  {
    slug: "nasiya", section: "buyers", sort: 8,
    titleUz: "ANOR NASIYA — muddatli to‘lov", titleRu: "ANOR NASIYA — рассрочка",
    bodyUz: "3, 6, 9 yoki 12 oyga boshlang‘ich to‘lovsiz xarid qiling. Qaror bir daqiqada chiqadi.\n\n- Ustama oldindan ko‘rsatiladi\n- To‘lov jadvali shaxsiy kabinetda\n- Muddatidan oldin to‘lasangiz, ustama qayta hisoblanadi",
    bodyRu: "Покупайте без первоначального взноса на 3, 6, 9 или 12 месяцев. Решение — за минуту.\n\n- Наценка видна заранее\n- График платежей в личном кабинете\n- При досрочном погашении наценка пересчитывается",
  },
  {
    slug: "sellers", section: "sellers", sort: 1,
    titleUz: "ANOR’da qanday sotiladi", titleRu: "Как продавать на ANOR",
    bodyUz: "1. Do‘kon oching va hujjatlarni yuklang (YaTT, MChJ yoki o‘zini o‘zi band qilgan).\n2. Mahsulotlarni qo‘shing yoki Excel orqali yuklang.\n3. Ishlash modelini tanlang: **FBO** (ANOR omborida), **FBS** (o‘z omboringizdan, ANOR yetkazadi) yoki **DBS** (o‘zingiz yetkazasiz).\n\nTo‘lovlar haftada bir marta hisobingizga o‘tkaziladi.",
    bodyRu: "1. Откройте магазин и загрузите документы (ИП, ООО или самозанятый).\n2. Добавьте товары вручную или через Excel.\n3. Выберите модель: **FBO** (склад ANOR), **FBS** (ваш склад, доставляет ANOR) или **DBS** (доставляете сами).\n\nВыплаты поступают на счёт раз в неделю.",
  },
  {
    slug: "seller-sla", section: "sellers", sort: 2,
    titleUz: "FBS: topshirish muddati va jarimalar", titleRu: "FBS: срок передачи и штрафы",
    bodyUz: "FBS buyurtmalarni **24 soat** ichida ANOR’ga topshirish kerak. Kechiktirilsa, buyurtma summasining 2% (kamida 10 000 so‘m) jarima qo‘llanadi va reyting pasayadi.",
    bodyRu: "Заказы FBS нужно передать ANOR в течение **24 часов**. За просрочку — штраф 2% от суммы заказа (не менее 10 000 сум) и снижение рейтинга.",
  },
  {
    slug: "about", section: "company", sort: 1,
    titleUz: "ANOR haqida", titleRu: "Об ANOR",
    bodyUz: "ANOR — O‘zbekistondagi ko‘p sotuvchili marketpleys: elektronikadan tortib hunarmandlar mahsulotlarigacha. Bizning maqsadimiz — xarid qilishni sodda, xavfsiz va tez qilish.",
    bodyRu: "ANOR — мультивендорный маркетплейс Узбекистана: от электроники до изделий ремесленников. Наша цель — сделать покупки простыми, безопасными и быстрыми.",
  },
];

const CANNED = [
  { shortcut: "salom", title: "Salomlashish", textUz: "Assalomu alaykum! ANOR Yordam xizmati. Qanday yordam bera olaman?", textRu: "Здравствуйте! Поддержка ANOR. Чем могу помочь?" },
  { shortcut: "raqam", title: "Buyurtma raqamini so‘rash", textUz: "Iltimos, buyurtma raqamini yozing — tekshirib beraman.", textRu: "Пожалуйста, напишите номер заказа — я проверю." },
  { shortcut: "qaytarish", title: "Qaytarish tartibi", textUz: "Qaytarish uchun: Buyurtmalarim → buyurtma → «Qaytarish». 14 kun ichida rasmiylashtirish mumkin.", textRu: "Для возврата: Мои заказы → заказ → «Возврат». Оформить можно в течение 14 дней." },
  { shortcut: "kechikish", title: "Yetkazish kechikishi", textUz: "Kechikish uchun uzr so‘raymiz! Kuryer xizmati bilan bog‘landim, buyurtmangiz bugun yetkaziladi.", textRu: "Приносим извинения за задержку! Я связался со службой доставки, заказ привезут сегодня." },
  { shortcut: "rahmat", title: "Yakunlash", textUz: "Murojaatingiz uchun rahmat! Yana savol bo‘lsa, shu yerga yozing.", textRu: "Спасибо за обращение! Если появятся вопросы, пишите сюда." },
];

type Msg = { from: string | null; text?: string; at: number; kind?: "TEXT" | "SYSTEM" | "PRODUCT"; payload?: object; source?: "WEB" | "BOT" | "SYSTEM"; masked?: boolean; flagged?: boolean };

async function thread(type: "SUPPORT" | "SELLER_SUPPORT" | "BUYER_SELLER", members: Array<{ userId: string; role: "CUSTOMER" | "SELLER" | "AGENT"; readUpTo?: number }>, msgs: Msg[], extra: { shopId?: string; productId?: string } = {}) {
  const now = Date.now();
  const last = msgs[msgs.length - 1];
  const conv = await prisma.conversation.create({
    data: {
      type,
      shopId: extra.shopId,
      productId: extra.productId,
      lastMessageAt: new Date(now - last.at),
      lastMessagePreview: last.text?.slice(0, 120) ?? null,
      createdAt: new Date(now - msgs[0].at),
      members: {
        create: members.map((m) => {
          const readAt = m.readUpTo === undefined ? now - last.at : now - m.readUpTo;
          const unread = msgs.filter((x) => x.from && x.from !== m.userId && now - x.at > readAt && x.kind !== "SYSTEM").length;
          return { userId: m.userId, role: m.role, lastReadAt: new Date(readAt), lastDeliveredAt: new Date(now - last.at), unreadCount: unread, isPinned: type !== "BUYER_SELLER" && m.role === "CUSTOMER" };
        }),
      },
    },
  });
  const ids: string[] = [];
  for (const m of msgs) {
    const row = await prisma.message.create({
      data: { conversationId: conv.id, senderId: m.from, kind: m.kind ?? "TEXT", text: m.text ?? null, payload: m.payload, source: m.source ?? (m.from ? "WEB" : "SYSTEM"), masked: !!m.masked, flagged: !!m.flagged, createdAt: new Date(now - m.at) },
    });
    ids.push(row.id);
  }
  return { id: conv.id, messageIds: ids };
}

export async function seedSupport(people: DemoAccounts) {
  for (const a of HELP) await prisma.helpArticle.upsert({ where: { slug: a.slug }, create: a, update: {} });
  for (const c of CANNED) await prisma.cannedReply.upsert({ where: { shortcut: c.shortcut }, create: c, update: {} });
  if ((await prisma.conversation.count()) > 0) {
    console.log("  support: help center ready (threads already seeded)");
    return;
  }
  const agent = await prisma.user.findUnique({ where: { login: "demo_support" } });
  const admin = await prisma.user.findUnique({ where: { login: "demo_super_admin" } });
  if (!agent) return;
  const [b1, b2, b3, b4, b5, b6] = people.extraBuyers;
  const now = Date.now();
  const welcome = (at: number): Msg => ({ from: null, kind: "SYSTEM", source: "BOT", at, payload: { key: "support.welcome", values: { minutes: 15 } } });
  const order = await prisma.order.findFirst({ where: { userId: people.buyer.id, status: "DELIVERED" }, orderBy: { createdAt: "desc" } });

  // 1. Demo buyer: in progress, agent replied, customer answered last.
  const t1 = await thread("SUPPORT", [{ userId: people.buyer.id, role: "CUSTOMER" }, { userId: agent.id, role: "AGENT", readUpTo: 6 * MIN }], [
    welcome(48 * MIN),
    { from: people.buyer.id, text: `Salom! №${order?.number ?? "—"} buyurtmamdagi quloqchin qutisida zaryadlovchi kabel yo‘q ekan.`, at: 47 * MIN },
    { from: null, kind: "SYSTEM", source: "BOT", at: 46.9 * MIN, payload: { key: "bot.suggest", values: { articles: [{ slug: "returns", titleUz: "Qaytarish va pulni qaytarib olish", titleRu: "Возврат товара и денег" }] } } },
    { from: agent.id, text: "Assalomu alaykum, Aziza! Uzr so‘raymiz. Qutining rasmini yubora olasizmi? Sotuvchi bilan tekshiramiz.", at: 40 * MIN },
    { from: people.buyer.id, text: "Albatta, hozir yuboraman. Kabelni alohida yuborishsa ham bo‘ladi.", at: 5 * MIN },
  ]);
  await prisma.ticket.create({ data: { conversationId: t1.id, customerId: people.buyer.id, assigneeId: agent.id, status: "IN_PROGRESS", priority: "NORMAL", tags: ["komplekt"], subject: "Qutida zaryadlovchi kabel yo‘q", slaDueAt: new Date(now - 32 * MIN), firstResponseAt: new Date(now - 40 * MIN), createdAt: new Date(now - 47 * MIN) } });
  await prisma.ticketNote.create({ data: { ticketId: (await prisma.ticket.findUniqueOrThrow({ where: { conversationId: t1.id } })).id, authorId: agent.id, text: "TechHub’ga yozdim, kabel ertaga kuryer bilan yuboriladi.", createdAt: new Date(now - 30 * MIN) } });

  // 2. New ticket, SLA almost due.
  const t2 = await thread("SUPPORT", [{ userId: b1.id, role: "CUSTOMER" }], [welcome(11 * MIN), { from: b1.id, text: "XUSH50 promo-kodi ishlamayapti, «minimal summa» deyapti. Savatda 320 000 so‘mlik mahsulot bor.", at: 10 * MIN }]);
  await prisma.ticket.create({ data: { conversationId: t2.id, customerId: b1.id, subject: "XUSH50 promo-kodi ishlamayapti", slaDueAt: new Date(now + 5 * MIN), createdAt: new Date(now - 10 * MIN) } });

  // 3. Breached SLA, unassigned.
  const t3 = await thread("SUPPORT", [{ userId: b2.id, role: "CUSTOMER" }], [welcome(41 * MIN), { from: b2.id, text: "Kuryer kelmadi, bugun 12:00–14:00 oralig‘ini tanlagan edim. Buyurtma qayerda?", at: 40 * MIN }, { from: b2.id, text: "Iltimos, tezroq javob bering 🙏", at: 20 * MIN }]);
  await prisma.ticket.create({ data: { conversationId: t3.id, customerId: b2.id, subject: "Kuryer kelmadi", priority: "HIGH", tags: ["yetkazish"], slaDueAt: new Date(now - 25 * MIN), createdAt: new Date(now - 40 * MIN) } });

  // 4. Waiting for the customer (Russian).
  const t4 = await thread("SUPPORT", [{ userId: b3.id, role: "CUSTOMER" }, { userId: agent.id, role: "AGENT" }], [
    welcome(26 * 60 * MIN),
    { from: b3.id, text: "Здравствуйте, можно поменять адрес доставки?", at: 26 * 60 * MIN },
    { from: agent.id, text: "Здравствуйте! Да, напишите, пожалуйста, новый адрес и номер заказа.", at: 25.8 * 60 * MIN },
    { from: null, kind: "SYSTEM", at: 25.7 * 60 * MIN, payload: { key: "support.waiting" } },
  ]);
  await prisma.ticket.create({ data: { conversationId: t4.id, customerId: b3.id, assigneeId: agent.id, status: "WAITING_CUSTOMER", subject: "Поменять адрес доставки", slaDueAt: new Date(now - 25.75 * 60 * MIN), firstResponseAt: new Date(now - 25.8 * 60 * MIN), createdAt: new Date(now - 26 * 60 * MIN) } });

  // 5. Resolved yesterday.
  const t5 = await thread("SUPPORT", [{ userId: b4.id, role: "CUSTOMER" }, { userId: agent.id, role: "AGENT" }], [
    welcome(30 * 60 * MIN),
    { from: b4.id, text: "Qaytarish arizasi qachon ko‘rib chiqiladi?", at: 30 * 60 * MIN },
    { from: agent.id, text: "Arizangiz tasdiqlandi, pul Anor Hamyonga qaytarildi.", at: 29.9 * 60 * MIN },
    { from: b4.id, text: "Rahmat! 👍", at: 29.5 * 60 * MIN },
    { from: null, kind: "SYSTEM", at: 29 * 60 * MIN, payload: { key: "support.resolved", values: { number: 0 } } },
  ]);
  const r5 = await prisma.ticket.create({ data: { conversationId: t5.id, customerId: b4.id, assigneeId: agent.id, status: "RESOLVED", subject: "Qaytarish arizasi", slaDueAt: new Date(now - 29.75 * 60 * MIN), firstResponseAt: new Date(now - 29.9 * 60 * MIN), resolvedAt: new Date(now - 29 * 60 * MIN), createdAt: new Date(now - 30 * 60 * MIN) } });
  await prisma.message.updateMany({ where: { conversationId: t5.id, kind: "SYSTEM", payload: { path: ["key"], equals: "support.resolved" } }, data: { payload: { key: "support.resolved", values: { number: r5.number } } } });

  // 6. Seller ↔ support about a payout (high priority).
  const t6 = await thread("SELLER_SUPPORT", [{ userId: people.seller.id, role: "CUSTOMER" }], [{ from: null, kind: "SYSTEM", source: "BOT", at: 90 * MIN, payload: { key: "support.sellerWelcome", values: { minutes: 15 } } }, { from: people.seller.id, text: "Haftalik to‘lov hali kelmadi. Bank rekvizitlarini yangilagan edim — shunga bog‘liqmi?", at: 90 * MIN }]);
  await prisma.ticket.create({ data: { conversationId: t6.id, customerId: people.seller.id, priority: "HIGH", tags: ["to‘lov"], subject: "Haftalik to‘lov kelmadi", slaDueAt: new Date(now - 75 * MIN), createdAt: new Date(now - 90 * MIN) } });

  // Buyer ↔ seller threads.
  const shops = await prisma.shop.findMany({ select: { id: true, slug: true, ownerId: true } });
  const techhub = shops.find((s) => s.slug === "techhub")!;
  const moda = shops.find((s) => s.slug === "moda-bazar")!;
  const pods = await prisma.product.findUnique({ where: { slug: "apple-airpods-pro-2" }, include: { media: { take: 1 } } });
  if (pods) {
    await thread("BUYER_SELLER", [{ userId: people.buyer.id, role: "CUSTOMER", readUpTo: 4 * 60 * MIN }, { userId: techhub.ownerId, role: "SELLER" }], [
      { from: people.buyer.id, kind: "PRODUCT", at: 5 * 60 * MIN, payload: { id: pods.id, slug: pods.slug, title: pods.titleUz, titleRu: pods.titleRu, price: pods.price, imageUrl: pods.media[0]?.url ?? null } },
      { from: people.buyer.id, text: "Assalomu alaykum! Bu original USB-C versiyami? Kafolat qancha?", at: 5 * 60 * MIN },
      { from: techhub.ownerId, text: "Va alaykum assalom! Ha, original, USB-C. Rasmiy kafolat 1 yil, seriya raqamini Apple saytida tekshirishingiz mumkin.", at: 4.5 * 60 * MIN },
      { from: techhub.ownerId, text: "Bugun buyurtma qilsangiz, ertaga yetkazamiz 🚚", at: 3 * 60 * MIN },
    ], { shopId: techhub.id, productId: pods.id });
  }
  const shirt = await prisma.product.findFirst({ where: { shopId: moda.id }, include: { media: { take: 1 } } });
  const t8 = await thread("BUYER_SELLER", [{ userId: b5.id, role: "CUSTOMER" }, { userId: moda.ownerId, role: "SELLER", readUpTo: 50 * MIN }], [
    { from: b5.id, text: "Salom, L o‘lcham bormi? Telegramdan yozing •••", at: 60 * MIN, masked: true },
    { from: moda.ownerId, text: "Salom! L o‘lcham bor. Iltimos, savollarni shu chatda bering — xavfsizroq.", at: 55 * MIN },
    { from: b5.id, text: "Narxini tushiring, bo‘lmasa sharhda ******* deb yozaman!!!", at: 52 * MIN, flagged: true },
    { from: b5.id, text: "Javob bering", at: 45 * MIN },
  ], { shopId: moda.id, productId: shirt?.id });
  await prisma.chatReport.create({ data: { messageId: t8.messageIds[2], reporterId: moda.ownerId, reason: "fraud", createdAt: new Date(now - 50 * MIN) } });
  const t9 = await thread("BUYER_SELLER", [{ userId: b6.id, role: "CUSTOMER" }, { userId: moda.ownerId, role: "SELLER", readUpTo: 3 * 60 * MIN }], [{ from: b6.id, text: "Ko‘ylak ertagacha yetib keladimi? To‘yga kerak edi 🙂", at: 2 * 60 * MIN }], { shopId: moda.id });
  void t9;

  if (admin) await prisma.broadcast.create({ data: { authorId: admin.id, segment: "ALL", title: "Mustaqillik bayrami chegirmalari", body: "1–3 sentabr kunlari 5 000 dan ortiq mahsulotga 50% gacha chegirma. Omad!", href: "/deals", channels: ["inapp", "push"], sentCount: await prisma.user.count(), createdAt: new Date(now - 40 * 86_400_000) } });
  console.log("  support: help center, canned replies, 6 tickets, buyer↔seller chats");
}
