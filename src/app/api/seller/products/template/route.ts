import { toCsv, IMPORT_COLUMNS } from "@/lib/seller";

/** Example import sheet with every supported column. */
export async function GET() {
  const csv = toCsv([
    [...IMPORT_COLUMNS],
    ["TSHIRT-WH-M", "Paxta futbolka, oq, M", "Футболка хлопковая, белая, M", "erkaklar-kiyimi", 129000, 159000, 25, "100% paxta, O‘zbekistonda tikilgan", "100% хлопок, сшита в Узбекистане", "", 220, "4780012345678", 61000],
  ]);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="anor-import-template.csv"' } });
}
