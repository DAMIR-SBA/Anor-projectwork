// Shopping-assistant query understanding without AI: budget, category, features and intent from
// free text in Uzbek (Latin/Cyrillic), Russian or English. Gemini replaces this when configured.
import { cyrillicToLatin } from "./translit";

export type Intent = {
  kind: "search" | "compare" | "question" | "greeting";
  query: string;
  category: string | null;
  minPrice?: number;
  maxPrice?: number;
  features: string[];
  sort?: "price_asc" | "price_desc" | "rating" | "popular";
};

/** Category slug ← keywords (stems; matched against the lower-cased, Latin-transliterated text). */
export const CATEGORY_WORDS: Array<[string, string[]]> = [
  ["noutbuklar", ["noutbuk", "laptop", "ноутбук", "notebook", "macbook"]],
  ["smartfonlar", ["smartfon", "telefon", "смартфон", "телефон", "phone", "iphone"]],
  ["planshetlar", ["planshet", "планшет", "tablet", "ipad"]],
  ["quloqchinlar", ["quloqchin", "наушник", "naushnik", "headphone", "earbud", "airpods"]],
  ["aqlli-soatlar", ["aqlli soat", "smart soat", "смарт-час", "умные час", "smartwatch", "watch", "фитнес-браслет"]],
  ["televizorlar", ["televizor", "телевизор", " tv", "телек"]],
  ["muzlatgichlar", ["muzlatgich", "холодильник", "fridge"]],
  ["kir-yuvish", ["kir yuvish", "стиральн", "washing"]],
  ["changyutgichlar", ["changyutgich", "пылесос", "vacuum"]],
  ["oshxona-texnikasi", ["choynak", "чайник", "blender", "блендер", "multivarka", "мультиварк", "kettle"]],
  ["poyabzal", ["poyabzal", "krossovka", "кроссовк", "обувь", "туфли", "sneaker", "shoe", "botinka"]],
  ["sumkalar", ["sumka", "сумк", "рюкзак", "ryukzak", "bag", "backpack"]],
  ["ayollar-kiyimi", ["ko‘ylak", "koylak", "платье", "ayollar kiyim", "женская одежд", "dress"]],
  ["erkaklar-kiyimi", ["erkaklar kiyim", "мужская одежд", "kurtka", "куртк", "jacket", "shirt", "рубашк"]],
  ["bolalar-kiyimi", ["bolalar kiyim", "детская одежд"]],
  ["oyinchoqlar", ["o‘yinchoq", "oyinchoq", "игрушк", "toy", "lego", "konstruktor"]],
  ["kosmetika", ["kosmetika", "косметик", "помад", "lipstick", "makeup"]],
  ["parfyumeriya", ["atir", "parfyum", "духи", "парфюм", "perfume"]],
  ["teri-parvarishi", ["krem", "крем", "cream", "skincare"]],
  ["choy-qahva", ["choy", "чай", "qahva", "кофе", "coffee", "tea"]],
  ["asal-shirinliklar", ["asal", "мёд", "мед", "honey", "shirinlik", "сладост"]],
  ["quruq-mevalar", ["quruq meva", "сухофрукт", "yong‘oq", "орех", "nuts", "mayiz", "изюм"]],
  ["velosipedlar", ["velosiped", "велосипед", "bike", "bicycle"]],
  ["fitnes", ["gantel", "гантел", "fitnes", "фитнес", "yoga", "йога", "dumbbell"]],
  ["mebel", ["mebel", "мебел", "divan", "диван", "sofa", "kreslo", "кресло"]],
  ["yoritish", ["chiroq", "лампа", "светильник", "lamp"]],
  ["atlas-adras", ["atlas", "adras", "атлас", "адрас"]],
  ["suzani", ["suzani", "сюзане", "сузане"]],
  ["kulolchilik", ["kulol", "керамик", "ceramic", "piyola", "пиала", "lagan", "ляган"]],
  ["doppilar", ["do‘ppi", "doppi", "тюбетейк"]],
  ["pichoqlar", ["pichoq", "нож", "knife"]],
  ["shinalar", ["shina", "шин", "tire", "tyre"]],
  ["avto-aksessuarlar", ["avto", "авто", "car "]],
  ["foto-video", ["kamera", "камер", "camera", "fotoapparat", "фотоаппарат"]],
  ["badiiy", ["kitob", "книг", "book", "roman", "роман"]],
];

/** Purpose words → feature hints used to rank and explain results. */
const FEATURE_WORDS: Array<[string, string[]]> = [
  ["study", ["o‘qish", "oqish", "talaba", "учеб", "учёб", "студент", "study", "school", "maktab"]],
  ["gaming", ["o‘yin uchun", "gaming", "игров", "геймер"]],
  ["work", [" ish uchun", "ofis", "для работы", "офис", " work", "business"]],
  ["kids", ["bola", "farzand", "ребён", "ребен", "детск", "kid", "child"]],
  ["gift", ["sovg‘a", "sovga", "подар", "gift"]],
  ["camera", ["kamerasi yaxshi", "хорошая камера", "good camera", "selfi"]],
  ["battery", ["batareya", "батаре", "аккумулятор", "battery", "zaryad"]],
  ["halal", ["halol", "halal", "халял"]],
];

