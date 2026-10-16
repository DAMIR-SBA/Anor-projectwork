import "server-only";

type Row = Record<string, unknown>;

function cell(v: unknown): string {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  // Neutralize spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV with BOM so Excel opens UTF-8 (Cyrillic) correctly. */
export function toCsv(columns: string[], rows: Row[]): string {
  return "﻿" + [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n");
}

export async function toXlsx(sheet: string, columns: string[], rows: Row[], headers?: Record<string, string>): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ANOR";
  const ws = wb.addWorksheet(sheet);
  ws.columns = columns.map((c) => ({ header: headers?.[c] ?? c, key: c, width: Math.min(60, Math.max(12, (headers?.[c] ?? c).length + 4)) }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC8102E" } };
  for (const r of rows) ws.addRow(Object.fromEntries(columns.map((c) => [c, r[c] instanceof Date ? (r[c] as Date).toISOString() : r[c]])));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Several sheets in one workbook (e.g. payout summary + reconciled orders). */
export async function toXlsxBook(sheets: Array<{ name: string; columns: string[]; rows: Row[]; headers?: Record<string, string> }>): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ANOR";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.columns = s.columns.map((c) => ({ header: s.headers?.[c] ?? c, key: c, width: Math.min(60, Math.max(12, (s.headers?.[c] ?? c).length + 4)) }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC8102E" } };
    for (const r of s.rows) ws.addRow(Object.fromEntries(s.columns.map((c) => [c, r[c] instanceof Date ? (r[c] as Date).toISOString() : r[c]])));
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
