import { expect, type Page } from "@playwright/test";

export async function boot(page: Page, url = "/") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await expect(page.getByTestId("panel")).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __TRSM__?: unknown }).__TRSM__);
  return errors;
}

export async function waitForCamera(page: Page) {
  await page.waitForFunction(() => typeof (window as unknown as { __trsmCam?: unknown }).__trsmCam === "function", null, { timeout: 15000 });
  await page.waitForTimeout(600);
}

export const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __TRSM__: { getState: () => Record<string, unknown> } }).__TRSM__.getState() as {
      floor: string; phase: string; follow: boolean; progress: number; start: { label: string } | null;
      route: null | { legs: { floor: string }[]; transitions: { connector: { type: string; id: string } }[]; validation: { ok: boolean }; warnings: string[]; instructions: { text: string }[]; destination: { id: string } };
      position: null | { floor: string; p: [number, number] };
    };
    return {
      floor: s.floor, phase: s.phase, follow: s.follow, progress: s.progress, start: s.start?.label ?? null,
      legs: s.route?.legs.map((l) => l.floor) ?? [], transitions: s.route?.transitions.map((t) => t.connector.type) ?? [],
      valid: s.route?.validation.ok ?? null, warnings: s.route?.warnings ?? [], destination: s.route?.destination.id ?? null,
      instructions: s.route?.instructions.map((i) => i.text) ?? [], position: s.position,
    };
  });

/** Search box: the mobile top bar and the desktop sidebar each render one; use the visible one. */
export const searchBox = (page: Page) => page.locator('[data-testid="search"]:visible').first();

export async function searchAndPick(page: Page, q: string, destId?: string) {
  const box = searchBox(page);
  await box.click();
  await box.fill(q);
  const result = destId ? page.locator(`[data-testid="search-result"][data-dest="${destId}"]:visible`).first() : page.locator('[data-testid="search-result"]:visible').first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByTestId("place-card")).toBeVisible();
}

export async function chooseStart(page: Page, q: string, destId: string) {
  const box = page.getByTestId("start-search");
  if (!(await box.isVisible())) await page.getByTestId("start-field").click();
  await box.fill(q);
  await page.locator(`[data-testid="search-result"][data-dest="${destId}"]:visible`).first().click();
}
