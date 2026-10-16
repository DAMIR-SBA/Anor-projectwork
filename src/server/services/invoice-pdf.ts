import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { db } from "@/server/db";
import { groupDigits } from "@/lib/money";
import { formatAccount } from "@/lib/b2b";

type Party = { companyName?: string; legalName?: string; taxId?: string; legalAddress?: string; address?: string; bankName?: string | null; bankAccount?: string | null; bankMfo?: string | null; mfo?: string };

/** A4 bank-transfer invoice (to‘lov uchun hisob / счёт на оплату) with the requisites frozen at issue. */
export async function invoicePdf(invoiceId: string, locale: string): Promise<{ pdf: Uint8Array; number: string }> {
  const { PDFDocument, rgb, degrees } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { group: { include: { orders: { include: { items: true, shop: { select: { name: true } } } } } } } });
  const ru = locale === "ru";
  const L = (uz: string, r: string) => (ru ? r : uz);
  const req = (inv.requisites ?? {}) as { payer?: Party; payee?: Party };
  const payer = req.payer ?? {};
  const payee = req.payee ?? {};

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const dir = path.join(process.cwd(), "assets/fonts");
  const font = await doc.embedFont(await readFile(path.join(dir, "DejaVuSans.ttf")), { subset: true });
  const bold = await doc.embedFont(await readFile(path.join(dir, "DejaVuSans-Bold.ttf")), { subset: true });
  const W = 595;
  const H = 842;
  const M = 40;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.42, 0.42, 0.46);
  const fit = (s: string, size: number, max: number, b = false) => {
    const f = b ? bold : font;
    let out = s;
    while (out.length > 1 && f.widthOfTextAtSize(out, size) > max) out = out.slice(0, -2) + "…";
    return out;
  };
  const text = (s: string, x: number, opts: { size?: number; b?: boolean; right?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const f = opts.b ? bold : font;
    const size = opts.size ?? 9;
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: opts.right != null ? opts.right - w : x, y, size, font: f, color: opts.color ?? ink });
  };
  const wrap = (s: string, size: number, max: number) => {
    const out: string[] = [];
    let cur = "";
    for (const word of s.split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > max && cur) {
        out.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };
  // Invoices carry the full date in Tashkent time (dd.mm.yyyy) whatever the UI locale.
  const day = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const line = (x1: number, x2: number, color = rgb(0.85, 0.85, 0.88)) => page.drawLine({ start: { x: x1, y: y - 3 }, end: { x: x2, y: y - 3 }, thickness: 0.6, color });

  text("ANOR", M, { size: 18, b: true, color: rgb(0.784, 0.063, 0.18) });
  text(day(inv.createdAt), M, { right: W - M, color: muted });
  y -= 28;
  text(`${L("TO‘LOV UCHUN HISOB", "СЧЁТ НА ОПЛАТУ")} № ${inv.number}`, M, { size: 14, b: true });
  y -= 16;
  text(`${L("Buyurtma", "Заказ")} № ${inv.group.number} · ${L("To‘lov muddati", "Оплатить до")}: ${day(inv.dueDate)}`, M, { color: muted });
  y -= 24;

  const colW = (W - 2 * M) / 2;
  const party = (title: string, p: Party, x: number) => {
    const rows: Array<[string, string]> = [
      [L("Nomi", "Наименование"), p.companyName ?? p.legalName ?? "—"],
      [L("STIR", "ИНН"), p.taxId || "—"],
      [L("Manzil", "Адрес"), p.legalAddress ?? p.address ?? "—"],
      [L("Bank", "Банк"), p.bankName || "—"],
      [L("MFO", "МФО"), p.bankMfo ?? p.mfo ?? "—"],
      [L("H/r", "Р/с"), formatAccount(p.bankAccount) || "—"],
    ];
    let yy = y;
    page.drawText(title, { x, y: yy, size: 10, font: bold, color: ink });
    yy -= 15;
    for (const [k, v] of rows) {
      page.drawText(k, { x, y: yy, size: 8, font, color: muted });
      page.drawText(fit(v || "—", 8.5, colW - 92), { x: x + 78, y: yy, size: 8.5, font, color: ink });
      yy -= 12.5;
    }
    return yy;
  };
  const after = Math.min(party(L("Oluvchi (to‘lov qabul qiluvchi)", "Получатель платежа"), payee, M), party(L("To‘lovchi", "Плательщик"), payer, M + colW + 10));
  y = after - 14;

  // Items
  const cols = { n: M, name: M + 22, qty: W - M - 190, price: W - M - 100, sum: W - M };
  const head = () => {
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 17, color: rgb(0.96, 0.96, 0.97) });
    text("№", cols.n + 2, { b: true, size: 8.5 });
    text(L("Tovar", "Товар"), cols.name, { b: true, size: 8.5 });
    text(L("Soni", "Кол-во"), 0, { b: true, size: 8.5, right: cols.qty + 30 });
    text(L("Narxi", "Цена"), 0, { b: true, size: 8.5, right: cols.price + 40 });
    text(L("Summa", "Сумма"), 0, { b: true, size: 8.5, right: cols.sum });
    y -= 20;
  };
  head();
  let i = 0;
  const items = inv.group.orders.flatMap((o) => o.items);
  for (const it of items) {
    if (y < 150) {
      page = doc.addPage([W, H]);
      y = H - M;
      head();
    }
    i++;
    const net = it.unitPrice * it.quantity - it.discount;
    text(String(i), cols.n + 2);
    text(fit(`${it.title}${it.variantTitle ? ` (${it.variantTitle})` : ""}`, 9, cols.qty - cols.name - 10), cols.name);
    text(groupDigits(it.quantity), 0, { right: cols.qty + 30 });
    text(groupDigits(it.unitPrice), 0, { right: cols.price + 40 });
    text(groupDigits(net), 0, { right: cols.sum });
    line(M, W - M);
    y -= 17;
  }
  const g = inv.group;
  const totalsRow = (label: string, value: number, b = false) => {
    text(label, 0, { right: cols.price + 40, b });
    text(groupDigits(value), 0, { right: cols.sum, b });
    y -= 15;
  };
  y -= 4;
  const stampPage = page;
  const stampY = y - 12;
  if (g.deliveryTotal) totalsRow(L("Yetkazib berish", "Доставка"), g.deliveryTotal);
  if (g.bonusUsed) totalsRow(L("Bonus ballar", "Бонусные баллы"), -g.bonusUsed);
  if (g.walletUsed) totalsRow(L("Hamyondan to‘langan", "Оплачено из кошелька"), -g.walletUsed);
  totalsRow(L("To‘lash uchun jami, so‘m", "Итого к оплате, сум"), inv.amount, true);
  totalsRow(L("shu jumladan QQS 12%", "в т.ч. НДС 12%"), inv.vat);
  y -= 12;
  if (y < 150) {
    page = doc.addPage([W, H]);
    y = H - M;
  }

  const qrSize = 92;
  const textW = W - 2 * M - qrSize - 16;
  const blockTop = y;
  const purpose = L(`${inv.number} hisobiga ko‘ra tovarlar uchun to‘lov, shu jumladan QQS 12% — ${groupDigits(inv.vat)} so‘m`, `Оплата по счёту ${inv.number} за товары, в т.ч. НДС 12% — ${groupDigits(inv.vat)} сум`);
  text(L("To‘lov maqsadi:", "Назначение платежа:"), M, { b: true });
  y -= 13;
  for (const ln of wrap(purpose, 9, textW)) {
    text(ln, M);
    y -= 12;
  }
  y -= 6;
  for (const ln of wrap(L("Muddatida to‘lanmasa buyurtma avtomatik bekor qilinadi. To‘lov tushgach buyurtma sotuvchiga yuboriladi.", "Если счёт не оплачен в срок, заказ отменяется автоматически. После поступления оплаты заказ передаётся продавцу."), 8, textW)) {
    text(ln, M, { size: 8, color: muted });
    y -= 11;
  }

  const qr = await QRCode.toBuffer(`${payee.legalName ?? ""}|${payee.taxId ?? ""}|${payee.bankMfo ?? payee.mfo ?? ""}|${payee.bankAccount ?? ""}|${inv.amount}|${inv.number}`, { margin: 1, width: 220 });
  const img = await doc.embedPng(qr);
  page.drawImage(img, { x: W - M - qrSize, y: blockTop - qrSize + 8, width: qrSize, height: qrSize });

  if (inv.status !== "ISSUED") {
    const stamp = inv.status === "PAID" ? L("TO‘LANGAN", "ОПЛАЧЕН") : L("BEKOR QILINGAN", "АННУЛИРОВАН");
    const color = inv.status === "PAID" ? rgb(0.13, 0.55, 0.3) : rgb(0.75, 0.1, 0.15);
    const size = 30;
    const w = bold.widthOfTextAtSize(stamp, size);
    stampPage.drawText(stamp, { x: M + Math.max(0, 150 - w / 2), y: stampY, size, font: bold, color, opacity: 0.3, rotate: degrees(-8) });
  }
  return { pdf: await doc.save(), number: inv.number };
}
