import { expect, test } from "@playwright/test";
import { demoLogin, emptyCart, ensureProductStock, noHorizontalScroll, one, prepare } from "./support";

test.beforeEach(async ({ context, baseURL }) => {
  await prepare(context, baseURL!);
  await emptyCart("demo_buyer");
  for (const slug of ["kuk-choy-95", "bolalar-futbolkasi"]) await ensureProductStock(slug, 20);
});

test("guest finds a product, signs in at checkout and pays by card", async ({ page }) => {
  // Search from the header.
  await page.goto("/", { waitUntil: "networkidle" });
  const search = page.getByRole("search").getByRole("combobox").or(page.getByRole("search").locator("input")).first();
  await search.fill("ko‘k choy");
  await search.press("Enter");
  await page.waitForURL(/\/search\?q=/);
  await page.locator('main a[href*="/p/kuk-choy-95"]').first().click();
  await page.waitForURL(/\/p\/kuk-choy-95/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ko‘k choy");
  await noHorizontalScroll(page);

  // Add to cart as a guest; the cart survives the sign-in.
  await page.getByRole("button", { name: /Savatga/ }).filter({ visible: true }).first().click();
  await expect(page.getByText("Savatga qo‘shildi").first()).toBeVisible();
  await page.goto("/cart", { waitUntil: "networkidle" });
  await expect(page.locator("main")).toContainText("Ko‘k choy");
  await page.getByRole("button", { name: "Rasmiylashtirishga o‘tish" }).click();
  await page.waitForURL(/\/auth\/login\?next=%2Fcheckout|\/auth\/login\?next=\/checkout/);
  await page.getByRole("button", { name: "Xaridor", exact: true }).click();
  await page.waitForURL(/\/checkout/, { timeout: 30_000 });

  // Courier to the saved address, pay online.
  await expect(page.getByText(/\d{2}:\d{2}[–-]\d{2}:\d{2}/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByText("Click", { exact: true }).first().click();
  await page.getByRole("button", { name: /To‘lash:/ }).click();
  await page.waitForURL(/\/pay\//, { timeout: 30_000 });
  await page.locator("#pan").fill("8600 1234 5678 9012");
  await page.locator("#exp").fill("12/30");
  await page.locator("#otp").fill("000000");
  await page.getByRole("button", { name: "To‘lash" }).click();
  await page.waitForURL(/\/checkout\/success\//, { timeout: 30_000 });
  const groupId = page.url().split("/").pop()!.split("?")[0];
  await expect(page.getByRole("heading", { name: "Buyurtma qabul qilindi!" })).toBeVisible();

  const group = await one<{ paymentStatus: string; statuses: string[] }>(`SELECT g."paymentStatus", array_agg(o.status::text) statuses FROM "OrderGroup" g JOIN "Order" o ON o."groupId" = g.id WHERE g.id = $1 GROUP BY g.id`, [groupId]);
  expect(group.paymentStatus).toBe("PAID");
  expect(group.statuses.every((s) => s === "PLACED")).toBe(true);

  const { number } = await one<{ number: string }>(`SELECT number FROM "Order" WHERE "groupId" = $1 LIMIT 1`, [groupId]);
  await page.goto("/account/orders", { waitUntil: "networkidle" });
  await expect(page.locator("main")).toContainText(number);
});

test("signed-in buyer pays cash on delivery from the product page", async ({ page }) => {
  await demoLogin(page, "Xaridor");
  await page.goto("/p/bolalar-futbolkasi", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Hozir sotib olish/ }).filter({ visible: true }).first().click();
  await page.waitForURL(/\/cart/);
  await page.getByRole("button", { name: "Rasmiylashtirishga o‘tish" }).click();
  await page.waitForURL(/\/checkout/);
  await expect(page.getByText(/\d{2}:\d{2}[–-]\d{2}:\d{2}/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByText("Qabul qilganda to‘lash").click();
  await page.getByRole("button", { name: "Buyurtma berish", exact: true }).click();
  await page.waitForURL(/\/checkout\/success\//, { timeout: 30_000 });
  const groupId = page.url().split("/").pop()!.split("?")[0];
  const pay = await one<{ method: string; status: string }>(`SELECT method, status FROM "Payment" WHERE "groupId" = $1`, [groupId]);
  expect(pay).toEqual({ method: "COD", status: "PENDING" });
});
