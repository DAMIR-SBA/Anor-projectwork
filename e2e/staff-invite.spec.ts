import { expect, test } from "@playwright/test";
import { newPage, one, staffLogin } from "./support";

test("super admin invites a moderator who joins with their own credentials", async ({ browser, baseURL }) => {
  const admin = await newPage(browser, baseURL!);
  await staffLogin(admin, "SUPER_ADMIN");
  await admin.goto("/admin/staff", { waitUntil: "networkidle" });
  await admin.locator("#inv-role").selectOption("MODERATOR");
  await admin.getByRole("button", { name: "Xodimni taklif qilish" }).click();
  const dialog = admin.getByRole("dialog", { name: "Taklif yaratildi" });
  await expect(dialog).toBeVisible();
  const link = (await dialog.getByText(/\/staff\/invite\?code=/).innerText()).trim();
  const code = new URL(link).searchParams.get("code")!;
  expect(code).toMatch(/^[A-Z0-9-]{10,}$/);

  // The new employee opens the link in a fresh browser.
  const login = `mod_${Date.now().toString(36)}`;
  const recruit = await newPage(browser, baseURL!);
  await recruit.goto(`/staff/invite?code=${encodeURIComponent(code)}`, { waitUntil: "networkidle" });
  await expect(recruit.getByText(/Sizga beriladigan rol: Moderator/)).toBeVisible();
  await recruit.locator("#login").fill(login);
  await recruit.locator("#name").fill("Test Moderator");
  await recruit.locator("#password").fill("Moderator-Pass-2026!");
  await recruit.locator("#confirm").fill("Moderator-Pass-2026!");
  await recruit.locator("#accessCode").fill("mod-code-7391");
  await recruit.locator("#accessCodeConfirm").fill("mod-code-7391");
  await recruit.getByRole("button", { name: "Qo‘shilish" }).click();
  await recruit.waitForURL(/\/staff\/login/, { timeout: 30_000 });

  // The code is single-use.
  const used = await newPage(browser, baseURL!);
  await used.goto(`/staff/invite?code=${encodeURIComponent(code)}`, { waitUntil: "networkidle" });
  await expect(used.getByRole("heading", { name: "Taklif yaroqsiz" })).toBeVisible();

  // Sign in with login + password + personal access code.
  await recruit.locator("#login").fill(login);
  await recruit.locator("#password").fill("Moderator-Pass-2026!");
  await recruit.locator("#accessCode").fill("mod-code-7391");
  await recruit.getByRole("button", { name: /Kirish/ }).click();
  await recruit.waitForURL(/\/admin/, { timeout: 30_000 });
  await recruit.goto("/admin/moderation/products", { waitUntil: "networkidle" });
  expect(recruit.url()).toContain("/admin/moderation/products");

  // A moderator cannot manage staff.
  await recruit.goto("/admin/staff", { waitUntil: "networkidle" });
  expect(recruit.url()).not.toMatch(/\/admin\/staff$/);

  const audit = await one<{ n: number }>(`SELECT COUNT(*)::int n FROM "AuditLog" WHERE action LIKE 'staff.invite%' AND "createdAt" > now() - interval '5 minutes'`);
  expect(audit.n).toBeGreaterThanOrEqual(2);
});
