// Kept apart from server/action.ts (which pulls in next/navigation) so that services stay
// importable from plain Node processes: the pg-boss worker, scripts and the seed.

/** An expected failure with a translatable code (errors.<code>) and the form field it belongs to. */
export class AppError extends Error {
  constructor(
    public code: string,
    public values?: Record<string, string | number>,
    public field?: string,
  ) {
    super(code);
  }
}

/** +998XXXXXXXXX from 9 local digits or 12 digits with the country code; null otherwise. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
  return null;
}
