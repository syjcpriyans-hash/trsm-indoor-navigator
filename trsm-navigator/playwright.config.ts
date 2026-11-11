import { defineConfig, devices } from "@playwright/test";

const chromeArgs = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const executablePath = process.env.CHROME_PATH || (process.env.CI ? undefined : "/usr/bin/google-chrome");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:4320",
    screenshot: "only-on-failure",
    launchOptions: { executablePath, args: chromeArgs },
  },
  webServer: process.env.BASE_URL ? undefined : { command: "npx serve out -l 4320", port: 4320, reuseExistingServer: true },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: "mobile-375", use: { ...devices["iPhone SE"], defaultBrowserType: "chromium", viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }, testMatch: /mobile\.spec/ },
    { name: "mobile-390", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, testMatch: /mobile\.spec|flows\.spec/ },
  ],
});
