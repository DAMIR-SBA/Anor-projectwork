import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { db } from "@/server/db";
import { groupDigits } from "@/lib/money";
import { fmtDateTime } from "@/lib/format-date";

/** Fiscal receipt as PDF (DejaVu Sans for Uzbek/Russian glyphs) with the verification QR. */
export async function receiptPdf(orderId: string, locale: string): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, receipt: true, shop: true } });
  const r = order.receipt;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const dir = path.join(process.cwd(), "assets/fonts");
  const font = await doc.embedFont(await readFile(path.join(dir, "DejaVuSans.ttf")), { subset: true });
  const bold = await doc.embedFont(await readFile(path.join(dir, "DejaVuSans-Bold.ttf")), { subset: true });
  const width = 300;
  const lineH = 14;
  const height = 360 + order.items.length * 34;
  const page = doc.addPage([width, height]);
  let y = height - 28;
  const ru = locale === "ru";
  const text = (s: string, opts: { x?: number; size?: number; b?: boolean; right?: boolean; color?: [number, number, number] } = {}) => {
    const f = opts.b ? bold : font;
    const size = opts.size ?? 9;
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: opts.right ? width - 20 - w : (opts.x ?? 20), y, size, font: f, color: rgb(...(opts.color ?? [0.1, 0.1, 0.12])) });
  };
  const hr = () => {
    page.drawLine({ start: { x: 20, y: y + 4 }, end: { x: width - 20, y: y + 4 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.85), dashArray: [2, 2] });
    y -= 8;
  };

  text("ANOR", { size: 16, b: true, color: [0.784, 0.063, 0.18] });
  y -= 18;
  text(order.shop.legalName ?? order.shop.name, { b: true });
  y -= lineH;
  text(`${ru ? "ИНН" : "STIR"}: ${order.shop.taxId ?? "—"}`);
  y -= lineH;
  text(`${ru ? "Чек" : "Chek"} № ${r?.receiptNo ?? "—"}`);
  text(fmtDateTime(r?.issuedAt ?? order.createdAt, locale), { right: true });
  y -= lineH;
  text(`${ru ? "Заказ" : "Buyurtma"} № ${order.number}`);
  y -= lineH + 4;
  hr();
  for (const it of order.items) {
    const title = it.title.length > 44 ? `${it.title.slice(0, 43)}…` : it.title;
    text(title);
    y -= lineH;
    text(`${it.quantity} × ${groupDigits(it.unitPrice)}`, { x: 28, color: [0.42, 0.42, 0.46] });
    text(groupDigits(it.unitPrice * it.quantity - it.discount), { right: true });
    y -= lineH + 6;
  }
  hr();
  if (order.deliveryFee) {
    text(ru ? "Доставка" : "Yetkazish");
    text(groupDigits(order.deliveryFee), { right: true });
    y -= lineH;
  }
  text(ru ? "ИТОГО" : "JAMI", { b: true, size: 11 });
  text(`${groupDigits(order.total)} ${ru ? "сум" : "so‘m"}`, { b: true, size: 11, right: true });
  y -= lineH;
  text(`${ru ? "в т.ч. НДС 12%" : "shu jumladan QQS 12%"}`, { color: [0.42, 0.42, 0.46] });
  text(groupDigits(r?.vat ?? 0), { right: true, color: [0.42, 0.42, 0.46] });
  y -= lineH + 4;
  hr();
  text(`${ru ? "ФП" : "FB"}: ${r?.fiscalSign ?? "—"}   ${ru ? "Терминал" : "Terminal"}: ${r?.terminalId ?? "—"}`, { size: 8 });
  y -= 10;
  if (r) {
    const png = await QRCode.toBuffer(r.qrUrl, { margin: 1, width: 240 });
    const img = await doc.embedPng(png);
    page.drawImage(img, { x: (width - 110) / 2, y: y - 115, width: 110, height: 110 });
    y -= 128;
    text(ru ? "Проверьте чек по QR-коду" : "Chekni QR-kod orqali tekshiring", { size: 8, x: 70, color: [0.42, 0.42, 0.46] });
  }
  return doc.save();
}
