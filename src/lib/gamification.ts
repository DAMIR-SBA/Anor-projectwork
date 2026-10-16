// Check-in streaks, the campaign-day wheel and achievement rules. Bonus points are worth 1 so'm
// at checkout, so the amounts here are real money and kept modest.

/** Streak continues only if the previous check-in was yesterday (Tashkent days, YYYY-MM-DD). */
export function nextStreak(last: { day: string; streak: number } | null, today: string): number {
  if (!last) return 1;
  if (last.day === today) return last.streak;
  const y = new Date(`${today}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  return last.day === y.toISOString().slice(0, 10) ? last.streak + 1 : 1;
}

/** 100 points, +50 for each consecutive day, and a 1 000-point bonus on every 7th day. */
export function checkInPoints(streak: number): number {
  if (streak > 0 && streak % 7 === 0) return 1_000;
  return 100 + Math.min(((streak - 1) % 7), 5) * 50;
}

export type WheelPrize = { key: string; kind: "POINTS" | "COUPON_PERCENT" | "COUPON_DELIVERY" | "NONE"; value: number; weight: number };

export const WHEEL: WheelPrize[] = [
  { key: "points500", kind: "POINTS", value: 500, weight: 30 },
  { key: "points1000", kind: "POINTS", value: 1_000, weight: 18 },
  { key: "points5000", kind: "POINTS", value: 5_000, weight: 4 },
  { key: "coupon5", kind: "COUPON_PERCENT", value: 5, weight: 16 },
  { key: "coupon10", kind: "COUPON_PERCENT", value: 10, weight: 6 },
  { key: "delivery", kind: "COUPON_DELIVERY", value: 0, weight: 12 },
  { key: "none", kind: "NONE", value: 0, weight: 14 },
];

/** Map a uniform random number in [0, 1) to a prize by weight. */
export function pickPrize(r: number, wheel: WheelPrize[] = WHEEL): WheelPrize {
  const total = wheel.reduce((s, p) => s + p.weight, 0);
  let point = Math.min(Math.max(r, 0), 0.999999) * total;
  for (const p of wheel) {
    if (point < p.weight) return p;
    point -= p.weight;
  }
  return wheel[wheel.length - 1];
}

export type AchievementMetric = "orders" | "reviews" | "photoReviews" | "checkinStreak" | "referrals";
export type Metrics = Record<AchievementMetric, number>;

export function achieved(criteria: unknown, m: Metrics): boolean {
  const c = criteria as { metric?: AchievementMetric; gte?: number } | null;
  if (!c?.metric || typeof c.gte !== "number") return false;
  return (m[c.metric] ?? 0) >= c.gte;
}

/** 0..1 progress toward an achievement, for progress bars. */
export function progressOf(criteria: unknown, m: Metrics): number {
  const c = criteria as { metric?: AchievementMetric; gte?: number } | null;
  if (!c?.metric || !c.gte) return 0;
  return Math.min(1, (m[c.metric] ?? 0) / c.gte);
}

/** "Aziza Karimova" → "Aziza K." for public leaderboards. */
export function publicName(name: string | null | undefined, login: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return `${login.slice(0, 3)}***`;
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[1][0]}.`;
}
