/** Pure helpers behind the admin panel (kept out of server-only modules so they can be tested). */

/** Same calendar day next year; 29 Feb falls back to 28 Feb. */
export function nextYear(d: Date): Date {
  const n = new Date(d);
  n.setUTCFullYear(n.getUTCFullYear() + 1);
  if (n.getUTCDate() !== d.getUTCDate()) n.setUTCDate(0);
  return n;
}

export function bannerState(b: { isActive: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date): "off" | "scheduled" | "live" | "expired" {
  if (!b.isActive) return "off";
  if (b.endsAt && b.endsAt <= now) return "expired";
  if (b.startsAt && b.startsAt > now) return "scheduled";
  return "live";
}

/** Days past due → aging bucket. */
export function agingBucket(days: number): "1-30" | "31-60" | "61-90" | "90+" {
  return days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
}
