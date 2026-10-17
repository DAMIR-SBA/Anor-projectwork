import { expect, test } from "@playwright/test";
import { demoLogin, emptyCart, groupDigits, newPage, one, sql, staffLogin } from "./support";

test("live price set by the host applies in the buyer's cart until the stream ends", async ({ browser, baseURL }) => {
  const stream = await one<{ id: string; pinned: string[] }>(`SELECT l.id, l."pinnedProductIds" pinned FROM "LiveStream" l JOIN "Shop" s ON s.id = l."shopId" WHERE s.slug = 'moda-bazar' ORDER BY l."createdAt" LIMIT 1`);
  await sql(`UPDATE "LiveStream" SET status = 'LIVE', "endedAt" = NULL, "timedPrices" = NULL WHERE id = $1`, [stream.id]);
  await emptyCart("demo_buyer");
  const product = await one<{ title: string; price: number; variant: string }>(`SELECT p."titleUz" title, v.price, v.id variant FROM "Product" p JOIN "Variant" v ON v."productId" = p.id WHERE p.id = $1 ORDER BY v.price LIMIT 1`, [stream.pinned[0]]);
  const livePrice = Math.round((product.price * 0.8) / 1000) * 1000;

  const host = await newPage(browser, baseURL!);
  await demoLogin(host, "Sotuvchi");
  await host.goto(`/seller/live/${stream.id}`, { waitUntil: "load" });
  const row = host.locator("li", { hasText: product.title.slice(0, 20) }).first();
  await row.locator("input[type=number]").fill(String(livePrice));
  await row.getByRole("button", { name: "Narxni e’lon qilish" }).click();
  await expect.poll(async () => (await one<{ t: unknown }>(`SELECT "timedPrices" t FROM "LiveStream" WHERE id = $1`, [stream.id])).t).not.toBeNull();

  const buyer = await newPage(browser, baseURL!);
  await demoLogin(buyer, "Xaridor");
  await sql(`INSERT INTO "CartItem" (id, "cartId", "variantId", quantity) SELECT 'e2e-live-item', c.id, $1, 1 FROM "Cart" c JOIN "User" u ON u.id = c."userId" WHERE u.login = 'demo_buyer'`, [product.variant]);
  await buyer.goto("/cart", { waitUntil: "networkidle" });
  expect((await buyer.locator("main").innerText()).replace(/ /g, " ")).toContain(groupDigits(livePrice));

  host.on("dialog", (d) => d.accept());
  await host.getByRole("button", { name: "Efirni tugatish" }).click();
  await expect.poll(async () => (await one<{ status: string }>(`SELECT status FROM "LiveStream" WHERE id = $1`, [stream.id])).status).toBe("ENDED");
  await buyer.reload({ waitUntil: "networkidle" });
  expect((await buyer.locator("main").innerText()).replace(/ /g, " ")).not.toContain(groupDigits(livePrice));
  await sql(`UPDATE "LiveStream" SET status = 'LIVE', "endedAt" = NULL, "timedPrices" = NULL WHERE id = $1`, [stream.id]);
});

test("trade-in: estimate, inspector offer, acceptance and wallet payout", async ({ browser, baseURL }) => {
  await sql(`DELETE FROM "TradeInRequest" WHERE "userId" = (SELECT id FROM "User" WHERE login = 'demo_buyer') AND number NOT IN ('TI-100201', 'TI-100188')`);
  const buyer = await newPage(browser, baseURL!);
  await demoLogin(buyer, "Xaridor");
  await buyer.goto("/trade-in", { waitUntil: "networkidle" });
  await buyer.getByText("Planshet", { exact: true }).click();
  await buyer.locator("#ti-model").selectOption("ipad-10");
  await expect(buyer.locator("aside")).toContainText("3 800 000");
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc0000003010100c9fe92ef0000000049454e44ae426082", "hex");
  await buyer.locator('input[type=file][accept^="image"]').setInputFiles([
    { name: "front.png", mimeType: "image/png", buffer: png },
    { name: "back.png", mimeType: "image/png", buffer: png },
  ]);
  await buyer.getByRole("button", { name: "Ariza yuborish" }).click();
  await buyer.waitForURL(/\/account\/trade-in/);
  const ti = await one<{ id: string; number: string; estimatedValue: number }>(`SELECT id, number, "estimatedValue" FROM "TradeInRequest" ORDER BY "createdAt" DESC LIMIT 1`);
  expect(ti.estimatedValue).toBe(3_800_000);

  const support = await newPage(browser, baseURL!);
  await staffLogin(support, "SUPPORT");
  await support.goto("/admin/trade-in", { waitUntil: "networkidle" });
  const card = support.locator("li", { hasText: ti.number });
  await card.locator("input[type=number]").fill("3600000");
  await card.getByRole("button", { name: "Taklif yuborish" }).click();
  await expect.poll(async () => (await one<{ status: string }>(`SELECT status FROM "TradeInRequest" WHERE id = $1`, [ti.id])).status).toBe("ESTIMATED");

  await buyer.reload({ waitUntil: "networkidle" });
  await buyer.locator("li", { hasText: ti.number }).getByRole("button", { name: "Taklifni qabul qilish" }).click();
  await expect.poll(async () => (await one<{ status: string }>(`SELECT status FROM "TradeInRequest" WHERE id = $1`, [ti.id])).status).toBe("ACCEPTED");

  const before = (await one<{ balance: number }>(`SELECT balance FROM "Wallet" WHERE "userId" = (SELECT id FROM "User" WHERE login = 'demo_buyer')`))?.balance ?? 0;
  await support.goto("/admin/trade-in?tab=ACCEPTED", { waitUntil: "networkidle" });
  support.on("dialog", (d) => d.accept());
  await support.locator("li", { hasText: ti.number }).getByRole("button", { name: /Qabul qilindi/ }).click();
  await expect.poll(async () => (await one<{ balance: number }>(`SELECT balance FROM "Wallet" WHERE "userId" = (SELECT id FROM "User" WHERE login = 'demo_buyer')`)).balance).toBe(before + 3_600_000);
});
