import { expect, test } from "@playwright/test";
import { prepare } from "./support";

test("robots, sitemap and structured data", async ({ request, page, context, baseURL }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /account");
  expect(robots).toContain("Sitemap:");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/p/kuk-choy-95");
  expect(sitemap).toContain('hreflang="ru"');

  await prepare(context, baseURL!);
  await page.goto("/p/kuk-choy-95", { waitUntil: "networkidle" });
  const types = await page.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => JSON.parse(x.textContent ?? "{}")["@type"]));
  expect(types).toEqual(expect.arrayContaining(["Product", "BreadcrumbList"]));
  const og = await page.getAttribute('meta[property="og:image"]', "content");
  const card = await request.get(new URL(og!).pathname + new URL(og!).search);
  expect(card.headers()["content-type"]).toBe("image/png");
});

test("installable PWA, deep links and health", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  expect((await request.get("/sw.js")).headers()["cache-control"]).toContain("no-cache");
  const open = await request.get("/open?to=web%2Banor%3A%2F%2Fp%2Fkuk-choy-95", { maxRedirects: 0 });
  expect(open.headers().location).toMatch(/\/p\/kuk-choy-95$/);
  const evil = await request.get("/open?to=https%3A%2F%2Fevil.example%2F", { maxRedirects: 0 });
  expect(new URL(evil.headers().location, "http://x").pathname).toBe("/");
  const health = await request.get("/health");
  expect(health.status()).toBe(200);
  expect((await health.json()).checks.database.ok).toBe(true);
});

// The service worker only runs in production builds (`npm run build && npm start`).
test("offline: a visited catalog page still opens without network", async ({ page, context, baseURL }) => {
  test.skip(!process.env.CI && process.env.E2E_PROD !== "1", "service worker runs in production builds only");
  await prepare(context, baseURL!);
  await page.goto("/p/kuk-choy-95", { waitUntil: "networkidle" });
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 }).catch(async () => {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 });
  });
  await page.reload({ waitUntil: "networkidle" });
  // context.setOffline() does not reach the service worker's own fetches in Chromium; aborting
  // every request does, so the worker really has to answer from its cache.
  let fromWorker = 0;
  await context.route("**/*", (route) => {
    if (route.request().serviceWorker()) fromWorker++;
    return route.abort("internetdisconnected");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ko‘k choy");
  // Private pages are never cached: the offline page answers instead.
  await page.goto("/account/orders", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText("Internet aloqasi yo‘q");
  expect(fromWorker).toBeGreaterThan(0);
  await context.unrouteAll({ behavior: "ignoreErrors" });
});
