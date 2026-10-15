// Demo catalog: categories, shops, brands and ~50 products with uz/ru content and UZS prices.

export type CatSeed = { slug: string; uz: string; ru: string; icon?: string; commission?: number; children?: CatSeed[]; sizeGuide?: boolean };

export const CATEGORIES: CatSeed[] = [
  {
    slug: "elektronika", uz: "Elektronika", ru: "Электроника", icon: "smartphone", commission: 0.08,
    children: [
      { slug: "smartfonlar", uz: "Smartfonlar", ru: "Смартфоны" },
      { slug: "noutbuklar", uz: "Noutbuklar", ru: "Ноутбуки" },
      { slug: "planshetlar", uz: "Planshetlar", ru: "Планшеты" },
      { slug: "quloqchinlar", uz: "Quloqchinlar", ru: "Наушники" },
      { slug: "aqlli-soatlar", uz: "Aqlli soatlar", ru: "Умные часы" },
      { slug: "televizorlar", uz: "Televizorlar", ru: "Телевизоры" },
      { slug: "foto-video", uz: "Foto va video", ru: "Фото и видео" },
    ],
  },
  {
    slug: "maishiy-texnika", uz: "Maishiy texnika", ru: "Бытовая техника", icon: "appliances", commission: 0.09,
    children: [
      { slug: "muzlatgichlar", uz: "Muzlatgichlar", ru: "Холодильники" },
      { slug: "kir-yuvish", uz: "Kir yuvish mashinalari", ru: "Стиральные машины" },
      { slug: "changyutgichlar", uz: "Changyutgichlar", ru: "Пылесосы" },
      { slug: "oshxona-texnikasi", uz: "Oshxona texnikasi", ru: "Техника для кухни" },
    ],
  },
  {
    slug: "kiyim", uz: "Kiyim-kechak", ru: "Одежда", icon: "shirt", commission: 0.15, sizeGuide: true,
    children: [
      { slug: "ayollar-kiyimi", uz: "Ayollar kiyimi", ru: "Женская одежда", sizeGuide: true },
      { slug: "erkaklar-kiyimi", uz: "Erkaklar kiyimi", ru: "Мужская одежда", sizeGuide: true },
      { slug: "poyabzal", uz: "Poyabzal", ru: "Обувь", sizeGuide: true },
      { slug: "sumkalar", uz: "Sumkalar", ru: "Сумки" },
    ],
  },
  {
    slug: "uy-va-bog", uz: "Uy va bog‘", ru: "Дом и сад", icon: "home", commission: 0.12,
    children: [
      { slug: "mebel", uz: "Mebel", ru: "Мебель" },
      { slug: "yoritish", uz: "Yoritish", ru: "Освещение" },
      { slug: "oshxona-anjomlari", uz: "Oshxona anjomlari", ru: "Посуда и кухня" },
      { slug: "toqimachilik", uz: "Uy to‘qimachiligi", ru: "Домашний текстиль" },
    ],
  },
  {
    slug: "gozallik", uz: "Go‘zallik va parvarish", ru: "Красота и уход", icon: "beauty", commission: 0.14,
    children: [
      { slug: "parfyumeriya", uz: "Parfyumeriya", ru: "Парфюмерия" },
      { slug: "kosmetika", uz: "Kosmetika", ru: "Косметика" },
      { slug: "teri-parvarishi", uz: "Teri parvarishi", ru: "Уход за кожей" },
    ],
  },
  {
    slug: "bolalar", uz: "Bolalar uchun", ru: "Детям", icon: "baby", commission: 0.12,
    children: [
      { slug: "oyinchoqlar", uz: "O‘yinchoqlar", ru: "Игрушки" },
      { slug: "aravachalar", uz: "Aravachalar", ru: "Коляски" },
      { slug: "bolalar-kiyimi", uz: "Bolalar kiyimi", ru: "Детская одежда", sizeGuide: true },
    ],
  },
  {
    slug: "oziq-ovqat", uz: "Oziq-ovqat", ru: "Продукты", icon: "grocery", commission: 0.1,
    children: [
      { slug: "choy-qahva", uz: "Choy va qahva", ru: "Чай и кофе" },
      { slug: "quruq-mevalar", uz: "Quruq mevalar va yong‘oqlar", ru: "Сухофрукты и орехи" },
      { slug: "asal-shirinliklar", uz: "Asal va shirinliklar", ru: "Мёд и сладости" },
    ],
  },
  {
    slug: "sport", uz: "Sport va dam olish", ru: "Спорт и отдых", icon: "sport", commission: 0.12,
    children: [
      { slug: "fitnes", uz: "Fitnes", ru: "Фитнес" },
      { slug: "velosipedlar", uz: "Velosipedlar", ru: "Велосипеды" },
      { slug: "jamoaviy-sport", uz: "Jamoaviy sport", ru: "Командные виды спорта" },
    ],
  },
  {
    slug: "hunarmandchilik", uz: "Hunarmandchilik", ru: "Ремёсла", icon: "crafts", commission: 0.07,
    children: [
      { slug: "kulolchilik", uz: "Kulolchilik", ru: "Керамика" },
      { slug: "doppilar", uz: "Do‘ppilar", ru: "Тюбетейки" },
      { slug: "atlas-adras", uz: "Atlas va adras", ru: "Атлас и адрас" },
      { slug: "suzani", uz: "So‘zana va gilamlar", ru: "Сюзане и ковры" },
      { slug: "pichoqlar", uz: "Pichoqlar", ru: "Ножи" },
    ],
  },
  {
    slug: "kitoblar", uz: "Kitoblar", ru: "Книги", icon: "books", commission: 0.1,
    children: [
      { slug: "badiiy", uz: "Badiiy adabiyot", ru: "Художественная литература" },
      { slug: "bolalar-kitoblari", uz: "Bolalar kitoblari", ru: "Детские книги" },
    ],
  },
  {
    slug: "avto", uz: "Avto", ru: "Авто", icon: "auto", commission: 0.1,
    children: [
      { slug: "shinalar", uz: "Shinalar", ru: "Шины" },
      { slug: "avto-aksessuarlar", uz: "Avto aksessuarlar", ru: "Автоаксессуары" },
    ],
  },
];

export const SIZE_GUIDE = {
  headers: ["Size", "EU", "Ko‘krak / Грудь, sm", "Bel / Талия, sm"],
  rows: [
    ["XS", "40", "80–84", "62–66"],
    ["S", "42", "84–88", "66–70"],
    ["M", "44–46", "88–96", "70–78"],
    ["L", "48", "96–102", "78–86"],
    ["XL", "50–52", "102–110", "86–94"],
  ],
};

export type ShopKey = "techhub" | "moda" | "hunarmand" | "nematlar";

export const SHOPS: Record<ShopKey, { slug: string; name: string; uz: string; ru: string; city: string; official: boolean; tier: "BASIC" | "PRO"; legal: "LLC" | "SELF_EMPLOYED" | "INDIVIDUAL_ENTREPRENEUR"; taxId: string; logo: [string, string] }> = {
  techhub: { slug: "techhub", name: "TechHub Toshkent", uz: "Original elektronika va maishiy texnika. Rasmiy kafolat, Toshkent bo‘ylab shu kuni yetkazish.", ru: "Оригинальная электроника и бытовая техника. Официальная гарантия, доставка по Ташкенту в день заказа.", city: "Toshkent", official: true, tier: "PRO", legal: "LLC", taxId: "305123456", logo: ["laptop", "1D4E9E"] },
  moda: { slug: "moda-bazar", name: "Moda Bazar", uz: "Kundalik va bayramona kiyimlar, poyabzal va aksessuarlar. Mahalliy tikuvchilardan ham.", ru: "Повседневная и праздничная одежда, обувь и аксессуары. В том числе от местных швейных цехов.", city: "Toshkent", official: false, tier: "BASIC", legal: "INDIVIDUAL_ENTREPRENEUR", taxId: "512345678", logo: ["dress", "C8102E"] },
  hunarmand: { slug: "hunarmand-ustaxonasi", name: "Hunarmand Ustaxonasi", uz: "Rishton kulolchiligi, Marg‘ilon atlasi, Chust pichoqlari va do‘ppilari — ustalarning o‘z qo‘li bilan.", ru: "Риштанская керамика, маргиланский атлас, чустские ножи и тюбетейки — ручная работа мастеров.", city: "Farg‘ona", official: false, tier: "BASIC", legal: "SELF_EMPLOYED", taxId: "623456789", logo: ["plate", "0E8C8C"] },
  nematlar: { slug: "samarqand-nematlari", name: "Samarqand Ne’matlari", uz: "Halol oziq-ovqat: quruq mevalar, asal, choy va shirinliklar. Samarqand va Farg‘ona vodiysidan.", ru: "Халяльные продукты: сухофрукты, мёд, чай и сладости из Самарканда и Ферганской долины.", city: "Samarqand", official: false, tier: "PRO", legal: "LLC", taxId: "307654321", logo: ["nuts", "8A5A2B"] },
};

