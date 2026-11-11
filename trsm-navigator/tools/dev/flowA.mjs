import { chromium } from "@playwright/test";
const [,, url, prefix, w, h, waits] = process.argv;
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const mobile = +w < 800;
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${prefix}-a.png` });
const btn = page.getByTestId("demo-walk");
if (await btn.count()) { await btn.click(); }
let i = 0;
for (const t of (waits || "3000,6000").split(",")) { await page.waitForTimeout(+t); await page.screenshot({ path: `${prefix}-b${i++}.png` }); }
console.log(errs.join("\n") || "no errors");
await browser.close();
