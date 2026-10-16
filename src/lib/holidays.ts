// Fixed-date public holidays and observances in Uzbekistan, for the storefront greeting.
// Lunar holidays (Ramazon and Qurbon hayiti) move every year: they come from seasonal campaigns.

export const HOLIDAYS: Array<{ md: string; key: string; days: number; emoji: string }> = [
  { md: "01-01", key: "newYear", days: 2, emoji: "🎄" },
  { md: "03-08", key: "womensDay", days: 1, emoji: "🌷" },
  { md: "03-21", key: "navruz", days: 3, emoji: "🌱" },
  { md: "05-09", key: "memory", days: 1, emoji: "🕊️" },
  { md: "09-01", key: "independence", days: 2, emoji: "🇺🇿" },
  { md: "10-01", key: "teachers", days: 1, emoji: "📚" },
  { md: "12-08", key: "constitution", days: 1, emoji: "📜" },
];

/** The holiday being celebrated on a Tashkent day ("YYYY-MM-DD"), if any. */
export function holidayOn(day: string): (typeof HOLIDAYS)[number] | null {
  const d = Date.parse(`${day}T00:00:00Z`);
  for (const h of HOLIDAYS) {
    const start = Date.parse(`${day.slice(0, 4)}-${h.md}T00:00:00Z`);
    if (d >= start && d < start + h.days * 86_400_000) return h;
  }
  return null;
}