export const BRANDS = [
  { slug: "samsung", name: "Samsung", official: true },
  { slug: "xiaomi", name: "Xiaomi", official: true },
  { slug: "apple", name: "Apple", official: true },
  { slug: "artel", name: "Artel", official: true },
  { slug: "lenovo", name: "Lenovo", official: false },
  { slug: "tefal", name: "Tefal", official: false },
  { slug: "rishton-ceramics", name: "Rishton Ceramics", official: false },
  { slug: "margilon-silk", name: "Marg‘ilon Ipagi", official: false },
  { slug: "anor-basics", name: "Anor Basics", official: false },
];

type V = { uz: string; ru: string; opt?: Record<string, string>; price?: number; old?: number | null; stock: number; hex?: string };

export type ProductSeed = {
  slug: string;
  cat: string;
  shop: ShopKey;
  brand?: string;
  uz: string;
  ru: string;
  dUz: string;
  dRu: string;
  price: number;
  old?: number;
  art: [string, string];
  variants?: V[];
  specs: Array<[string, string, string]>;
  halal?: boolean;
  madeInUz?: boolean;
  f: "FBO" | "FBS" | "DBS";
  w?: number;
  kw?: string;
  preorder?: number; // days until ship
  condition?: "NEW" | "USED_A" | "USED_B";
  wholesale?: Array<{ minQty: number; price: number }>;
  sold?: number;
  video?: boolean;
};

