import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { demoLogin, prepare } from "./support";

// WCAG 2.1 A/AA automated checks (contrast, names, landmarks, forms) in both themes, plus
// reflow (1.4.10): no page may scroll sideways, which matters on the phone-sized project.
const PUBLIC = ["/", "/c/smartfonlar", "/p/kuk-choy-95", "/search?q=telefon", "/deals", "/videos", "/live", "/trade-in", "/developers", "/legal/privacy", "/auth/login", "/nasiya"];
const BUYER = ["/cart", "/checkout", "/account", "/account/orders", "/account/nasiya", "/account/business"];

/** axe violations plus horizontal overflow, as one readable list per page. */
async function problems(page: Page, path: string, exclude?: string) {
  const axe = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  const r = await (exclude ? axe.exclude(exclude) : axe).analyze();
  const found = r.violations.map((v) => `${path}: ${v.id} (${v.nodes.length})`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) found.push(`${path}: reflow (+${overflow}px sideways)`);
  return found;
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ context, baseURL }) => {
      await prepare(context, baseURL!);
      await context.addCookies([{ name: "anor_theme", value: theme, url: baseURL! }]);
    });

    test("public pages have no WCAG A/AA violations", async ({ page }) => {
      for (const path of PUBLIC) {
        await page.goto(path, { waitUntil: "load" });
        await page.waitForTimeout(1200);
        expect(await problems(page, path, ".leaflet-container")).toEqual([]);
      }
    });

    test("signed-in pages have no WCAG A/AA violations", async ({ page }) => {
      await demoLogin(page, "Xaridor");
      for (const path of BUYER) {
        await page.goto(path, { waitUntil: "load" });
        await page.waitForTimeout(1200);
        expect(await problems(page, path)).toEqual([]);
      }
    });
  });
}

test("keyboard: skip link jumps to the main content", async ({ page, context, baseURL }) => {
  await prepare(context, baseURL!);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /Asosiy kontentga/ });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  expect(page.url()).toContain("#main");
});
