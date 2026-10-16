import "server-only";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { aiEnabled, generate, generateJson } from "@/server/ai/gemini";
import { cardsByIds, listProducts, type Filters } from "./catalog";
import { parseQuery, type Intent } from "@/lib/assistant";
import { loc, locText } from "@/lib/localized";
import { formatUZS } from "@/lib/money";
import type { ProductCardData } from "@/lib/types";

export type AssistantTurn = { role: "user" | "assistant"; text: string };
export type CompareTable = { columns: Array<{ id: string; slug: string; title: string }>; rows: Array<{ label: string; values: string[] }> };
export type AssistantReply = { text: string; products: ProductCardData[]; compare: CompareTable | null; suggestions: string[]; intent: Intent; ai: boolean };

const intentSchema = z.object({
  kind: z.enum(["search", "compare", "question", "greeting"]),
  query: z.string().max(80).default(""),
  category: z.string().nullable().default(null),
  minPrice: z.number().positive().nullish(),
  maxPrice: z.number().positive().nullish(),
  features: z.array(z.string().max(30)).max(6).default([]),
  sort: z.enum(["price_asc", "price_desc", "rating", "popular"]).nullish(),
});

const language = (locale: string) => (locale === "ru" ? "Russian" : locale === "uz-Cyrl" ? "Uzbek (Cyrillic script)" : "Uzbek (Latin script)");

/** Gemini reads the request when configured; the keyword parser is the fallback and the default. */
async function understand(message: string, history: AssistantTurn[], prev: Intent | null, categories: string[], hasContext: boolean): Promise<{ intent: Intent; ai: boolean }> {
  if (aiEnabled()) {
    const raw = await generateJson<unknown>([{ text: `Conversation so far:\n${history.slice(-6).map((h) => `${h.role}: ${h.text}`).join("\n")}\nuser: ${message}` }], {
      system: `You turn shopping requests for an Uzbek marketplace into JSON: {"kind":"search"|"compare"|"question"|"greeting","query":"short product keywords (brand/model), not purpose words","category": one of [${categories.join(", ")}] or null,"minPrice":number|null,"maxPrice":number|null (UZS; "8 mln" = 8000000),"features":["study"|"gaming"|"work"|"kids"|"gift"|"camera"|"battery"|"halal"],"sort":"price_asc"|"price_desc"|"rating"|"popular"|null}. Follow-ups ("cheaper", "only Samsung") refine the previous request. Reply with JSON only.`,
    });
    const parsed = intentSchema.safeParse(raw);
    if (parsed.success) {
      const i = parsed.data;
      return { ai: true, intent: { kind: i.kind, query: i.query, category: i.category && categories.includes(i.category) ? i.category : null, minPrice: i.minPrice ?? undefined, maxPrice: i.maxPrice ?? undefined, features: i.features, sort: i.sort ?? undefined } };
    }
  }
  const intent = parseQuery(message);
  // Without a selected product a question ("arzonrog‘i bormi?") is a refinement of the search.
  if (intent.kind === "question" && !hasContext) intent.kind = "search";
  // Follow-ups without a product type ("arzonrog‘i", "до 5 млн") keep the previous one.
  if (prev && intent.kind === "search" && !intent.category) {
    intent.category = prev.category;
    intent.minPrice ??= prev.minPrice;
    intent.maxPrice ??= intent.sort === "price_asc" && prev.maxPrice ? Math.round(prev.maxPrice * 0.8) : prev.maxPrice;
    if (!intent.query) intent.query = prev.query;
  }
  return { intent, ai: false };
}

/** Category + budget first; drop the keywords, then the category, before giving up. */
async function search(i: Intent, locale: string) {
  const base: Filters = { category: i.category ?? undefined, minPrice: i.minPrice, maxPrice: i.maxPrice, inStock: true, sort: i.sort ?? "popular", page: 1, pageSize: 6 };
  const tries: Filters[] = [{ ...base, q: i.query || undefined }, base, { ...base, category: undefined, q: i.query || undefined }];
  for (const f of tries) {
    if (!f.q && !f.category && !f.maxPrice && !f.minPrice) continue;
    const r = await listProducts(f, locale);
    if (r.items.length) return r.items;
  }
  return [];
}

async function compareTable(ids: string[], locale: string): Promise<CompareTable | null> {
  const products = await db.product.findMany({ where: { id: { in: ids.slice(0, 3) }, status: "ACTIVE" }, select: { id: true, slug: true, titleUz: true, titleRu: true, titleCyrl: true, price: true, rating: true, reviewCount: true, specs: true, shop: { select: { name: true } } } });
  if (products.length < 2) return null;
  const t = await getTranslations("assistant");
  const specs = products.map((p) => (Array.isArray(p.specs) ? (p.specs as Array<{ keyUz: string; keyRu: string; value: string }>) : []));
  const keys = [...new Set(specs.flat().map((s) => (locale === "ru" ? s.keyRu : s.keyUz)))].slice(0, 8);
  return {
    columns: products.map((p) => ({ id: p.id, slug: p.slug, title: loc(p, "title", locale) })),
    rows: [
      { label: t("cmpPrice"), values: products.map((p) => formatUZS(p.price, locale)) },
      { label: t("cmpRating"), values: products.map((p) => (p.reviewCount ? `${p.rating.toFixed(1)} (${p.reviewCount})` : "—")) },
      { label: t("cmpShop"), values: products.map((p) => locText(p.shop.name, locale)) },
      ...keys.map((k) => ({ label: locText(k, locale), values: specs.map((list) => list.find((s) => (locale === "ru" ? s.keyRu : s.keyUz) === k)?.value ?? "—") })),
    ],
  };
}

