// Trade-in: an instant estimate from a price list and a few condition questions. The inspector
// confirms or corrects it from the photos; the payout goes to Anor Hamyon. Pure functions.

export type TradeInCategory = "smartphone" | "laptop" | "tablet" | "watch";
export type Grade = "A" | "B" | "C" | "D";

/** Grade-A buy-back prices (so‘m). Device names are the manufacturers' model names. */
export const TRADEIN_MODELS: Record<TradeInCategory, Array<{ key: string; label: string; base: number }>> = {
  smartphone: [
    { key: "iphone-15-pro", label: "Apple iPhone 15 Pro", base: 9_500_000 },
    { key: "iphone-14", label: "Apple iPhone 14", base: 6_200_000 },
    { key: "iphone-13", label: "Apple iPhone 13", base: 4_800_000 },
    { key: "iphone-12", label: "Apple iPhone 12", base: 3_500_000 },
    { key: "galaxy-s24", label: "Samsung Galaxy S24", base: 7_000_000 },
    { key: "galaxy-s23", label: "Samsung Galaxy S23", base: 5_200_000 },
    { key: "galaxy-a55", label: "Samsung Galaxy A55", base: 3_200_000 },
    { key: "galaxy-a35", label: "Samsung Galaxy A35", base: 2_400_000 },
    { key: "redmi-note-13-pro", label: "Xiaomi Redmi Note 13 Pro", base: 2_300_000 },
    { key: "redmi-note-12", label: "Xiaomi Redmi Note 12", base: 1_400_000 },
  ],
  laptop: [
    { key: "macbook-air-m2", label: "Apple MacBook Air M2", base: 9_000_000 },
    { key: "macbook-air-m1", label: "Apple MacBook Air M1", base: 6_500_000 },
    { key: "ideapad-5", label: "Lenovo IdeaPad 5", base: 4_000_000 },
    { key: "pavilion-15", label: "HP Pavilion 15", base: 3_500_000 },
    { key: "vivobook-15", label: "ASUS VivoBook 15", base: 3_000_000 },
  ],
  tablet: [
    { key: "ipad-air-5", label: "Apple iPad Air (5th gen)", base: 5_500_000 },
    { key: "ipad-10", label: "Apple iPad (10th gen)", base: 3_800_000 },
    { key: "galaxy-tab-s9-fe", label: "Samsung Galaxy Tab S9 FE", base: 3_200_000 },
    { key: "xiaomi-pad-6", label: "Xiaomi Pad 6", base: 2_500_000 },
  ],
  watch: [
    { key: "apple-watch-se-2", label: "Apple Watch SE (2nd gen)", base: 1_800_000 },
    { key: "galaxy-watch-6", label: "Samsung Galaxy Watch 6", base: 1_500_000 },
    { key: "smart-band-8", label: "Xiaomi Smart Band 8", base: 250_000 },
  ],
};

export const CATEGORIES = Object.keys(TRADEIN_MODELS) as TradeInCategory[];

export type Answers = {
  powersOn: boolean;
  screen: "perfect" | "scratches" | "cracked";
  body: "perfect" | "light" | "heavy";
  battery: "good" | "fair" | "poor";
  accessories: boolean;
  /** Account lock (Apple ID / Google FRP) still on: the device cannot be resold. */
  locked: boolean;
};

export const GRADE_MULTIPLIER: Record<Grade, number> = { A: 1, B: 0.8, C: 0.55, D: 0.2 };
export const ACCESSORIES_BONUS = 0.03;
/** Offers stay open this long; an accepted device must be handed over within the second number. */
export const OFFER_VALID_DAYS = 7;
export const HANDOVER_DAYS = 14;
export const MAX_OPEN_REQUESTS = 3;

/** A: like new. B: light wear. C: visible damage or a tired battery. D: broken or not turning on. */
export function grade(a: Answers): Grade {
  if (!a.powersOn) return "D";
  const major = Number(a.screen === "cracked") + Number(a.body === "heavy") + Number(a.battery === "poor");
  if (major >= 2) return "D";
  if (major === 1) return "C";
  if (a.screen === "scratches" || a.body === "light" || a.battery === "fair") return "B";
  return "A";
}

export function findModel(category: string, key: string) {
  return (TRADEIN_MODELS as Record<string, Array<{ key: string; label: string; base: number }>>)[category]?.find((m) => m.key === key) ?? null;
}

/** Instant estimate, rounded down to 10 000 so‘m. Locked devices are worth nothing to us. */
export function estimate(base: number, a: Answers): { grade: Grade; value: number } {
  const g = grade(a);
  if (a.locked) return { grade: g, value: 0 };
  const raw = base * GRADE_MULTIPLIER[g] * (a.accessories ? 1 + ACCESSORIES_BONUS : 1);
  return { grade: g, value: Math.floor(raw / 10_000) * 10_000 };
}

/** The inspector may correct the estimate, but not beyond what the price list allows for grade A. */
export function offerAllowed(base: number, offered: number): boolean {
  return offered > 0 && offered <= Math.floor((base * (1 + ACCESSORIES_BONUS)) / 10_000) * 10_000;
}
