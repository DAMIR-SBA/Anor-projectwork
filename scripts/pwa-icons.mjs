// Renders the PWA / Apple touch icons from the brand SVGs (run once; outputs are committed).
// Usage: node scripts/pwa-icons.mjs   (CHROMIUM_PATH=/path/to/chromium if Playwright has no browser)
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
const svg = (file) => `data:image/svg+xml;base64,${readFileSync(file).toString("base64")}`;
const jobs = [
  { src: "public/brand/anor-maskable.svg", size: 192, out: "public/icons/icon-192.png" },
  { src: "public/brand/anor-maskable.svg", size: 512, out: "public/icons/icon-512.png" },
  { src: "public/brand/anor-maskable.svg", size: 512, out: "public/icons/maskable-512.png" },
  { src: "public/brand/anor-maskable.svg", size: 180, out: "public/icons/apple-touch-icon.png" },
  { src: "public/brand/anor-maskable.svg", size: 96, out: "public/icons/shortcut-96.png" },
];
for (const j of jobs) {
  await page.setViewportSize({ width: j.size, height: j.size });
  await page.setContent(`<body style="margin:0"><img src="${svg(j.src)}" style="display:block;width:${j.size}px;height:${j.size}px"></body>`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: j.out, omitBackground: true });
  console.log("wrote", j.out);
}
await browser.close();