/** Answer a question about one product from its specs and description (AI, or a spec lookup). */
async function answerAboutProduct(productId: string, question: string, locale: string, ai: boolean): Promise<string> {
  const t = await getTranslations("assistant");
  const p = await db.product.findUnique({ where: { id: productId }, select: { titleUz: true, titleRu: true, titleCyrl: true, descriptionUz: true, descriptionRu: true, specs: true, price: true } });
  if (!p) return t("noContext");
  const specs = Array.isArray(p.specs) ? (p.specs as Array<{ keyUz: string; keyRu: string; value: string }>) : [];
  const title = loc(p, "title", locale);
  if (ai) {
    const text = await generate([{ text: `Product: ${title}\nPrice: ${p.price} UZS\nSpecs:\n${specs.map((s) => `${s.keyUz} / ${s.keyRu}: ${s.value}`).join("\n")}\nDescription: ${(locale === "ru" ? p.descriptionRu : p.descriptionUz)?.slice(0, 1500) ?? ""}\n\nQuestion: ${question}` }], { system: `You are a shop assistant. Answer in ${language(locale)} in 1-3 sentences using only the facts given. If the facts do not answer it, say so and suggest asking the seller.`, temperature: 0.2 });
    if (text) return text.trim();
  }
  // Loose stems so "protsessori" finds "Protsessor" and "камеры" finds "Камера".
  const words = parseQuery(question).query.split(" ").filter((w) => w.length > 1).map((w) => (w.length > 5 ? w.slice(0, w.length - 2) : w));
  const hits = specs.filter((s) => words.some((w) => `${s.keyUz} ${s.keyRu} ${s.value}`.toLowerCase().includes(w)));
  if (hits.length) return t("specAnswer", { title, facts: hits.slice(0, 3).map((s) => `${locale === "ru" ? s.keyRu : s.keyUz}: ${s.value}`).join("; ") });
  const desc = `${p.descriptionUz ?? ""} ${p.descriptionRu ?? ""}`.toLowerCase();
  if (words.some((w) => desc.includes(w))) return t("descMentions", { title, word: words.find((w) => desc.includes(w))! });
  return t("specUnknown", { title });
}

export async function assistantReply(input: { message: string; history: AssistantTurn[]; contextIds: string[]; prev: Intent | null }, locale: string): Promise<AssistantReply> {
  const t = await getTranslations("assistant");
  const cats = await db.category.findMany({ where: { isActive: true }, select: { slug: true, nameUz: true, nameRu: true, nameCyrl: true } });
  const { intent, ai } = await understand(input.message, input.history, input.prev, cats.map((c) => c.slug), input.contextIds.length > 0);
  const suggestions = [t("s1"), t("s2"), t("s3")];
  const empty = { products: [] as ProductCardData[], compare: null, intent, ai };

  if (intent.kind === "greeting") return { ...empty, text: t("greeting"), suggestions };

  if (intent.kind === "question" && input.contextIds[0]) {
    return { ...empty, text: await answerAboutProduct(input.contextIds[0], input.message, locale, ai), suggestions: [t("sCompare"), t("sCheaper")] };
  }

  if (intent.kind === "compare") {
    const ids = input.contextIds.length >= 2 ? input.contextIds : (await search(intent, locale)).slice(0, 3).map((p) => p.id);
    const table = await compareTable(ids, locale);
    if (!table) return { ...empty, text: t("compareNeedTwo"), suggestions };
    let text = t("compareIntro", { n: table.columns.length });
    if (ai) {
      const summary = await generate([{ text: `Compare for a shopper:\n${table.columns.map((c, i) => `${c.title}: ${table.rows.map((r) => `${r.label}=${r.values[i]}`).join("; ")}`).join("\n")}` }], { system: `Answer in ${language(locale)}, 2-3 sentences: who each option suits best. Use only the given facts.`, temperature: 0.3 });
      if (summary) text = summary.trim();
    }
    return { ...empty, text, compare: table, products: await cardsByIds(table.columns.map((c) => c.id), locale), suggestions: [t("sCheaper")] };
  }

  const products = await search(intent, locale);
  const cat = cats.find((c) => c.slug === intent.category);
  const budget = intent.maxPrice ? t("budgetUpTo", { amount: formatUZS(intent.maxPrice, locale) }) : intent.minPrice ? t("budgetFrom", { amount: formatUZS(intent.minPrice, locale) }) : "";
  if (!products.length) return { ...empty, text: t("nothing", { what: cat ? loc(cat, "name", locale) : input.message.slice(0, 60) }), suggestions };
  let text = t("found", { n: products.length, what: cat ? loc(cat, "name", locale) : t("products"), budget });
  if (ai) {
    const lines = products.map((p) => `- ${p.title}: ${p.price} UZS, rating ${p.rating ?? "-"} (${p.reviewCount ?? 0} reviews)`).join("\n");
    const reply = await generate([{ text: `Request: ${input.message}\nCandidates:\n${lines}` }], { system: `You are ANOR's shopping assistant. In ${language(locale)}, 2-3 short sentences: recommend from the candidates only and say why they fit the request (budget, purpose). Prices in so'm. Never invent specs.`, temperature: 0.4 });
    if (reply) text = reply.trim();
  }
  return { ...empty, text, products, suggestions: [t("sCompare"), t("sCheaper"), t("sBest")] };
}
