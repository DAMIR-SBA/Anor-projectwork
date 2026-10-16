// Live shopping: products pinned to a stream can get a short-lived "efir narxi" that applies in
// the cart and at checkout only while the stream is on air and the window is open. Pure functions.

export type TimedPrice = { productId: string; price: number; from: string; to: string };

export const LIVE_PRICE_MINUTES = [5, 10, 15, 30] as const;
export const LIVE_CHAT_MAX = 300;
/** Stops typos like 1 500 instead of 1 500 000 from going live. */
export const LIVE_PRICE_MIN_SHARE = 0.3;
export const MAX_PINNED = 12;

export function parseTimedPrices(raw: unknown): TimedPrice[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is TimedPrice => !!x && typeof x.productId === "string" && typeof x.price === "number" && typeof x.from === "string" && typeof x.to === "string");
}

/** The live price of a product right now: the lowest open window, or null. */
export function activeTimedPrice(list: TimedPrice[], productId: string, now = new Date()): TimedPrice | null {
  const t = now.getTime();
  const open = list.filter((p) => p.productId === productId && Date.parse(p.from) <= t && t < Date.parse(p.to));
  return open.sort((a, b) => a.price - b.price)[0] ?? null;
}

export function timedPriceAllowed(listPrice: number, price: number): boolean {
  return Number.isInteger(price) && price < listPrice && price >= Math.ceil(listPrice * LIVE_PRICE_MIN_SHARE);
}

/** Adding a window for a product closes any window it still has open (one live price at a time). */
export function withTimedPrice(list: TimedPrice[], productId: string, price: number, minutes: number, now = new Date()): TimedPrice[] {
  const iso = now.toISOString();
  const closed = list.map((p) => (p.productId === productId && Date.parse(p.to) > now.getTime() ? { ...p, to: iso } : p));
  return [...closed, { productId, price, from: iso, to: new Date(now.getTime() + minutes * 60_000).toISOString() }];
}
