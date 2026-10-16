// All business dates are Asia/Tashkent (UTC+5, no DST).
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Tashkent";
const TASHKENT_OFFSET_MIN = 5 * 60;

/** YYYY-MM-DD for the given instant in Tashkent. Used for streaks, daily deals, ad budgets. */
export function tashkentDayKey(d: Date = new Date()): string {
  const shifted = new Date(d.getTime() + TASHKENT_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** ISO week key (YYYY-Www) in Tashkent time, for weekly missions. */
export function tashkentWeekKey(d: Date = new Date()): string {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MIN * 60_000);
  const date = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Start of the Tashkent day containing `d`, as a UTC instant. */
export function startOfTashkentDay(d: Date = new Date()): Date {
  const key = tashkentDayKey(d);
  return new Date(Date.parse(`${key}T00:00:00Z`) - TASHKENT_OFFSET_MIN * 60_000);
}

export function endOfTashkentDay(d: Date = new Date()): Date {
  return new Date(startOfTashkentDay(d).getTime() + 86_400_000 - 1);
}

/** Hour of day (0-23) in Tashkent. */
export function tashkentHour(d: Date = new Date()): number {
  return new Date(d.getTime() + TASHKENT_OFFSET_MIN * 60_000).getUTCHours();
}

/** Build an instant from a Tashkent local date + hour. */
export function tashkentAt(dayKey: string, hour: number, minute = 0): Date {
  return new Date(Date.parse(`${dayKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`) - TASHKENT_OFFSET_MIN * 60_000);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3_600_000);
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}

/** "YYYY-MM-DDTHH:mm" in Tashkent time, `minutes` from now (default for datetime-local inputs). */
export function tashkentInputValue(minutes = 0, now: Date = new Date()): string {
  return new Date(now.getTime() + minutes * 60_000 + 5 * 3_600_000).toISOString().slice(0, 16);
}
