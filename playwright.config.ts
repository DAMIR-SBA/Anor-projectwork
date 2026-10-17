import { defineConfig, devices } from "@playwright/test";

// E2E against a seeded demo database (DEMO_MODE=true for the one-click demo logins).
// Locally it reuses `npm run dev` on :3000; CI builds once and runs `npm start`.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const prod = !!process.env.CI || process.env.E2E_PROD === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // The specs share one demo database; running them one at a time keeps them independent.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    locale: "uz-UZ",
    timezoneId: "Asia/Tashkent",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /(buy-flow|a11y)\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: prod ? "npm run start" : "npm run dev", url: baseURL, reuseExistingServer: !process.env.CI, timeout: 240_000, stdout: "ignore", stderr: "pipe" },
});
