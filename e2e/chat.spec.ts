import { expect, test } from "@playwright/test";
import { demoLogin, newPage } from "./support";

test("buyer asks the seller in chat and gets a realtime reply", async ({ browser, baseURL }) => {
  const buyer = await newPage(browser, baseURL!);
  const seller = await newPage(browser, baseURL!);
  await demoLogin(buyer, "Xaridor");
  await demoLogin(seller, "Sotuvchi");

  // Start the thread from a Moda Bazar product.
  await buyer.goto("/shop/moda-bazar", { waitUntil: "networkidle" });
  const href = await buyer.locator("main a[href*='/p/']").first().getAttribute("href");
  await buyer.goto(href!, { waitUntil: "networkidle" });
  await buyer.getByRole("link", { name: "Sotuvchiga yozish" }).first().click();
  await buyer.waitForURL(/\/chat\/\w+$/);

  const stamp = Date.now().toString(36);
  await buyer.locator("#chat-input").fill(`M o‘lcham bormi? ${stamp} Tel: +998 90 111 22 33`);
  await buyer.keyboard.press("Enter");
  // Phone numbers are masked before anyone sees them.
  await expect(buyer.locator("[aria-label='Xabarlar']")).toContainText(stamp);
  await expect(buyer.locator("[aria-label='Xabarlar']")).not.toContainText("111 22 33");

  await seller.goto("/seller/chats", { waitUntil: "networkidle" });
  await seller.locator("aside[aria-label='Suhbatlar'] li button").filter({ hasText: "Aziza" }).first().click();
  await expect(seller.locator("[aria-label='Xabarlar']").getByText(stamp)).toBeVisible();
  await seller.locator("#chat-input").fill(`Ha, M bor ${stamp}!`);
  await seller.keyboard.press("Enter");

  // Delivered over the realtime channel, without a reload.
  await expect(buyer.locator("[aria-label='Xabarlar']").getByText(`Ha, M bor ${stamp}!`)).toBeVisible({ timeout: 15_000 });
});