export const PRODUCTS: ProductSeed[] = [
  // ── Electronics (TechHub) ──
  {
    slug: "apple-iphone-15", cat: "smartfonlar", shop: "techhub", brand: "apple", f: "FBO", w: 350, sold: 412, video: true,
    uz: "Apple iPhone 15", ru: "Apple iPhone 15",
    dUz: "Dynamic Island, 48 MP asosiy kamera va USB‑C bilan iPhone 15. A16 Bionic protsessori, kun bo‘yi ishlaydigan batareya, mustahkam alyuminiy korpus.",
    dRu: "iPhone 15 с Dynamic Island, основной камерой 48 Мп и USB‑C. Процессор A16 Bionic, батарея на весь день, прочный алюминиевый корпус.",
    price: 11_490_000, old: 12_590_000, art: ["phone", "2A2A33"],
    variants: [
      { uz: "128 GB · Qora", ru: "128 ГБ · Чёрный", opt: { memory: "128GB", color: "black" }, stock: 24, hex: "2A2A33" },
      { uz: "128 GB · Pushti", ru: "128 ГБ · Розовый", opt: { memory: "128GB", color: "pink" }, stock: 11, hex: "E26D8C" },
      { uz: "256 GB · Qora", ru: "256 ГБ · Чёрный", opt: { memory: "256GB", color: "black" }, price: 13_290_000, old: 14_490_000, stock: 8, hex: "2A2A33" },
    ],
    specs: [["Ekran", "Экран", "6,1\" Super Retina XDR OLED"], ["Protsessor", "Процессор", "A16 Bionic"], ["Kamera", "Камера", "48 МП + 12 МП"], ["Batareya", "Батарея", "3349 mAh"], ["SIM", "SIM", "nano-SIM + eSIM"], ["Kafolat", "Гарантия", "12 oy / 12 мес."]],
    kw: "ayfon айфон iphone telefon телефон apple",
  },
  {
    slug: "samsung-galaxy-a55", cat: "smartfonlar", shop: "techhub", brand: "samsung", f: "FBO", w: 300, sold: 389,
    uz: "Samsung Galaxy A55 5G", ru: "Samsung Galaxy A55 5G",
    dUz: "Super AMOLED 120 Hz ekran, 50 MP OIS kamera va IP67 himoyasi. 5000 mAh batareya va 4 yil Android yangilanishlari.",
    dRu: "Экран Super AMOLED 120 Гц, камера 50 Мп с OIS и защита IP67. Батарея 5000 мАч и 4 года обновлений Android.",
    price: 4_890_000, old: 5_490_000, art: ["phone", "1D4E9E"],
    variants: [
      { uz: "8/128 GB · Ko‘k", ru: "8/128 ГБ · Синий", opt: { memory: "128GB", color: "blue" }, stock: 40, hex: "1D4E9E" },
      { uz: "8/256 GB · Ko‘k", ru: "8/256 ГБ · Синий", opt: { memory: "256GB", color: "blue" }, price: 5_490_000, old: 5_990_000, stock: 18, hex: "1D4E9E" },
      { uz: "8/256 GB · Limon", ru: "8/256 ГБ · Лимонный", opt: { memory: "256GB", color: "lemon" }, price: 5_490_000, old: 5_990_000, stock: 9, hex: "D9C84A" },
    ],
    specs: [["Ekran", "Экран", "6,6\" Super AMOLED, 120 Гц"], ["Protsessor", "Процессор", "Exynos 1480"], ["Kamera", "Камера", "50 + 12 + 5 МП"], ["Batareya", "Батарея", "5000 mAh, 25 Вт"], ["Himoya", "Защита", "IP67"]],
    kw: "samsung самсунг galaxy галакси telefon телефон smartfon",
  },
  {
    slug: "xiaomi-redmi-note-13-pro", cat: "smartfonlar", shop: "techhub", brand: "xiaomi", f: "FBO", w: 290, sold: 655,
    uz: "Xiaomi Redmi Note 13 Pro", ru: "Xiaomi Redmi Note 13 Pro",
    dUz: "200 MP kamera, 1,5K AMOLED ekran va 67 Vt tezkor quvvatlash. Narx va imkoniyat bo‘yicha eng yaxshi tanlov.",
    dRu: "Камера 200 Мп, экран 1,5K AMOLED и быстрая зарядка 67 Вт. Лучший выбор по соотношению цены и возможностей.",
    price: 3_590_000, old: 3_990_000, art: ["phone", "6B4FBB"],
    variants: [
      { uz: "8/256 GB · Binafsha", ru: "8/256 ГБ · Фиолетовый", opt: { memory: "256GB", color: "purple" }, stock: 55, hex: "6B4FBB" },
      { uz: "8/256 GB · Qora", ru: "8/256 ГБ · Чёрный", opt: { memory: "256GB", color: "black" }, stock: 32, hex: "2A2A33" },
    ],
    specs: [["Ekran", "Экран", "6,67\" AMOLED 120 Гц"], ["Kamera", "Камера", "200 МП"], ["Batareya", "Батарея", "5100 mAh, 67 Вт"]],
    kw: "redmi редми xiaomi сяоми ksiaomi telefon",
  },
  {
    slug: "lenovo-ideapad-slim-3", cat: "noutbuklar", shop: "techhub", brand: "lenovo", f: "FBO", w: 1600, sold: 143,
    uz: "Lenovo IdeaPad Slim 3 15\" noutbuk", ru: "Ноутбук Lenovo IdeaPad Slim 3 15\"",
    dUz: "O‘qish va ish uchun yengil noutbuk: Ryzen 5, 16 GB RAM, 512 GB SSD, Full HD IPS ekran. Talabalar uchun ideal.",
    dRu: "Лёгкий ноутбук для учёбы и работы: Ryzen 5, 16 ГБ RAM, SSD 512 ГБ, IPS Full HD. Идеален для студентов.",
    price: 7_390_000, old: 7_990_000, art: ["laptop", "8A8F9C"],
    variants: [
      { uz: "Ryzen 5 / 16 GB / 512 GB", ru: "Ryzen 5 / 16 ГБ / 512 ГБ", opt: { config: "r5-16-512" }, stock: 14, hex: "8A8F9C" },
      { uz: "Ryzen 7 / 16 GB / 1 TB", ru: "Ryzen 7 / 16 ГБ / 1 ТБ", opt: { config: "r7-16-1tb" }, price: 8_990_000, old: 9_590_000, stock: 6, hex: "4A4F5C" },
    ],
    specs: [["Protsessor", "Процессор", "AMD Ryzen 5 7520U"], ["Xotira", "ОЗУ", "16 GB LPDDR5"], ["Disk", "Накопитель", "512 GB SSD"], ["Ekran", "Экран", "15,6\" FHD IPS"], ["Vazn", "Вес", "1,6 kg"]],
    kw: "noutbuk ноутбук laptop lenovo леново kompyuter talaba student o‘qish",
  },
  {
    slug: "apple-macbook-air-m3", cat: "noutbuklar", shop: "techhub", brand: "apple", f: "FBO", w: 1240, sold: 58,
    uz: "Apple MacBook Air 13\" M3", ru: "Apple MacBook Air 13\" M3",
    dUz: "M3 chipli yupqa va jim MacBook Air. 18 soatgacha avtonom ishlash, Liquid Retina ekran.",
    dRu: "Тонкий и бесшумный MacBook Air с чипом M3. До 18 часов автономной работы, дисплей Liquid Retina.",
    price: 16_890_000, art: ["laptop", "C9CED6"],
    variants: [{ uz: "8 GB / 256 GB · Kumush", ru: "8 ГБ / 256 ГБ · Серебристый", opt: { color: "silver" }, stock: 5, hex: "C9CED6" }],
    specs: [["Chip", "Чип", "Apple M3 8-core"], ["Xotira", "ОЗУ", "8 GB"], ["Disk", "Накопитель", "256 GB SSD"], ["Ekran", "Экран", "13,6\" Liquid Retina"]],
    kw: "macbook макбук apple noutbuk ноутбук",
  },
  {
    slug: "samsung-galaxy-tab-s9-fe", cat: "planshetlar", shop: "techhub", brand: "samsung", f: "FBO", w: 520, sold: 77,
    uz: "Samsung Galaxy Tab S9 FE", ru: "Samsung Galaxy Tab S9 FE",
    dUz: "S Pen bilan keladigan planshet: IP68 himoya, 10,9\" ekran va uzoq batareya. Darslar va ijod uchun.",
    dRu: "Планшет со S Pen в комплекте: защита IP68, экран 10,9\" и ёмкая батарея. Для учёбы и творчества.",
    price: 4_690_000, old: 5_190_000, art: ["tablet", "8FB89A"], specs: [["Ekran", "Экран", "10,9\" TFT 90 Гц"], ["Xotira", "Память", "6/128 GB"], ["Stilus", "Стилус", "S Pen"]],
    variants: [{ uz: "6/128 GB · Yalpiz", ru: "6/128 ГБ · Мятный", stock: 12, hex: "8FB89A" }],
    kw: "planshet планшет tablet samsung",
  },
  {
    slug: "apple-airpods-pro-2", cat: "quloqchinlar", shop: "techhub", brand: "apple", f: "FBO", w: 120, sold: 230,
    uz: "Apple AirPods Pro (2-avlod) USB‑C", ru: "Apple AirPods Pro (2-го поколения) USB‑C",
    dUz: "Faol shovqinni bostirish, moslashuvchan ovoz va MagSafe g‘ilof. USB‑C orqali quvvatlanadi.",
    dRu: "Активное шумоподавление, адаптивное аудио и кейс MagSafe с разъёмом USB‑C.",
    price: 3_090_000, old: 3_390_000, art: ["earbuds", "E6E6EE"], specs: [["Shovqinni bostirish", "Шумоподавление", "Faol / Активное"], ["Ishlash vaqti", "Время работы", "6 soat + 24 soat g‘ilof"]],
    variants: [{ uz: "Oq", ru: "Белый", stock: 30, hex: "E6E6EE" }],
    kw: "airpods аирподс quloqchin наушники earbuds",
  },
  {
    slug: "xiaomi-redmi-buds-5", cat: "quloqchinlar", shop: "techhub", brand: "xiaomi", f: "FBO", w: 90, sold: 940,
    uz: "Xiaomi Redmi Buds 5 simsiz quloqchinlar", ru: "Беспроводные наушники Xiaomi Redmi Buds 5",
    dUz: "46 dB gacha shovqinni bostirish, 40 soatgacha musiqa. Arzon va sifatli.",
    dRu: "Шумоподавление до 46 дБ, до 40 часов музыки. Доступно и качественно.",
    price: 389_000, old: 459_000, art: ["earbuds", "2A2A33"],
    variants: [
      { uz: "Qora", ru: "Чёрный", opt: { color: "black" }, stock: 120, hex: "2A2A33" },
      { uz: "Oq", ru: "Белый", opt: { color: "white" }, stock: 80, hex: "D9D9E3" },
    ],
    specs: [["Shovqinni bostirish", "Шумоподавление", "46 dB"], ["Batareya", "Батарея", "40 soat"]],
    kw: "quloqchin наушники redmi buds simsiz",
  },
  {
    slug: "sony-wh-1000xm5", cat: "quloqchinlar", shop: "techhub", f: "FBS", w: 250, sold: 64,
    uz: "Sony WH-1000XM5 quloqchin", ru: "Наушники Sony WH-1000XM5",
    dUz: "Sohadagi eng yaxshi shovqinni bostirish, 30 soat batareya va qulay yengil konstruksiya.",
    dRu: "Одно из лучших шумоподавлений, 30 часов работы и лёгкая удобная конструкция.",
    price: 4_390_000, old: 4_790_000, art: ["headphones", "2A2A33"], specs: [["Turi", "Тип", "Yopiq, simsiz"], ["Batareya", "Батарея", "30 soat"]],
    variants: [{ uz: "Qora", ru: "Чёрный", stock: 7, hex: "2A2A33" }],
    kw: "sony сони quloqchin наушники headphones",
  },
  {
    slug: "samsung-galaxy-watch-6", cat: "aqlli-soatlar", shop: "techhub", brand: "samsung", f: "FBO", w: 60, sold: 121,
    uz: "Samsung Galaxy Watch6 44 mm", ru: "Samsung Galaxy Watch6 44 мм",
    dUz: "Uyqu, yurak urishi va EKG monitoringi. Safir oynasi va 40 soatgacha ishlash.",
    dRu: "Мониторинг сна, пульса и ЭКГ. Сапфировое стекло и до 40 часов работы.",
    price: 3_190_000, old: 3_690_000, art: ["watch", "4A6B8A"], specs: [["Ekran", "Экран", "1,5\" Super AMOLED"], ["Himoya", "Защита", "5ATM + IP68"]],
    variants: [{ uz: "Grafit", ru: "Графит", stock: 15, hex: "4A6B8A" }],
    kw: "soat часы smartwatch aqlli",
  },
  {
    slug: "xiaomi-tv-a-43", cat: "televizorlar", shop: "techhub", brand: "xiaomi", f: "FBO", w: 7200, sold: 88,
    uz: "Xiaomi TV A 43\" 4K Google TV", ru: "Телевизор Xiaomi TV A 43\" 4K Google TV",
    dUz: "4K UHD ekran, Dolby Audio va Google TV. YouTube va boshqa ilovalar tayyor holatda.",
    dRu: "Экран 4K UHD, Dolby Audio и Google TV. YouTube и другие приложения уже установлены.",
    price: 3_890_000, old: 4_390_000, art: ["tv", "E26D5C"], specs: [["Diagonal", "Диагональ", "43\""], ["Ruxsat", "Разрешение", "3840×2160"], ["OS", "ОС", "Google TV"]],
    variants: [{ uz: "43 dyuym", ru: "43 дюйма", stock: 10, hex: "E26D5C" }],
    kw: "televizor телевизор tv smart",
  },
  {
    slug: "canon-eos-r50-kit", cat: "foto-video", shop: "techhub", f: "FBS", w: 650, sold: 19, preorder: 10,
    uz: "Canon EOS R50 18-45 mm kit", ru: "Canon EOS R50 kit 18-45 мм",
    dUz: "Bloger va boshlovchi fotograflar uchun ixcham ko‘zgusiz kamera. Oldindan buyurtma — 10 kunda jo‘natiladi.",
    dRu: "Компактная беззеркальная камера для блогеров и начинающих фотографов. Предзаказ — отправка через 10 дней.",
    price: 9_490_000, art: ["camera", "2A2A33"], specs: [["Matritsa", "Матрица", "APS-C 24,2 MP"], ["Video", "Видео", "4K 30p"]],
    variants: [{ uz: "Qora", ru: "Чёрный", stock: 0, hex: "2A2A33" }],
    kw: "kamera камера foto canon",
  },
  // ── Appliances ──
  {
    slug: "artel-hd-455-fwen", cat: "muzlatgichlar", shop: "techhub", brand: "artel", f: "FBO", w: 62000, madeInUz: true, sold: 204,
    uz: "Artel HD 455 FWEN muzlatgich", ru: "Холодильник Artel HD 455 FWEN",
    dUz: "No Frost texnologiyali ikki kamerali muzlatgich, 350 litr. O‘zbekistonda ishlab chiqarilgan, 3 yil kafolat.",
    dRu: "Двухкамерный холодильник No Frost на 350 литров. Произведено в Узбекистане, гарантия 3 года.",
    price: 6_190_000, old: 6_890_000, art: ["fridge", "8A8F9C"], specs: [["Hajm", "Объём", "350 L"], ["Energiya", "Класс энергии", "A+"], ["Kafolat", "Гарантия", "3 yil / 3 года"]],
    variants: [
      { uz: "Kumush", ru: "Серебристый", opt: { color: "silver" }, stock: 9, hex: "8A8F9C" },
      { uz: "Oq", ru: "Белый", opt: { color: "white" }, stock: 12, hex: "C9CED6" },
    ],
    kw: "muzlatgich холодильник xolodilnik artel артель",
  },
  {
    slug: "artel-wf70-washer", cat: "kir-yuvish", shop: "techhub", brand: "artel", f: "FBO", w: 58000, madeInUz: true, sold: 167,
    uz: "Artel WF70 kir yuvish mashinasi, 7 kg", ru: "Стиральная машина Artel WF70, 7 кг",
    dUz: "Inverter motor, 15 ta dastur va bug‘ bilan yuvish. Tejamkor va jim.",
    dRu: "Инверторный мотор, 15 программ и стирка паром. Экономичная и тихая.",
    price: 4_290_000, old: 4_690_000, art: ["washer", "1D4E9E"], specs: [["Yuklama", "Загрузка", "7 kg"], ["Aylanish", "Отжим", "1200 ayl/min"]],
    variants: [{ uz: "Oq", ru: "Белый", stock: 13, hex: "1D4E9E" }],
    kw: "kir yuvish стиральная машина stiralka artel",
  },
  {
    slug: "xiaomi-robot-vacuum-s10", cat: "changyutgichlar", shop: "techhub", brand: "xiaomi", f: "FBO", w: 3800, sold: 96,
    uz: "Xiaomi Robot Vacuum S10 robot-changyutgich", ru: "Робот-пылесос Xiaomi Robot Vacuum S10",
    dUz: "Lazerli navigatsiya, ho‘l tozalash va ilova orqali boshqarish.",
    dRu: "Лазерная навигация, влажная уборка и управление из приложения.",
    price: 3_490_000, old: 3_990_000, art: ["vacuum", "E6E6EE"], specs: [["So‘rish", "Мощность всасывания", "4000 Pa"], ["Batareya", "Батарея", "130 daqiqa"]],
    variants: [{ uz: "Oq", ru: "Белый", stock: 11, hex: "B6B9C4" }],
    kw: "changyutgich пылесос robot",
  },
  {
    slug: "tefal-express-kettle", cat: "oshxona-texnikasi", shop: "techhub", brand: "tefal", f: "FBO", w: 1100, sold: 512,
    uz: "Tefal elektr choynak, 1,7 L", ru: "Электрочайник Tefal, 1,7 л",
    dUz: "2200 Vt quvvat, ohak filtri va avtomatik o‘chish. Ko‘k choy uchun ideal.",
    dRu: "Мощность 2200 Вт, фильтр от накипи и автоотключение. Идеален для зелёного чая.",
    price: 449_000, old: 529_000, art: ["kettle", "C8102E"], specs: [["Hajm", "Объём", "1,7 L"], ["Quvvat", "Мощность", "2200 W"]],
    variants: [
      { uz: "Qizil", ru: "Красный", opt: { color: "red" }, stock: 60, hex: "C8102E" },
      { uz: "Qora", ru: "Чёрный", opt: { color: "black" }, stock: 35, hex: "2A2A33" },
    ],
    kw: "choynak чайник kettle",
  },
  {
    slug: "philips-blender-5000", cat: "oshxona-texnikasi", shop: "techhub", f: "FBS", w: 2400, sold: 74,
    uz: "Philips 5000 statsionar blender", ru: "Стационарный блендер Philips 5000",
    dUz: "1200 Vt motor, muz maydalash funksiyasi va 2 L idish.",
    dRu: "Мотор 1200 Вт, функция колки льда и чаша 2 л.",
    price: 889_000, old: 990_000, art: ["blender", "6B4FBB"], specs: [["Quvvat", "Мощность", "1200 W"], ["Idish", "Чаша", "2 L"]],
    variants: [{ uz: "Kulrang", ru: "Серый", stock: 16, hex: "6B4FBB" }],
    kw: "blender блендер",
  },
  // ── Fashion (Moda Bazar) ──
  {
    slug: "atlas-ko-ylak-guldasta", cat: "ayollar-kiyimi", shop: "moda", f: "FBS", w: 400, madeInUz: true, sold: 188,
    uz: "Atlas naqshli ko‘ylak «Guldasta»", ru: "Платье с атласным узором «Гулдаста»",
    dUz: "Marg‘ilon atlasi motivlari bilan tikilgan zamonaviy ko‘ylak. Bayram va to‘ylar uchun. Toshkentda tikilgan.",
    dRu: "Современное платье с мотивами маргиланского атласа. Для праздников и свадеб. Сшито в Ташкенте.",
    price: 519_000, old: 690_000, art: ["dress", "C8102E"],
    variants: ["S", "M", "L", "XL"].map((s, i) => ({ uz: s, ru: s, opt: { size: s, color: "red" }, stock: [6, 12, 9, 4][i], hex: "C8102E" })),
    specs: [["Material", "Материал", "Paxta 70%, viskoza 30%"], ["Uzunlik", "Длина", "Midi"], ["Ishlab chiqarilgan", "Производство", "O‘zbekiston"]],
    kw: "ko‘ylak платье atlas атлас dress",
  },
  {
    slug: "erkaklar-ko-ylagi-oxford", cat: "erkaklar-kiyimi", shop: "moda", brand: "anor-basics", f: "FBS", w: 300, sold: 233,
    uz: "Erkaklar ko‘ylagi Oxford, paxta", ru: "Мужская рубашка Oxford, хлопок",
    dUz: "100% O‘zbekiston paxtasidan tikilgan klassik ko‘ylak. Ofis va kundalik uchun.",
    dRu: "Классическая рубашка из 100% узбекского хлопка. Для офиса и на каждый день.",
    price: 279_000, old: 349_000, art: ["shirt", "1D4E9E"], madeInUz: true,
    variants: [
      ...["M", "L", "XL"].map((s, i) => ({ uz: `${s} · Moviy`, ru: `${s} · Голубой`, opt: { size: s, color: "blue" }, stock: [14, 10, 6][i], hex: "1D4E9E" })),
      ...["M", "L"].map((s, i) => ({ uz: `${s} · Oq`, ru: `${s} · Белый`, opt: { size: s, color: "white" }, stock: [9, 7][i], hex: "B6B9C4" })),
    ],
    specs: [["Material", "Материал", "100% paxta / хлопок"], ["Fason", "Крой", "Regular fit"]],
    kw: "ko‘ylak рубашка shirt erkaklar",
  },
  {
    slug: "qishki-kurtka-puffer", cat: "erkaklar-kiyimi", shop: "moda", f: "FBS", w: 1200, sold: 97,
    uz: "Qishki kurtka Puffer, -25°C gacha", ru: "Зимняя куртка Puffer, до -25°C",
    dUz: "Suv o‘tkazmaydigan ustki qatlam va issiq tolali to‘ldirgich. Kapyushon olinadi.",
    dRu: "Водоотталкивающий верх и тёплый синтетический утеплитель. Капюшон отстёгивается.",
    price: 1_149_000, old: 1_490_000, art: ["jacket", "2A2A33"],
    variants: ["M", "L", "XL"].map((s, i) => ({ uz: s, ru: s, opt: { size: s }, stock: [7, 9, 3][i], hex: "2A2A33" })),
    specs: [["Harorat", "Температура", "-25°C gacha"], ["Material", "Материал", "Poliester"]],
    kw: "kurtka куртка jacket qishki",
  },
  {
    slug: "krossovka-runner", cat: "poyabzal", shop: "moda", f: "FBS", w: 800, sold: 315,
    uz: "Yugurish uchun krossovka Runner", ru: "Беговые кроссовки Runner",
    dUz: "Yengil, nafas oluvchi to‘r va amortizatsiyalovchi taglik. Kundalik yugurish va yurish uchun.",
    dRu: "Лёгкий дышащий верх и амортизирующая подошва. Для ежедневного бега и прогулок.",
    price: 689_000, old: 890_000, art: ["sneaker", "1FA463"],
    variants: ["40", "41", "42", "43", "44"].map((s, i) => ({ uz: s, ru: s, opt: { size: s }, stock: [5, 8, 12, 9, 4][i], hex: "1FA463" })),
    specs: [["Ustki qism", "Верх", "Tekstil to‘r"], ["Taglik", "Подошва", "EVA"]],
    kw: "krossovka кроссовки sneaker oyoq kiyim",
  },
  {
    slug: "charm-sumka-tote", cat: "sumkalar", shop: "moda", f: "FBS", w: 700, madeInUz: true, sold: 76,
    uz: "Charm sumka Tote, qo‘lda tikilgan", ru: "Кожаная сумка Tote ручной работы",
    dUz: "Buxoro ustalari tomonidan tabiiy charmdan tikilgan sig‘imli sumka.",
    dRu: "Вместительная сумка из натуральной кожи, сшитая бухарскими мастерами.",
    price: 449_000, art: ["bag", "B5651D"], specs: [["Material", "Материал", "Tabiiy charm"], ["O‘lcham", "Размер", "38×30×12 sm"]],
    variants: [{ uz: "Jigarrang", ru: "Коричневый", stock: 11, hex: "B5651D" }],
    kw: "sumka сумка bag charm",
  },
  // ── Home ──
  {
    slug: "divan-samarqand", cat: "mebel", shop: "moda", f: "DBS", w: 65000, madeInUz: true, sold: 23,
    uz: "Uch o‘rindiqli divan «Samarqand»", ru: "Трёхместный диван «Самарканд»",
    dUz: "Mustahkam yog‘och karkas, velur qoplama. Toshkentda tayyorlangan, sotuvchi o‘zi yetkazib beradi.",
    dRu: "Прочный деревянный каркас, велюровая обивка. Изготовлен в Ташкенте, доставка силами продавца.",
    price: 5_890_000, old: 6_490_000, art: ["sofa", "1D6B5C"], specs: [["O‘lcham", "Размер", "220×90×85 sm"], ["Qoplama", "Обивка", "Velur"]],
    variants: [
      { uz: "Zumrad", ru: "Изумрудный", opt: { color: "green" }, stock: 3, hex: "1D6B5C" },
      { uz: "Kulrang", ru: "Серый", opt: { color: "grey" }, stock: 4, hex: "6B6B76" },
    ],
    kw: "divan диван mebel мебель",
  },
  {
    slug: "stol-chirogi-led", cat: "yoritish", shop: "moda", f: "FBS", w: 900, sold: 141,
    uz: "LED stol chirog‘i, yorug‘lik sozlanadi", ru: "Настольная LED-лампа с регулировкой",
    dUz: "Ko‘zni charchatmaydigan yorug‘lik, 5 rejim va USB quvvatlash.",
    dRu: "Свет без мерцания, 5 режимов и зарядка по USB.",
    price: 239_000, old: 299_000, art: ["lamp", "E26D5C"], specs: [["Rejimlar", "Режимы", "5"], ["Quvvat", "Мощность", "10 W"]],
    variants: [{ uz: "Marjon", ru: "Коралловый", stock: 25, hex: "E26D5C" }],
    kw: "chiroq лампа lamp",
  },
  {
    slug: "tefal-kostryulka-to-plami", cat: "oshxona-anjomlari", shop: "techhub", brand: "tefal", f: "FBO", w: 4200, sold: 158,
    uz: "Tefal idishlar to‘plami, 9 dona", ru: "Набор посуды Tefal, 9 предметов",
    dUz: "Titan qoplamali skovorodka va kastryulkalar, induksion plitaga mos.",
    dRu: "Сковороды и кастрюли с титановым покрытием, подходят для индукции.",
    price: 1_290_000, old: 1_590_000, art: ["pan", "2A2A33"], specs: [["Dona", "Предметов", "9"], ["Plita", "Плиты", "Barcha turdagi / Все типы"]],
    variants: [{ uz: "Qora", ru: "Чёрный", stock: 18, hex: "0E8C8C" }],
    kw: "idish посуда kastryulka skovoroda",
  },
  {
    slug: "paxta-choyshab-to-plami", cat: "toqimachilik", shop: "moda", f: "FBS", w: 2200, madeInUz: true, sold: 202,
    uz: "Paxta choyshab to‘plami, 2 kishilik", ru: "Комплект постельного белья из хлопка, 2-спальный",
    dUz: "100% O‘zbekiston paxtasi, ranforс. Yuvishdan keyin rangi o‘chmaydi.",
    dRu: "100% узбекский хлопок, ранфорс. Не теряет цвет после стирок.",
    price: 559_000, old: 690_000, art: ["pillow", "0E8C8C"], specs: [["Material", "Материал", "Ranfors, 100% paxta"], ["O‘lcham", "Размер", "2 kishilik / 2-спальный"]],
    variants: [
      { uz: "Feruza", ru: "Бирюзовый", opt: { color: "turquoise" }, stock: 20, hex: "0E8C8C" },
      { uz: "Anor", ru: "Гранатовый", opt: { color: "red" }, stock: 14, hex: "C8102E" },
    ],
    kw: "choyshab постельное белье paxta хлопок",
  },
  // ── Beauty ──
  {
    slug: "atir-oud-samarkand", cat: "parfyumeriya", shop: "moda", f: "FBS", w: 350, sold: 133,
    uz: "Atir «Oud Samarkand», 100 ml", ru: "Парфюм «Oud Samarkand», 100 мл",
    dUz: "Oud, za’faron va atirgul notalari bilan sharqona atir. Uniseks.",
    dRu: "Восточный аромат с нотами уда, шафрана и розы. Унисекс.",
    price: 889_000, old: 1_090_000, art: ["perfume", "B5651D"], halal: true, specs: [["Hajm", "Объём", "100 ml"], ["Notalar", "Ноты", "Oud, za’faron, atirgul"]],
    variants: [{ uz: "100 ml", ru: "100 мл", stock: 22, hex: "B5651D" }],
    kw: "atir парфюм духи perfume",
  },
  {
    slug: "yuz-kremi-anor-ekstrakti", cat: "teri-parvarishi", shop: "moda", f: "FBS", w: 200, halal: true, madeInUz: true, sold: 274,
    uz: "Anor ekstraktli yuz kremi, 50 ml", ru: "Крем для лица с экстрактом граната, 50 мл",
    dUz: "Antioksidantlarga boy namlovchi krem. Halol sertifikatlangan, O‘zbekistonda ishlab chiqarilgan.",
    dRu: "Увлажняющий крем, богатый антиоксидантами. Сертифицирован как халяль, произведён в Узбекистане.",
    price: 165_000, old: 199_000, art: ["cream", "C8102E"], specs: [["Hajm", "Объём", "50 ml"], ["Teri turi", "Тип кожи", "Barcha / Все"]],
    variants: [{ uz: "50 ml", ru: "50 мл", stock: 70, hex: "C8102E" }],
    kw: "krem крем yuz лицо anor гранат",
  },
  {
    slug: "matte-lab-pomada", cat: "kosmetika", shop: "moda", f: "FBS", w: 50, halal: true, sold: 389,
    uz: "Mat lab bo‘yog‘i Velvet", ru: "Матовая помада Velvet",
    dUz: "Uzoq saqlanadigan mat lab bo‘yog‘i, 8 soatgacha.",
    dRu: "Стойкая матовая помада, до 8 часов.",
    price: 119_000, art: ["lipstick", "B0213A"],
    variants: [
      { uz: "Anor qizil", ru: "Гранатовый", opt: { color: "red" }, stock: 45, hex: "B0213A" },
      { uz: "Nude", ru: "Нюд", opt: { color: "nude" }, stock: 30, hex: "C98B76" },
    ],
    specs: [["Turi", "Тип", "Mat"], ["Saqlanish", "Стойкость", "8 soat"]],
    kw: "pomada помада lab",
  },
  // ── Kids ──
  {
    slug: "yumshoq-ayiqcha", cat: "oyinchoqlar", shop: "moda", f: "FBS", w: 400, sold: 410,
    uz: "Yumshoq o‘yinchoq ayiqcha, 40 sm", ru: "Мягкая игрушка мишка, 40 см",
    dUz: "Gipoallergen to‘ldirgich, mashinada yuvsa bo‘ladi.",
    dRu: "Гипоаллергенный наполнитель, можно стирать в машинке.",
    price: 149_000, old: 189_000, art: ["bear", "B5651D"], specs: [["Bo‘yi", "Высота", "40 sm"], ["Yosh", "Возраст", "0+"]],
    variants: [{ uz: "Jigarrang", ru: "Коричневый", stock: 50, hex: "B5651D" }],
    kw: "o‘yinchoq игрушка ayiq мишка",
  },
  {
    slug: "konstruktor-shahar", cat: "oyinchoqlar", shop: "moda", f: "FBS", w: 900, sold: 166,
    uz: "Konstruktor «Shahar», 520 detal", ru: "Конструктор «Город», 520 деталей",
    dUz: "Ijodkorlik va motorikani rivojlantiradi. 6 yoshdan.",
    dRu: "Развивает творчество и моторику. С 6 лет.",
    price: 419_000, old: 499_000, art: ["blocks", "1D4E9E"], specs: [["Detallar", "Детали", "520"], ["Yosh", "Возраст", "6+"]],
    variants: [{ uz: "Standart", ru: "Стандарт", stock: 28, hex: "1D4E9E" }],
    kw: "konstruktor конструктор lego",
  },
  {
    slug: "aravacha-3in1", cat: "aravachalar", shop: "moda", f: "DBS", w: 12000, sold: 31,
    uz: "Bolalar aravachasi 3 in 1", ru: "Детская коляска 3 в 1",
    dUz: "Beshik, sayr bloki va avtokreslo. Yengil alyuminiy rama.",
    dRu: "Люлька, прогулочный блок и автокресло. Лёгкая алюминиевая рама.",
    price: 2_390_000, old: 2_790_000, art: ["stroller", "2A2A33"], specs: [["Vazn", "Вес", "11,5 kg"], ["Yosh", "Возраст", "0–3 yosh"]],
    variants: [{ uz: "Grafit", ru: "Графит", stock: 6, hex: "2A2A33" }],
    kw: "aravacha коляска",
  },
  {
    slug: "bolalar-futbolkasi", cat: "bolalar-kiyimi", shop: "moda", brand: "anor-basics", f: "FBS", w: 150, madeInUz: true, sold: 523,
    uz: "Bolalar futbolkasi, organik paxta", ru: "Детская футболка, органический хлопок",
    dUz: "Yumshoq organik paxta, terini qichitmaydi. O‘zbekistonda tikilgan.",
    dRu: "Мягкий органический хлопок, не раздражает кожу. Сшито в Узбекистане.",
    price: 89_000, old: 119_000, art: ["tshirt", "F5B301"],
    variants: ["92", "104", "116", "128"].map((s, i) => ({ uz: `${s} sm`, ru: `${s} см`, opt: { size: s }, stock: [20, 25, 18, 12][i], hex: "F5B301" })),
    specs: [["Material", "Материал", "100% organik paxta"]],
    wholesale: [{ minQty: 10, price: 72_000 }, { minQty: 50, price: 61_000 }],
    kw: "futbolka футболка bolalar дети",
  },
  // ── Grocery (Samarqand Ne'matlari) ──
  {
    slug: "kuk-choy-95", cat: "choy-qahva", shop: "nematlar", f: "FBO", w: 120, halal: true, madeInUz: true, sold: 1240,
    uz: "Ko‘k choy №95, 100 g", ru: "Зелёный чай №95, 100 г",
    dUz: "Klassik o‘zbek ko‘k choyi. Piyolada tiniq, xushbo‘y.",
    dRu: "Классический узбекский зелёный чай. Прозрачный и ароматный в пиале.",
    price: 18_000, art: ["tea", "1FA463"], specs: [["Vazn", "Вес", "100 g"], ["Turi", "Сорт", "Ko‘k choy"]],
    variants: [{ uz: "100 g", ru: "100 г", stock: 500, hex: "1FA463" }],
    wholesale: [{ minQty: 20, price: 15_000 }, { minQty: 100, price: 13_000 }],
    kw: "choy чай ko‘k zelenyi 95 green tea",
  },
  {
    slug: "quritilgan-orik-1kg", cat: "quruq-mevalar", shop: "nematlar", f: "FBO", w: 1050, halal: true, madeInUz: true, sold: 860,
    uz: "Quritilgan o‘rik (turshak), 1 kg", ru: "Курага (туршак), 1 кг",
    dUz: "Farg‘ona vodiysi o‘riklari, quyoshda quritilgan, oltingugurtsiz.",
    dRu: "Абрикосы Ферганской долины, высушены на солнце, без серы.",
    price: 95_000, old: 115_000, art: ["nuts", "F5B301"], specs: [["Vazn", "Вес", "1 kg"], ["Kelib chiqishi", "Происхождение", "Farg‘ona"]],
    variants: [{ uz: "1 kg", ru: "1 кг", stock: 300, hex: "F5B301" }],
    wholesale: [{ minQty: 10, price: 82_000 }],
    kw: "o‘rik курага turshak quruq meva сухофрукты",
  },
  {
    slug: "pista-qovurilgan-500g", cat: "quruq-mevalar", shop: "nematlar", f: "FBO", w: 520, halal: true, sold: 344,
    uz: "Qovurilgan pista, 500 g", ru: "Фисташки жареные, 500 г",
    dUz: "Yengil tuzlangan, yirik pista.",
    dRu: "Крупные фисташки, слегка подсоленные.",
    price: 129_000, old: 149_000, art: ["nuts", "8BC34A"], specs: [["Vazn", "Вес", "500 g"]],
    variants: [{ uz: "500 g", ru: "500 г", stock: 180, hex: "8BC34A" }],
    kw: "pista фисташки yong‘oq орехи",
  },
  {
    slug: "tog-asali-1kg", cat: "asal-shirinliklar", shop: "nematlar", f: "FBO", w: 1300, halal: true, madeInUz: true, sold: 391,
    uz: "Tog‘ asali, 1 kg", ru: "Горный мёд, 1 кг",
    dUz: "Zomin tog‘laridan tabiiy asal. Laboratoriya tekshiruvidan o‘tgan.",
    dRu: "Натуральный мёд с гор Заамина. Прошёл лабораторную проверку.",
    price: 119_000, art: ["jar", "F5B301"], specs: [["Vazn", "Вес", "1 kg"], ["Kelib chiqishi", "Происхождение", "Zomin"]],
    variants: [{ uz: "1 kg", ru: "1 кг", stock: 140, hex: "D99A00" }],
    kw: "asal мёд honey",
  },
  {
    slug: "parvarda-navat-set", cat: "asal-shirinliklar", shop: "nematlar", f: "FBO", w: 800, halal: true, madeInUz: true, sold: 205,
    uz: "Parvarda va navvot to‘plami", ru: "Набор парварды и навата",
    dUz: "An’anaviy o‘zbek shirinliklari choy uchun. Sovg‘a qutisida.",
    dRu: "Традиционные узбекские сладости к чаю. В подарочной коробке.",
    price: 69_000, art: ["gift", "C8102E"], specs: [["Vazn", "Вес", "700 g"]],
    variants: [{ uz: "700 g", ru: "700 г", stock: 90, hex: "C8102E" }],
    kw: "parvarda парварда navvot нават shirinlik сладости",
  },
  // ── Sport ──
  {
    slug: "gantel-to-plami-20kg", cat: "fitnes", shop: "techhub", f: "FBS", w: 21000, sold: 72,
    uz: "Yig‘ma gantellar to‘plami, 2×10 kg", ru: "Набор разборных гантелей, 2×10 кг",
    dUz: "Uyda mashq qilish uchun sozlanuvchi gantellar.",
    dRu: "Регулируемые гантели для домашних тренировок.",
    price: 649_000, old: 749_000, art: ["dumbbell", "C8102E"], specs: [["Vazn", "Вес", "2×10 kg"]],
    variants: [{ uz: "2×10 kg", ru: "2×10 кг", stock: 15, hex: "C8102E" }],
    kw: "gantel гантели fitnes",
  },
  {
    slug: "yoga-gilamchasi", cat: "fitnes", shop: "moda", f: "FBS", w: 900, sold: 260,
    uz: "Yoga gilamchasi, 6 mm", ru: "Коврик для йоги, 6 мм",
    dUz: "Sirpanmaydigan TPE material, tashish kamari bilan.",
    dRu: "Нескользящий материал TPE, ремень для переноски.",
    price: 179_000, art: ["mat", "6B4FBB"], specs: [["Qalinlik", "Толщина", "6 mm"]],
    variants: [
      { uz: "Binafsha", ru: "Фиолетовый", opt: { color: "purple" }, stock: 40, hex: "6B4FBB" },
      { uz: "Yashil", ru: "Зелёный", opt: { color: "green" }, stock: 22, hex: "1FA463" },
    ],
    kw: "yoga йога gilamcha коврик",
  },
  {
    slug: "velosiped-city-28", cat: "velosipedlar", shop: "techhub", f: "FBS", w: 15000, sold: 39,
    uz: "Shahar velosipedi City 28\"", ru: "Городской велосипед City 28\"",
    dUz: "7 tezlik, alyuminiy rama, savat bilan.",
    dRu: "7 скоростей, алюминиевая рама, с корзиной.",
    price: 3_190_000, old: 3_590_000, art: ["bike", "1D4E9E"], specs: [["G‘ildirak", "Колёса", "28\""], ["Tezliklar", "Скорости", "7"]],
    variants: [{ uz: "Ko‘k", ru: "Синий", stock: 5, hex: "1D4E9E" }],
    kw: "velosiped велосипед bike",
  },
  {
    slug: "futbol-to-pi-pro", cat: "jamoaviy-sport", shop: "techhub", f: "FBS", w: 450, sold: 301,
    uz: "Futbol to‘pi Pro, 5-o‘lcham", ru: "Футбольный мяч Pro, размер 5",
    dUz: "Termo-yopishtirilgan panellar, rasmiy o‘lcham va vazn.",
    dRu: "Термосклеенные панели, официальный размер и вес.",
    price: 229_000, art: ["ball", "C8102E"], specs: [["O‘lcham", "Размер", "5"]],
    variants: [{ uz: "5", ru: "5", stock: 60, hex: "C8102E" }],
    kw: "to‘p мяч futbol футбол",
  },
  // ── Crafts (Hunarmand Ustaxonasi) ──
  {
    slug: "rishton-lagan-katta", cat: "kulolchilik", shop: "hunarmand", brand: "rishton-ceramics", f: "DBS", w: 2500, madeInUz: true, sold: 64, video: true,
    uz: "Rishton lagani, 36 sm, qo‘lda bo‘yalgan", ru: "Риштанский ляган, 36 см, ручная роспись",
    dUz: "Rishtonlik usta Abdulla aka ustaxonasida ishqor sirli an’anaviy kobalt va feruza naqshlar bilan tayyorlangan. Har bir lagan — yagona nusxa.",
    dRu: "Изготовлен в мастерской риштанского мастера Абдуллы-ака с традиционной кобальтовой и бирюзовой росписью под щелочной глазурью. Каждый ляган уникален.",
    price: 349_000, art: ["plate", "0E8C8C"], specs: [["Diametr", "Диаметр", "36 sm"], ["Usta", "Мастер", "Rishton"], ["Sir", "Глазурь", "Ishqor (ishkor)"]],
    variants: [{ uz: "36 sm", ru: "36 см", stock: 8, hex: "0E8C8C" }],
    kw: "lagan ляган rishton риштан kulolchilik керамика plate",
  },
  {
    slug: "rishton-kosa-to-plami", cat: "kulolchilik", shop: "hunarmand", brand: "rishton-ceramics", f: "DBS", w: 1600, madeInUz: true, sold: 112,
    uz: "Rishton piyola va kosa to‘plami, 6 dona", ru: "Набор риштанских пиал и кос, 6 шт.",
    dUz: "Choy dasturxoni uchun qo‘lda bo‘yalgan piyolalar.",
    dRu: "Пиалы ручной росписи для чайного дастархана.",
    price: 279_000, old: 320_000, art: ["bowl", "C8102E"], specs: [["Dona", "Количество", "6"]],
    variants: [{ uz: "6 dona", ru: "6 шт.", stock: 14, hex: "C8102E" }],
    kw: "piyola пиала kosa коса",
  },
  {
    slug: "chust-doppisi", cat: "doppilar", shop: "hunarmand", f: "DBS", w: 150, madeInUz: true, sold: 98,
    uz: "Chust do‘ppisi, qalampir naqshli", ru: "Чустская тюбетейка с узором «калампир»",
    dUz: "Qora fonda oq «qalampir» naqshli an’anaviy Chust do‘ppisi. Qo‘lda tikilgan.",
    dRu: "Традиционная чустская тюбетейка с белым узором «калампир» на чёрном фоне. Ручная вышивка.",
    price: 189_000, art: ["cap", "1D4E9E"],
    variants: ["56", "57", "58", "59"].map((s, i) => ({ uz: s, ru: s, opt: { size: s }, stock: [4, 7, 6, 3][i], hex: "1D4E9E" })),
    specs: [["Tikilgan", "Вышивка", "Qo‘lda / Ручная"]],
    kw: "do‘ppi тюбетейка chust чуст",
  },
  {
    slug: "margilon-atlas-5m", cat: "atlas-adras", shop: "hunarmand", brand: "margilon-silk", f: "DBS", w: 900, madeInUz: true, sold: 57,
    uz: "Marg‘ilon atlasi, 5 metr", ru: "Маргиланский атлас, 5 метров",
    dUz: "Yodgorlik fabrikasida abr usulida bo‘yalgan tabiiy ipak.",
    dRu: "Натуральный шёлк, окрашенный в технике абр на фабрике «Ёдгорлик».",
    price: 649_000, art: ["atlas", "C8102E"], specs: [["Uzunlik", "Длина", "5 m"], ["Material", "Материал", "100% ipak / шёлк"]],
    variants: [
      { uz: "Anor", ru: "Гранат", opt: { color: "red" }, stock: 10, hex: "C8102E" },
      { uz: "Moviy", ru: "Синий", opt: { color: "blue" }, stock: 6, hex: "1D4E9E" },
    ],
    kw: "atlas атлас ipak шёлк adras margilon",
  },
  {
    slug: "buxoro-so-zana", cat: "suzani", shop: "hunarmand", f: "DBS", w: 1500, madeInUz: true, sold: 12,
    uz: "Buxoro so‘zanasi, devoriy, 2×1,5 m", ru: "Бухарское сюзане, настенное, 2×1,5 м",
    dUz: "Ipak iplar bilan qo‘lda kashta tikilgan so‘zana. Tayyorlash muddati — 3 oy.",
    dRu: "Сюзане ручной вышивки шёлковыми нитями. Срок изготовления — 3 месяца.",
    price: 2_790_000, art: ["suzani", "C8102E"], specs: [["O‘lcham", "Размер", "200×150 sm"], ["Iplar", "Нити", "Ipak"]],
    variants: [{ uz: "200×150 sm", ru: "200×150 см", stock: 2, hex: "C8102E" }],
    kw: "so‘zana сюзане suzani kashta",
  },
  {
    slug: "samarqand-gilami", cat: "suzani", shop: "hunarmand", f: "DBS", w: 9000, madeInUz: true, sold: 6,
    uz: "Samarqand gilami, qo‘l to‘qima, 2×3 m", ru: "Самаркандский ковёр ручной работы, 2×3 м",
    dUz: "Jun va ipak aralash, tabiiy bo‘yoqlar.",
    dRu: "Шерсть с шёлком, натуральные красители.",
    price: 4_490_000, art: ["carpet", "8E0B22"], specs: [["O‘lcham", "Размер", "200×300 sm"], ["Material", "Материал", "Jun + ipak"]],
    variants: [{ uz: "2×3 m", ru: "2×3 м", stock: 1, hex: "8E0B22" }],
    kw: "gilam ковёр carpet",
  },
  {
    slug: "chust-pichog-i", cat: "pichoqlar", shop: "hunarmand", f: "DBS", w: 300, madeInUz: true, sold: 141,
    uz: "Chust pichog‘i, shox sopli", ru: "Чустский нож с роговой рукоятью",
    dUz: "An’anaviy Chust pichog‘i, qo‘lda toblangan po‘lat va naqshli dasta. G‘ilof bilan.",
    dRu: "Традиционный чустский нож из закалённой вручную стали с узорной рукоятью. С ножнами.",
    price: 259_000, art: ["knife", "B5651D"], specs: [["Tig‘", "Клинок", "16 sm"], ["Dasta", "Рукоять", "Shox / Рог"]],
    variants: [{ uz: "16 sm", ru: "16 см", stock: 18, hex: "B5651D" }],
    kw: "pichoq нож chust чуст",
  },
  // ── Books ──
  {
    slug: "o-tkan-kunlar", cat: "badiiy", shop: "nematlar", f: "FBO", w: 500, madeInUz: true, sold: 333,
    uz: "Abdulla Qodiriy — «O‘tkan kunlar»", ru: "Абдулла Кадыри — «Минувшие дни»",
    dUz: "O‘zbek adabiyotining birinchi romani. Qattiq muqova.",
    dRu: "Первый узбекский роман. Твёрдый переплёт.",
    price: 85_000, art: ["book", "1D4E9E"], specs: [["Sahifalar", "Страниц", "416"], ["Til", "Язык", "O‘zbek"]],
    variants: [
      { uz: "Lotin yozuvi", ru: "Латиница", opt: { script: "latin" }, stock: 80, hex: "1D4E9E" },
      { uz: "Kirill yozuvi", ru: "Кириллица", opt: { script: "cyrillic" }, stock: 40, hex: "8E0B22" },
    ],
    kw: "kitob книга qodiriy o‘tkan kunlar roman",
  },
  {
    slug: "ertaklar-to-plami", cat: "bolalar-kitoblari", shop: "nematlar", f: "FBO", w: 600, madeInUz: true, sold: 211,
    uz: "O‘zbek xalq ertaklari, rasmli", ru: "Узбекские народные сказки, с иллюстрациями",
    dUz: "Bolalar uchun rangli rasmlar bilan 30 ta ertak.",
    dRu: "30 сказок с цветными иллюстрациями для детей.",
    price: 55_000, art: ["book", "F5B301"], specs: [["Sahifalar", "Страниц", "160"]],
    variants: [{ uz: "Standart", ru: "Стандарт", stock: 70, hex: "F5B301" }],
    kw: "ertak сказки kitob книга bolalar",
  },
  // ── Auto ──
  {
    slug: "qishki-shina-205-55-r16", cat: "shinalar", shop: "techhub", f: "FBS", w: 9000, sold: 84,
    uz: "Qishki shina 205/55 R16", ru: "Зимняя шина 205/55 R16",
    dUz: "Shiplanmagan qishki shina, muz va qorda yaxshi ilashish.",
    dRu: "Нешипованная зимняя шина, уверенное сцепление на льду и снегу.",
    price: 1_090_000, old: 1_190_000, art: ["tire", "2A2A33"], specs: [["O‘lcham", "Размер", "205/55 R16"], ["Mavsum", "Сезон", "Qish / Зима"]],
    variants: [{ uz: "1 dona", ru: "1 шт.", stock: 40, hex: "2A2A33" }],
    wholesale: [{ minQty: 4, price: 990_000 }],
    kw: "shina шина balon",
  },
  {
    slug: "telefon-ushlagich-magnit", cat: "avto-aksessuarlar", shop: "techhub", f: "FBO", w: 150, sold: 702,
    uz: "Avtomobil uchun magnitli telefon ushlagich", ru: "Магнитный держатель телефона в авто",
    dUz: "Havo panjarasiga o‘rnatiladi, 360° aylanadi.",
    dRu: "Крепится на воздуховод, вращается на 360°.",
    price: 95_000, old: 129_000, art: ["holder", "C8102E"], specs: [["Mahkamlash", "Крепление", "Havo panjarasi"]],
    variants: [{ uz: "Qora", ru: "Чёрный", stock: 200, hex: "C8102E" }],
    kw: "ushlagich держатель telefon avto",
  },
  {
    slug: "iphone-13-used-a", cat: "smartfonlar", shop: "techhub", brand: "apple", f: "FBO", w: 300, sold: 47, condition: "USED_A",
    uz: "Apple iPhone 13 128 GB (ishlatilgan, A daraja)", ru: "Apple iPhone 13 128 ГБ (б/у, класс A)",
    dUz: "Trade-in orqali qabul qilingan, diagnostikadan o‘tgan. Batareya 89%. 6 oy kafolat.",
    dRu: "Принят по trade-in, прошёл диагностику. Батарея 89%. Гарантия 6 месяцев.",
    price: 5_490_000, old: 6_290_000, art: ["phone", "1D6B5C"], specs: [["Holat", "Состояние", "A — deyarli yangi"], ["Batareya", "Батарея", "89%"]],
    variants: [{ uz: "128 GB · Yashil", ru: "128 ГБ · Зелёный", stock: 3, hex: "1D6B5C" }],
    kw: "ayfon айфон iphone 13 б/у ishlatilgan",
  },
];

