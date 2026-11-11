import { chromium } from "@playwright/test";
const [,, base, out] = process.argv;
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(base + "?anchor=TRSM-7-03&to=L9:3-180", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
await page.screenshot({ path: out });
await browser.close();
