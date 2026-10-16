// Legal documents (Uzbek Latin and Russian; the Cyrillic UI transliterates Uzbek). Version dates
// match CONSENT_VERSION: changing a document means bumping both and asking users again.
import { RETENTION_DAYS } from "@/lib/consent";

type Doc = { title: string; updated: string; intro: string; sections: Array<{ h: string; p: string[] }> };
export type LegalKey = "privacy" | "terms" | "cookies";

const R = RETENTION_DAYS;
const years = (d: number) => Math.round(d / 365);

export const LEGAL: Record<LegalKey, { uz: Doc; ru: Doc }> = {
  privacy: {
    uz: {
      title: "Maxfiylik siyosati",
      updated: "2026-yil 1-yanvar",
      intro: "ANOR marketpleysi (keyingi o‘rinlarda — «ANOR», «biz») shaxsga doir ma’lumotlaringizni O‘zbekiston Respublikasining «Shaxsga doir ma’lumotlar to‘g‘risida»gi Qonuni talablariga muvofiq qayta ishlaydi. Ushbu siyosat qanday ma’lumotlar yig‘ilishi, nima uchun ishlatilishi va sizning huquqlaringizni tushuntiradi.",
      sections: [
        { h: "1. Qanday ma’lumotlarni yig‘amiz", p: ["Akkaunt ma’lumotlari: login, ism, telefon raqami, elektron pochta, parol va PIN (faqat xesh ko‘rinishida).", "Buyurtma ma’lumotlari: yetkazib berish manzillari, buyurtmalar tarixi, to‘lov usuli (karta raqami saqlanmaydi — faqat to‘lov provayderining tokeni va oxirgi 4 raqam).", "Nasiya arizasi: pasport seriyasi va raqami yashirilgan ko‘rinishda, JShShIR faqat xesh ko‘rinishida, daromad va bandlik haqidagi ma’lumotlar.", "Texnik ma’lumotlar: IP-manzil, qurilma va brauzer, kirishlar tarixi — akkaunt xavfsizligi uchun.", "Muloqot: qo‘llab-quvvatlash va sotuvchilar bilan yozishmalar, sharhlar va savollar."] },
        { h: "2. Nima uchun ishlatamiz", p: ["Buyurtmalarni rasmiylashtirish, yetkazib berish va qaytarishlar uchun.", "Akkauntni himoya qilish: firibgarlikni aniqlash, shubhali kirishlarni bloklash.", "Nasiya limitini hisoblash (skoring) va to‘lovlarni eslatish.", "Sizning roziligingiz bilan — aksiyalar haqida xabarlar va shaxsiy tavsiyalar."] },
        { h: "3. Kimga beramiz", p: ["Sotuvchiga — buyurtmani bajarish uchun zarur bo‘lgan ma’lumotlar (DBS rejimida yetkazish manzili). Telefon va boshqa kontaktlar chatlarda yashiriladi.", "Yetkazib berish va to‘lov hamkorlariga — faqat xizmat ko‘rsatish uchun zarur hajmda.", "Davlat organlariga — faqat qonunda belgilangan hollarda.", "Biz shaxsga doir ma’lumotlarni sotmaymiz."] },
        { h: "4. Saqlash muddatlari", p: [`Bildirishnomalar — ${R.notifications} kun; mahsulotlarni ko‘rish tarixi — ${R.productViews} kun; qidiruv so‘rovlari va kirishlar tarixi — ${years(R.searchQueries)} yil.`, `Yopilgan qo‘llab-quvvatlash yozishmalari — ${years(R.resolvedSupportChats)} yil; audit jurnali — ${years(R.auditLog)} yil.`, "Buyurtmalar, to‘lovlar va fiskal cheklar soliq va buxgalteriya qonunchiligida belgilangan muddat davomida saqlanadi."] },
        { h: "5. Ma’lumotlar qayerda saqlanadi", p: ["O‘zbekiston fuqarolarining shaxsga doir ma’lumotlari O‘zbekiston hududida joylashgan serverlarda saqlanadi va qonunchilik talablariga muvofiq qayta ishlanadi."] },
        { h: "6. Sizning huquqlaringiz", p: ["Ma’lumotlaringiz nusxasini olish: «Akkaunt → Maxfiylik va ma’lumotlar» bo‘limida JSON fayl ko‘rinishida.", "Ma’lumotlarni tuzatish: profil sozlamalarida.", "Akkauntni o‘chirish: shaxsiy ma’lumotlar o‘chiriladi yoki anonimlashtiriladi; qonun saqlashni talab qiladigan buyurtma yozuvlari anonim holda qoladi.", "Marketing va cookie roziligini istalgan vaqtda qaytarib olish."] },
        { h: "7. Xavfsizlik", p: ["Parollar va PIN-kodlar argon2id bilan xeshlanadi; seanslar himoyalangan cookie’larda saqlanadi; xodimlarning barcha harakatlari audit jurnaliga yoziladi."] },
        { h: "8. Bog‘lanish", p: ["Savollar bo‘yicha: saytdagi «Yordam» chati yoki qo‘llab-quvvatlash kontaktlari orqali."] },
      ],
    },
    ru: {
      title: "Политика конфиденциальности",
      updated: "1 января 2026 г.",
      intro: "Маркетплейс ANOR (далее — «ANOR», «мы») обрабатывает ваши персональные данные в соответствии с Законом Республики Узбекистан «О персональных данных». Эта политика объясняет, какие данные мы собираем, зачем, и какие у вас права.",
      sections: [
        { h: "1. Какие данные мы собираем", p: ["Данные аккаунта: логин, имя, телефон, электронная почта, пароль и PIN (только в виде хеша).", "Данные заказов: адреса доставки, история заказов, способ оплаты (номер карты не хранится — только токен платёжного провайдера и последние 4 цифры).", "Заявка на рассрочку: серия и номер паспорта в замаскированном виде, ПИНФЛ только в виде хеша, сведения о доходе и занятости.", "Технические данные: IP-адрес, устройство и браузер, история входов — для безопасности аккаунта.", "Переписка: чаты с поддержкой и продавцами, отзывы и вопросы."] },
        { h: "2. Зачем мы их используем", p: ["Для оформления, доставки и возврата заказов.", "Для защиты аккаунта: выявление мошенничества, блокировка подозрительных входов.", "Для расчёта лимита рассрочки (скоринг) и напоминаний о платежах.", "С вашего согласия — для сообщений об акциях и персональных рекомендаций."] },
        { h: "3. Кому мы их передаём", p: ["Продавцу — данные, необходимые для выполнения заказа (адрес доставки в режиме DBS). Телефоны и другие контакты в чатах маскируются.", "Партнёрам по доставке и оплате — только в объёме, необходимом для услуги.", "Государственным органам — только в случаях, предусмотренных законом.", "Мы не продаём персональные данные."] },
        { h: "4. Сроки хранения", p: [`Уведомления — ${R.notifications} дней; история просмотров товаров — ${R.productViews} дней; поисковые запросы и история входов — ${years(R.searchQueries)} год.`, `Закрытые обращения в поддержку — ${years(R.resolvedSupportChats)} года; журнал аудита — ${years(R.auditLog)} лет.`, "Заказы, платежи и фискальные чеки хранятся в течение сроков, установленных налоговым и бухгалтерским законодательством."] },
        { h: "5. Где хранятся данные", p: ["Персональные данные граждан Узбекистана хранятся на серверах, расположенных на территории Узбекистана, и обрабатываются в соответствии с законодательством."] },
        { h: "6. Ваши права", p: ["Получить копию своих данных: в разделе «Аккаунт → Конфиденциальность и данные» в виде JSON-файла.", "Исправить данные: в настройках профиля.", "Удалить аккаунт: персональные данные удаляются или обезличиваются; записи о заказах, которые закон требует хранить, остаются в обезличенном виде.", "Отозвать согласие на маркетинг и cookie в любой момент."] },
        { h: "7. Безопасность", p: ["Пароли и PIN-коды хешируются argon2id; сессии хранятся в защищённых cookie; все действия сотрудников записываются в журнал аудита."] },
        { h: "8. Связь", p: ["По вопросам: чат «Помощь» на сайте или контакты поддержки."] },
      ],
    },
  },
  terms: {
    uz: {
      title: "Foydalanish shartlari",
      updated: "2026-yil 1-yanvar",
      intro: "Ushbu shartlar ANOR marketpleysidan foydalanish qoidalarini belgilaydi. Ro‘yxatdan o‘tish yoki buyurtma berish orqali siz ularga rozilik bildirasiz.",
      sections: [
        { h: "1. ANOR nima", p: ["ANOR — xaridorlar va mustaqil sotuvchilarni bog‘lovchi onlayn platforma. Mahsulotlar sotuvchilar tomonidan sotiladi; ANOR to‘lovlarni qabul qiladi, yetkazib berishni tashkil qiladi va nizolarni hal qilishda yordam beradi."] },
        { h: "2. Akkaunt", p: ["Siz akkauntingiz xavfsizligi uchun javobgarsiz: parol, PIN va tiklash kodlarini hech kimga bermang. ANOR xodimlari ularni hech qachon so‘ramaydi."] },
        { h: "3. Buyurtma va narx", p: ["Narxlar so‘mda, QQS bilan ko‘rsatiladi. Buyurtma sotuvchi tasdiqlagandan keyin bajariladi; mahsulot tugab qolsa, sotuvchi buyurtmani bekor qilishi mumkin va pul to‘liq qaytariladi."] },
        { h: "4. Yetkazib berish", p: ["Taxminiy yetkazish sanasi checkoutda ko‘rsatiladi. Topshirish punktida buyurtma 5 kun saqlanadi; muddat o‘tgach, u sotuvchiga qaytariladi va pul qaytariladi."] },
        { h: "5. Qaytarish", p: ["Sifatli mahsulotni qonunchilikda belgilangan muddatda, nuqsonli mahsulotni esa kafolat muddati davomida qaytarish mumkin. Pul tasdiqlangandan keyin karta yoki Anor Hamyonga qaytariladi."] },
        { h: "6. ANOR NASIYA", p: ["Muddatli to‘lov shartlari (muddat, ustama, jadval) har bir xarid uchun checkoutdagi shartnomada ko‘rsatiladi. Muddatidan oldin yopishda kelgusi oylar ustamasi olinmaydi."] },
        { h: "7. ANOR Plus", p: ["Obuna avtomatik yangilanadi; istalgan vaqtda bekor qilish mumkin, imtiyozlar to‘langan davr oxirigacha saqlanadi."] },
        { h: "8. Sharhlar va kontent", p: ["Sharhlar haqiqiy xarid tajribasiga asoslanishi kerak. Haqoratli, reklama yoki aldamchi kontent moderatsiyadan o‘tmaydi; qoidalarni buzgan akkauntlar cheklanishi mumkin."] },
        { h: "9. Javobgarlik", p: ["Mahsulot sifati uchun sotuvchi javobgar; ANOR nizolarni xolis ko‘rib chiqadi va qaror qabul qiladi."] },
      ],
    },
    ru: {
      title: "Условия использования",
      updated: "1 января 2026 г.",
      intro: "Эти условия определяют правила использования маркетплейса ANOR. Регистрируясь или оформляя заказ, вы соглашаетесь с ними.",
      sections: [
        { h: "1. Что такое ANOR", p: ["ANOR — онлайн-платформа, которая соединяет покупателей и независимых продавцов. Товары продают продавцы; ANOR принимает оплату, организует доставку и помогает разрешать споры."] },
        { h: "2. Аккаунт", p: ["Вы отвечаете за безопасность аккаунта: не сообщайте никому пароль, PIN и коды восстановления. Сотрудники ANOR никогда их не запрашивают."] },
        { h: "3. Заказ и цена", p: ["Цены указаны в сумах с НДС. Заказ выполняется после подтверждения продавцом; если товар закончился, продавец может отменить заказ, деньги возвращаются полностью."] },
        { h: "4. Доставка", p: ["Ориентировочная дата доставки показывается при оформлении. В пункте выдачи заказ хранится 5 дней; после этого он возвращается продавцу, деньги возвращаются."] },
        { h: "5. Возврат", p: ["Товар надлежащего качества можно вернуть в сроки, установленные законодательством, товар с недостатками — в течение гарантийного срока. Деньги возвращаются на карту или в Anor Hamyon после одобрения."] },
        { h: "6. ANOR NASIYA", p: ["Условия рассрочки (срок, наценка, график) указаны в договоре при оформлении каждой покупки. При досрочном погашении наценка за будущие месяцы не взимается."] },
        { h: "7. ANOR Plus", p: ["Подписка продлевается автоматически; отменить можно в любой момент, преимущества сохраняются до конца оплаченного периода."] },
        { h: "8. Отзывы и контент", p: ["Отзывы должны основываться на реальном опыте покупки. Оскорбительный, рекламный или вводящий в заблуждение контент не проходит модерацию; аккаунты-нарушители могут быть ограничены."] },
        { h: "9. Ответственность", p: ["За качество товара отвечает продавец; ANOR беспристрастно рассматривает споры и принимает решение."] },
      ],
    },
  },
  cookies: {
    uz: {
      title: "Cookie siyosati",
      updated: "2026-yil 1-yanvar",
      intro: "Cookie — brauzeringizda saqlanadigan kichik fayllar. Ularning bir qismi sayt ishlashi uchun zarur, qolganlari faqat roziligingiz bilan ishlatiladi.",
      sections: [
        { h: "Zarur", p: ["Seans (kirish), savat, til, xavfsizlik (CSRF) va anonim tashrifchi identifikatori — savat va «yaqinda ko‘rilganlar» uchun. Ularsiz sayt ishlamaydi, shuning uchun rozilik so‘ralmaydi."] },
        { h: "Analitika", p: ["Bosh sahifa A/B testlari natijalarini o‘lchash. Rozilik bermasangiz, siz testda qatnashmaysiz va tashriflaringiz statistikaga yozilmaydi."] },
        { h: "Marketing", p: ["Homiylik (reklama) e’lonlaridan keyingi xaridlarni sotuvchi reklamasiga bog‘lash. Rozilik bermasangiz, reklama bosishlari xaridlaringizga bog‘lanmaydi."] },
        { h: "Sozlamalarni o‘zgartirish", p: ["Tanlovingizni quyidagi formada yoki «Akkaunt → Maxfiylik va ma’lumotlar» bo‘limida istalgan vaqtda o‘zgartirishingiz mumkin."] },
      ],
    },
    ru: {
      title: "Политика cookie",
      updated: "1 января 2026 г.",
      intro: "Cookie — небольшие файлы, которые хранятся в браузере. Часть из них нужна для работы сайта, остальные используются только с вашего согласия.",
      sections: [
        { h: "Необходимые", p: ["Сессия (вход), корзина, язык, безопасность (CSRF) и анонимный идентификатор посетителя — для корзины и «недавно просмотренных». Без них сайт не работает, поэтому согласие не запрашивается."] },
        { h: "Аналитика", p: ["Измерение результатов A/B-тестов главной страницы. Без согласия вы не участвуете в тестах, а визиты не попадают в статистику."] },
        { h: "Маркетинг", p: ["Связь покупок после клика по спонсорским (рекламным) объявлениям с рекламой продавца. Без согласия клики по рекламе не связываются с вашими покупками."] },
        { h: "Изменить настройки", p: ["Выбор можно изменить в форме ниже или в разделе «Аккаунт → Конфиденциальность и данные» в любой момент."] },
      ],
    },
  },
};
