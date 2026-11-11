import { expect, test } from "@playwright/test";
import { boot, searchAndPick, state } from "./helpers";

test("Test E: QR anchor URL sets floor, location and routes from it", async ({ page }) => {
  const errors = await boot(page, "/?anchor=TRSM-8-03");
  await expect(page.getByTestId("notice")).toContainText("Outside Business Career Hub (2-148)");
  await expect(page.getByTestId("floor-8")).toHaveAttribute("aria-pressed", "true");
  let s = await state(page);
  expect(s.start).toContain("Outside Business Career Hub");
  expect(s.position?.floor).toBe("L8");
  await searchAndPick(page, "3-180", "L9:3-180");
  await page.getByTestId("directions").click();
  await expect(page.getByTestId("start-label")).toContainText("Outside Business Career Hub");
  s = await state(page);
  expect(s.legs[0]).toBe("L8");
  expect(s.legs.at(-1)).toBe("L9");
  expect(s.valid).toBe(true);
  // rescan another anchor: route recalculates from the new position
  await page.goto("/#TRSM-9-03");
  await expect(page.getByTestId("notice")).toContainText("Outside Harry Rosen Lecture Hall");
  await expect(page.getByTestId("floor-9")).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("Test E (simulated scan): the QR dialog can place you at a test anchor", async ({ page }) => {
  await boot(page);
  await page.getByTestId("open-qr").click();
  await page.getByText("Testing without printed codes").click();
  await page.getByTestId("sim-TRSM-7-04").click();
  await expect(page.getByTestId("notice")).toContainText("Hall by Ted's Bagels");
  expect((await state(page)).start).toContain("Hall by Ted's Bagels");
});

test("Test F: accessible routing avoids escalators and discloses unverified accessibility", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("trsm.allowUnverified", "1"));
  await boot(page, "/?anchor=TRSM-8-03&to=L9:3-176");
  await page.getByText("Accessible route").click();
  await expect(page.getByTestId("route-summary")).toBeVisible();
  let s = await state(page);
  expect(s.transitions.length).toBeGreaterThan(0);
  expect(s.transitions.every((t) => t === "elevator")).toBe(true);
  expect(s.warnings.join(" ")).toContain("not confirmed as wheelchair accessible");
  await page.getByTestId("notes-toggle").click();
  await expect(page.getByTestId("route-warnings")).toContainText("not confirmed as wheelchair accessible");
  // a room that is only reachable across an unexplained hatched area has no accessible route
  await page.evaluate(() => (window as unknown as { __TRSM__: { getState: () => { select: (id: string) => void } } }).__TRSM__.getState().select("L7:1-020"));
  await expect(page.getByTestId("route-error")).toContainText("step-free");
  s = await state(page);
  expect(s.valid).toBeNull();
});

test("Test H: invalid destinations, invalid QR anchors, sensors and WebGL fallbacks don't crash", async ({ page }) => {
  const errors = await boot(page, "/?to=L7:9-999");
  await expect(page.getByTestId("notice")).toContainText("isn't in the map data");
  await page.goto("/?anchor=TRSM-9-99");
  await expect(page.getByTestId("notice")).toContainText("isn't registered");
  expect((await state(page)).start).toBeNull();
  await page.goto("/?anchor=hello");
  await expect(page.getByTestId("notice")).toContainText("isn't a TRSM positioning code");
  // search with no results shows an empty state, not an error
  await page.locator('[data-testid="search"]:visible').first().fill("zzqqxx");
  await expect(page.getByTestId("search-empty")).toBeVisible();
  // experimental sensors on a desktop browser with no motion data
  await page.goto("/?anchor=TRSM-7-03&to=L7:1-067");
  await page.getByTestId("sensors").check();
  await page.getByTestId("start-nav").click();
  await expect(page.getByTestId("nav-panel")).toContainText(/motion|QR|location/i, { timeout: 6000 });
  await expect(page.locator('[data-testid="instruction-banner"]:visible').first()).toContainText(/estimated position/i);
  // no WebGL → 2D SVG fallback
  await page.goto("/?render=svg");
  await expect(page.getByTestId("svg-fallback")).toBeVisible();
  expect(errors).toEqual([]);
});

test("organiser pages: QR anchor sheet and inspector render", async ({ page }) => {
  await page.goto("/anchors/");
  await expect(page.getByTestId("anchor-card")).toHaveCount(13);
  await expect(page.locator('[data-testid="anchor-card"] svg').first()).toBeVisible();
  await page.goto("/inspect/");
  await page.getByText("Validate routes to every destination").click();
  await expect(page.getByTestId("sweep-result")).toContainText("307 of 307");
});
