import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import "dotenv/config";
import pg from "pg";

/** Direct database access for setup and for checking what the UI did. */
let pool: pg.Pool | null = null;
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!process.env.DATABASE_URL) throw new Error("e2e: DATABASE_URL is not set (the same database the app under test uses)");
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  return (await pool.query(text, params)).rows as T[];
}
export const one = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await sql<T>(text, params))[0];

/**
 * Top a variant up to at least `min` units (its fullest warehouse, plus the cached total), so
 * specs that buy the same demo items stay repeatable on a database reused across runs.
 */
export async function ensureStock(variantId: string, min: number) {
  const [top] = await sql<{ warehouseId: string }>(`SELECT "warehouseId" FROM "WarehouseStock" WHERE "variantId" = $1 ORDER BY quantity DESC LIMIT 1`, [variantId]);
  if (!top) return;
  const [{ total }] = await sql<{ total: number }>(`SELECT COALESCE(SUM(quantity), 0)::int AS total FROM "WarehouseStock" WHERE "variantId" = $1`, [variantId]);
  if (total < min) await sql(`UPDATE "WarehouseStock" SET quantity = quantity + $3 WHERE "variantId" = $1 AND "warehouseId" = $2`, [variantId, top.warehouseId, min - total]);
  await sql(`UPDATE "Variant" SET stock = (SELECT COALESCE(SUM(quantity), 0) FROM "WarehouseStock" WHERE "variantId" = $1) WHERE id = $1`, [variantId]);
}

/** ensureStock for every variant of a product, by slug. */
export async function ensureProductStock(slug: string, min: number) {
  const rows = await sql<{ id: string }>(`SELECT v.id FROM "Variant" v JOIN "Product" p ON p.id = v."productId" WHERE p.slug = $1`, [slug]);
  for (const r of rows) await ensureStock(r.id, min);
}

/** Every test starts with cookies decided (no banner) and the Uzbek (Latin) storefront. */
export async function prepare(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: "anor_consent", value: "v1.a0.m0", url: baseURL },
    { name: "anor_locale", value: "uz", url: baseURL },
  ]);
}

export async function newPage(browser: Browser, baseURL: string, options: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext({ baseURL, ...options });
  await prepare(context, baseURL);
  return context.newPage();
}

/** One-click demo sign-in (DEMO_MODE): "Xaridor", "Sotuvchi", "Biznes xaridor", … */
export async function demoLogin(page: Page, who: string) {
  await page.goto("/auth/login", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: who, exact: true }).click();
  await page.waitForURL((u) => !u.pathname.includes("/auth/"), { timeout: 30_000 });
}

/** One-click demo staff sign-in by role key: "SUPER_ADMIN", "FINANCE", "SUPPORT", … */
export async function staffLogin(page: Page, role: string) {
  await page.goto("/staff/login", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: role, exact: true }).click();
  await page.waitForURL(/\/admin/, { timeout: 30_000 });
}

export async function emptyCart(login: string) {
  await sql(`DELETE FROM "CartItem" WHERE "cartId" IN (SELECT c.id FROM "Cart" c JOIN "User" u ON u.id = c."userId" WHERE u.login = $1)`, [login]);
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);
}

export const groupDigits = (n: number) => n.toLocaleString("ru-RU").replace(/ /g, " ");
