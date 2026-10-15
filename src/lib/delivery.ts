// Delivery rules for Uzbekistan: Tashkent same-day, regions 2–4 days. Pure and testable.
import { tashkentDayKey, tashkentHour, tashkentAt, addDays } from "./dates";

export const REGIONS = [
  { key: "toshkent_sh", uz: "Toshkent shahri", ru: "г. Ташкент", zone: 0 },
  { key: "toshkent_v", uz: "Toshkent viloyati", ru: "Ташкентская обл.", zone: 1 },
  { key: "andijon", uz: "Andijon", ru: "Андижан", zone: 2 },
  { key: "fargona", uz: "Farg‘ona", ru: "Фергана", zone: 2 },
  { key: "namangan", uz: "Namangan", ru: "Наманган", zone: 2 },
  { key: "samarqand", uz: "Samarqand", ru: "Самарканд", zone: 2 },
  { key: "sirdaryo", uz: "Sirdaryo", ru: "Сырдарья", zone: 1 },
  { key: "jizzax", uz: "Jizzax", ru: "Джизак", zone: 2 },
  { key: "buxoro", uz: "Buxoro", ru: "Бухара", zone: 3 },
  { key: "navoiy", uz: "Navoiy", ru: "Навои", zone: 3 },
  { key: "qashqadaryo", uz: "Qashqadaryo", ru: "Кашкадарья", zone: 3 },
  { key: "surxondaryo", uz: "Surxondaryo", ru: "Сурхандарья", zone: 4 },
  { key: "xorazm", uz: "Xorazm", ru: "Хорезм", zone: 4 },
  { key: "qoraqalpogiston", uz: "Qoraqalpog‘iston", ru: "Каракалпакстан", zone: 4 },
] as const;

export type RegionKey = (typeof REGIONS)[number]["key"];
export type Method = "PICKUP" | "COURIER" | "EXPRESS";
export type Fulfillment = "FBO" | "FBS" | "DBS";

export const SAME_DAY_CUTOFF_HOUR = 14;
export const FREE_DELIVERY_THRESHOLD = 300_000;
export const PLUS_FREE_DELIVERY_THRESHOLD = 50_000;

export function regionZone(region: string): number {
  return REGIONS.find((r) => r.key === region)?.zone ?? 3;
}

/** Days until delivery (0 = today) for a fulfillment model, region and method. */
export function deliveryDays(f: Fulfillment, region: string, method: Method, now = new Date()): number {
  const zone = regionZone(region);
  const afterCutoff = tashkentHour(now) >= SAME_DAY_CUTOFF_HOUR;
  if (zone === 0) {
    if (method === "EXPRESS" && f === "FBO") return 0;
    if (f === "FBO") return afterCutoff ? 1 : 0;
    if (f === "FBS") return 1;
    return 2;
  }
  // Regions: 2–4 days depending on distance, +1 when the seller ships itself.
  const base = Math.min(4, Math.max(2, zone + 1));
  return f === "DBS" ? base + 1 : base;
}

export function estimateDelivery(f: Fulfillment, region: string, method: Method = "COURIER", now = new Date()): Date {
  const days = deliveryDays(f, region, method, now);
  const day = tashkentDayKey(addDays(now, days));
  // Evening of the delivery day as a conservative ETA.
  return tashkentAt(day, 21);
}

/** Courier/express/pickup fee in so'm. Free above threshold (lower for ANOR Plus members). */
export function deliveryFee(opts: { method: Method; region: string; subtotal: number; isPlus?: boolean; freeDeliveryCoupon?: boolean }): number {
  const { method, region, subtotal, isPlus, freeDeliveryCoupon } = opts;
  const zone = regionZone(region);
  if (method === "EXPRESS") return zone === 0 ? (isPlus ? 15_000 : 35_000) : 0;
  if (freeDeliveryCoupon) return 0;
  const threshold = isPlus ? PLUS_FREE_DELIVERY_THRESHOLD : FREE_DELIVERY_THRESHOLD;
  if (subtotal >= threshold) return 0;
  if (method === "PICKUP") return zone === 0 ? 0 : 9_000;
  return zone === 0 ? 15_000 : 25_000 + zone * 5_000;
}

export type Slot = { start: Date; end: Date; label: string };

/** Courier delivery slots for the next days (2-hour windows 10:00–22:00 Tashkent). */
export function deliverySlots(earliest: Date, days = 3): Slot[] {
  const slots: Slot[] = [];
  const firstDay = tashkentDayKey(earliest);
  for (let d = 0; d < days; d++) {
    const key = tashkentDayKey(addDays(new Date(`${firstDay}T12:00:00Z`), d));
    for (let h = 10; h < 22; h += 2) {
      const start = tashkentAt(key, h);
      if (start.getTime() < earliest.getTime() - 2 * 3_600_000) continue;
      slots.push({ start, end: tashkentAt(key, h + 2), label: `${String(h).padStart(2, "0")}:00–${String(h + 2).padStart(2, "0")}:00` });
    }
  }
  return slots;
}