const COMPARE = /(solishtir|taqqosla|сравн|compare|\bvs\b|qaysi biri yaxshi|что лучше|which is better)/i;
const QUESTION = /(\?|bormi|bor mi|qancha|qanday|есть ли|сколько|какой|какая|does it|is there|how much)/i;
const GREETING = /^(salom|assalomu|привет|здравствуй|hello|hi)\b/i;
const CHEAP = /(arzon|дешев|недорог|cheap|budget)/i;
const BEST = /(eng yaxshi|лучш|\btop\b|\bbest\b|reyting)/i;

const MILLION = "(?:million|mln|млн|миллион|m\\b)";
const THOUSAND = "(?:ming|тыс|тысяч|k\\b)";

function toNumber(num: string, unit: string | undefined): number {
  const n = parseFloat(num.replace(/\s/g, "").replace(",", "."));
  if (!unit) return n;
  return new RegExp(MILLION, "i").test(unit) ? n * 1_000_000 : new RegExp(THOUSAND, "i").test(unit) ? n * 1_000 : n;
}

/** Budget from phrases like "8 mln gacha", "до 8 млн", "2-5 million", "500 ming so‘mdan", "under 3m". */
export function parseBudget(raw: string): { min?: number; max?: number } {
  const text = raw.toLowerCase().replace(/(\d)\s(?=\d{3}\b)/g, "$1");
  const amount = `(\\d+(?:[.,]\\d+)?)\\s*(${MILLION}|${THOUSAND})?`;
  const range = new RegExp(`${amount}\\s*(?:-|–|—|dan|до|to)\\s*${amount}`, "i").exec(text);
  if (range) {
    const a = toNumber(range[1], range[2] ?? range[4]);
    const b = toNumber(range[3], range[4]);
    if (a > 0 && b > a) return { min: a < 10_000 ? a * (range[4] ? toNumber("1", range[4]) : 1) : a, max: b };
  }
  const max = new RegExp(`(?:до|under|below|up to|gacha|dan arzon|не дороже)\\s*${amount}|${amount}\\s*(?:so[‘'’]?m|сум|sum)?\\s*(?:gacha|dan arzon|гача)`, "i").exec(text);
  if (max) {
    const v = max[1] ? toNumber(max[1], max[2]) : toNumber(max[3], max[4]);
    if (v >= 10_000) return { max: v };
  }
  const min = new RegExp(`(?:от|from|above|over)\\s*${amount}|${amount}\\s*(?:so[‘'’]?m|сум)?\\s*dan\\s*(?:qimmat|yuqori)`, "i").exec(text);
  if (min) {
    const v = min[1] ? toNumber(min[1], min[2]) : toNumber(min[3], min[4]);
    if (v >= 10_000) return { min: v };
  }
  // A lone amount with a unit ("8 mln") reads as a ceiling.
  const lone = new RegExp(amount, "i").exec(text);
  if (lone?.[2]) {
    const v = toNumber(lone[1], lone[2]);
    if (v >= 10_000) return { max: v };
  }
  return {};
}

const STOP = new Set(["uchun", "kerak", "menga", "bir", "va", "bilan", "gacha", "dan", "som", "so‘m", "so'm", "sum", "mln", "million", "ming", "eng", "yaxshi", "arzon", "bu", "shu", "bormi", "qanday", "qancha", "solishtir", "taqqosla", "для", "мне", "нужен", "нужна", "нужно", "до", "от", "сум", "млн", "и", "с", "в", "на", "есть", "ли", "сравни", "a", "an", "the", "for", "i", "need", "want", "up", "to", "under", "from", "with", "please", "iltimos", "pls", "compare", "vs"]);

/** Words that describe the purpose rather than the product: kept as features, not search terms. */
const PURPOSE_STEMS = FEATURE_WORDS.flatMap(([, words]) => words.map((w) => w.trim().slice(0, 5)));

export function parseQuery(raw: string): Intent {
  const text = raw.trim();
  const lower = ` ${cyrillicToLatin(text.toLowerCase())} ${text.toLowerCase()} `;
  if (GREETING.test(text) && text.length < 25) return { kind: "greeting", query: "", category: null, features: [] };
  const budget = parseBudget(text);
  const category = CATEGORY_WORDS.find(([, words]) => words.some((w) => lower.includes(w)))?.[0] ?? null;
  const features = FEATURE_WORDS.filter(([, words]) => words.some((w) => lower.includes(w))).map(([k]) => k);
  const kind: Intent["kind"] = COMPARE.test(text) ? "compare" : QUESTION.test(text) && !budget.max && !budget.min ? "question" : "search";
  const catWords = category ? CATEGORY_WORDS.find(([c]) => c === category)![1] : [];
  const query = text
    .toLowerCase()
    .replace(/\d+(?:[.,]\d+)?\s*(million|mln|млн|миллион|ming|тыс|тысяч|k|m)?/gi, " ")
    .split(/[^\p{L}\p{N}‘'-]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^so[‘'’]?m/.test(w) && !catWords.some((c) => w.startsWith(c.trim().slice(0, 5))) && !PURPOSE_STEMS.some((stem) => stem.length >= 4 && w.startsWith(stem)))
    .slice(0, 6)
    .join(" ");
  return { kind, query, category, minPrice: budget.min, maxPrice: budget.max, features, sort: CHEAP.test(text) ? "price_asc" : BEST.test(text) ? "rating" : undefined };
}
