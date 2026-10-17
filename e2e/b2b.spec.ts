import { expect, test } from "@playwright/test";
import { demoLogin, emptyCart, ensureStock, groupDigits, newPage, one, sql, staffLogin } from "./support";

test.beforeEach(async () => {
  await emptyCart("demo_business");
  await sql(`UPDATE "QuoteRequest" SET status = 'QUOTED', "acceptedAt" = NULL, "groupId" = NULL, "validUntil" = now() + interval '6 days' WHERE number = 'Q-DEMO02'`);
  await sql(`UPDATE "QuoteRequest" SET status = 'OPEN', "quotedPrice" = NULL, "quotedAt" = NULL, "validUntil" = NULL, "sellerNote" = NULL, "createdAt" = now() - interval '2 hours' WHERE number = 'Q-DEMO01'`);
  // Each run buys the quoted quantity, so make sure it is in stock again.
  for (const q of await sql<{ variantId: string; quantity: number }>(`SELECT "variantId", quantity FROM "QuoteRequest" WHERE number IN ('Q-DEMO01', 'Q-DEMO02')`)) await ensureStock(q.variantId, q.quantity * 2);
});

test("company accepts a quote, pays by bank transfer and finance releases the order", async ({ browser, baseURL }) => {
  const buyer = await newPage(browser, baseURL!);
  await demoLogin(buyer, "Biznes xaridor");
  await buyer.goto("/account/business", { waitUntil: "networkidle" });
  await expect(buyer.locator("main")).toContainText("Tasdiqlangan");

  // Accept the seller's price: the line lands in the cart with price and quantity locked.
  await buyer.locator("li", { hasText: "Q-DEMO02" }).getByRole("button", { name: "Qabul qilish" }).click();
  await buyer.waitForURL(/\/cart/);
  const quote = await one<{ quotedPrice: number; quantity: number }>(`SELECT "quotedPrice", quantity FROM "QuoteRequest" WHERE number = 'Q-DEMO02'`);
  await expect(buyer.locator("main")).toContainText("Kelishilgan narx");
  expect((await buyer.locator("main").innerText()).replace(/ /g, " ")).toContain(groupDigits(quote.quotedPrice * quote.quantity));

  // Bank transfer → invoice; the order waits for the money.
  await buyer.goto("/checkout", { waitUntil: "load" });
  await buyer.getByText("Bank o‘tkazmasi (hisob-faktura)").click();
  await buyer.getByRole("button", { name: "Buyurtma berish", exact: true }).click();
  await buyer.waitForURL(/\/checkout\/success\//, { timeout: 30_000 });
  const groupId = buyer.url().split("/").pop()!;
  const invoice = await one<{ id: string; number: string; status: string; amount: number; vat: number }>(`SELECT id, number, status, amount, vat FROM "Invoice" WHERE "groupId" = $1`, [groupId]);
  expect(invoice.status).toBe("ISSUED");
  expect(invoice.vat).toBe(Math.round((invoice.amount * 0.12) / 1.12));
  const pdf = await buyer.request.get(`/api/invoices/${invoice.id}`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  // Finance matches the bank statement and marks it paid.
  const finance = await newPage(browser, baseURL!);
  await staffLogin(finance, "FINANCE");
  await finance.goto("/admin/finance?tab=invoices", { waitUntil: "networkidle" });
  await finance.locator("tr", { hasText: invoice.number }).getByRole("button", { name: "To‘langan" }).click();
  await finance.getByRole("dialog").locator("textarea").fill("PP-000731");
  await finance.getByRole("dialog").getByRole("button").last().click();
  await expect.poll(async () => (await one<{ status: string }>(`SELECT status FROM "Invoice" WHERE id = $1`, [invoice.id])).status).toBe("PAID");
  // The payment handler releases the orders to the seller right after.
  await expect.poll(async () => (await sql<{ status: string }>(`SELECT status FROM "Order" WHERE "groupId" = $1`, [groupId])).every((o) => o.status === "PLACED")).toBe(true);
});

test("seller answers an open quote request", async ({ browser, baseURL }) => {
  const seller = await newPage(browser, baseURL!);
  await demoLogin(seller, "Sotuvchi");
  await seller.goto("/seller/quotes", { waitUntil: "networkidle" });
  const row = seller.locator("li", { hasText: "Q-DEMO01" });
  await row.getByRole("button", { name: "Narx taklif qilish" }).click();
  const dialog = seller.getByRole("dialog", { name: "Narx taklif qilish" });
  await dialog.locator("#qo-p").fill("95000");
  await dialog.getByRole("button", { name: "Yuborish" }).click();
  await expect(dialog).toContainText("joriy narxdan past");
  await dialog.locator("#qo-p").fill("60000");
  await dialog.getByRole("button", { name: "Yuborish" }).click();
  await expect.poll(async () => (await one<{ status: string }>(`SELECT status FROM "QuoteRequest" WHERE number = 'Q-DEMO01'`)).status).toBe("QUOTED");
});