export const PICKUP_POINTS = [
  { code: "TAS-CHL-01", name: "ANOR Chilonzor", region: "toshkent_sh", city: "Toshkent", district: "Chilonzor", address: "Chilonzor 9-kvartal, Bunyodkor ko‘chasi 12", lat: 41.2756, lng: 69.2034 },
  { code: "TAS-YNS-01", name: "ANOR Yunusobod", region: "toshkent_sh", city: "Toshkent", district: "Yunusobod", address: "Yunusobod 4-mavze, Amir Temur shoh ko‘chasi 107", lat: 41.3646, lng: 69.2881 },
  { code: "TAS-MRZ-01", name: "ANOR Mirzo Ulug‘bek", region: "toshkent_sh", city: "Toshkent", district: "Mirzo Ulug‘bek", address: "Buyuk Ipak Yo‘li ko‘chasi 154", lat: 41.3265, lng: 69.3355 },
  { code: "TAS-SRG-01", name: "ANOR Sergeli", region: "toshkent_sh", city: "Toshkent", district: "Sergeli", address: "Sergeli 6-mavze, Yangi Sergeli ko‘chasi 28", lat: 41.2275, lng: 69.2201 },
  { code: "TAS-YAK-01", name: "ANOR Yakkasaroy", region: "toshkent_sh", city: "Toshkent", district: "Yakkasaroy", address: "Shota Rustaveli ko‘chasi 45", lat: 41.2917, lng: 69.2605 },
  { code: "SAM-01", name: "ANOR Samarqand Markaz", region: "samarqand", city: "Samarqand", district: "Markaz", address: "Universitet xiyoboni 15", lat: 39.6542, lng: 66.9597 },
  { code: "BUX-01", name: "ANOR Buxoro", region: "buxoro", city: "Buxoro", district: "Markaz", address: "Mustaqillik ko‘chasi 33", lat: 39.7747, lng: 64.4286 },
  { code: "FER-01", name: "ANOR Farg‘ona", region: "fargona", city: "Farg‘ona", district: "Markaz", address: "Al-Farg‘oniy ko‘chasi 20", lat: 40.3864, lng: 71.7864 },
  { code: "AND-01", name: "ANOR Andijon", region: "andijon", city: "Andijon", district: "Markaz", address: "Navoiy shoh ko‘chasi 41", lat: 40.7821, lng: 72.3442 },
  { code: "NAM-01", name: "ANOR Namangan", region: "namangan", city: "Namangan", district: "Markaz", address: "Uychi ko‘chasi 8", lat: 40.9983, lng: 71.6726 },
  { code: "NUK-01", name: "ANOR Nukus", region: "qoraqalpogiston", city: "Nukus", district: "Markaz", address: "Doslıq guzarı 5", lat: 42.4619, lng: 59.6166 },
  { code: "QAR-01", name: "ANOR Qarshi", region: "qashqadaryo", city: "Qarshi", district: "Markaz", address: "Islom Karimov ko‘chasi 210", lat: 38.8606, lng: 65.7891 },
];
