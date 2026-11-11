import { expect, test } from "@playwright/test";
import { boot, searchAndPick, state, waitForCamera } from "./helpers";

test("Test G: mobile layout — search, floors, sheet, controls, labels", async ({ page }, info) => {
  const errors = await boot(page);
  const vw = page.viewportSize()!.width;
  // inputs are 16px so iOS Safari never auto-zooms on focus
  const fs = await page.locator('[data-testid="search"]:visible').first().evaluate((el) => getComputedStyle(el).fontSize);
  expect(fs).toBe("16px");
  // controls are at least 44px touch targets
  for (const id of ["floor-7", "floor-8", "floor-9", "compass", "view-toggle", "recenter"]) {
    const b = await page.getByTestId(id).boundingBox();
    expect(b!.width).toBeGreaterThanOrEqual(43);
    expect(b!.height).toBeGreaterThanOrEqual(43);
    expect(b!.x + b!.width).toBeLessThanOrEqual(vw);
  }
  await page.getByTestId("floor-9").click();
  await expect(page.getByTestId("map-canvas")).toHaveAttribute("data-floor", "L9");
  await page.getByTestId("view-toggle").click();
  await expect(page.getByTestId("map-canvas")).toHaveAttribute("data-view", "2d");
  await page.screenshot({ path: `test-results/mobile-${vw}-home.png` });

  await searchAndPick(page, "Bootcamp", "L9:3-180");
  // a map label is drawn and readable
  await expect(page.locator('[data-testid="map-canvas"] div', { hasText: "Bootcamp Lab" }).first()).toBeVisible();
  await page.getByTestId("directions").click();
  await expect(page.getByTestId("where-are-you")).toBeVisible();
  await page.getByTestId("quick-L9:elevator-south-west").click();
  await expect(page.getByTestId("route-summary")).toBeVisible();
  await expect(page.getByTestId("start-nav")).toBeInViewport();
  // the panel never covers the floor buttons
  const panel = await page.getByTestId("panel").boundingBox();
  const f7 = await page.getByTestId("floor-7").boundingBox();
  expect(f7!.y + f7!.height).toBeLessThan(panel!.y);
  await page.screenshot({ path: `test-results/mobile-${vw}-directions.png` });
  await page.getByTestId("demo-walk").click();
  await expect(page.locator('[data-testid="instruction-banner"]:visible').first()).toBeVisible();
  await page.waitForTimeout(1500);
  expect((await state(page)).progress).toBeGreaterThan(0);
  await page.screenshot({ path: `test-results/mobile-${vw}-navigating.png` });
  // the interface is fixed: dragging the panel or pinching the toolbar never scrolls or zooms the page
  const cdp = await page.context().newCDPSession(page);
  const panelBox = (await page.getByTestId("panel").boundingBox())!;
  const px = panelBox.x + panelBox.width / 2, py = panelBox.y + panelBox.height - 30;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: px, y: py }] });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: px, y: py - i * 25 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 120, y: 40, id: 1 }, { x: 260, y: 40, id: 2 }] });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 120 - i * 8, y: 40, id: 1 }, { x: 260 + i * 8, y: 40, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const after = await page.evaluate(() => ({ y: window.scrollY, top: document.scrollingElement!.scrollTop, scale: window.visualViewport?.scale ?? 1 }));
  expect(after).toEqual({ y: 0, top: 0, scale: 1 });
  expect((await page.getByTestId("panel").boundingBox())!.y).toBeCloseTo(panelBox.y, 0);

  expect(errors).toEqual([]);
  info.annotations.push({ type: "viewport", description: String(vw) });
});

test("Test G: touch pan/pinch gestures move the camera without selecting", async ({ page }) => {
  await boot(page);
  await waitForCamera(page);
  const cam0 = await page.evaluate(() => (window as unknown as { __trsmCam: () => number[] }).__trsmCam());
  const canvas = page.locator('[data-testid="map-canvas"] canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height * 0.4;
  // one-finger drag via CDP touch events
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy }] });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx + i * 12, y: cy + i * 6 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(500);
  const cam1 = await page.evaluate(() => (window as unknown as { __trsmCam: () => number[] }).__trsmCam());
  expect(Math.hypot(cam1[0] - cam0[0], cam1[1] - cam0[1])).toBeGreaterThan(5);
  // two-finger pinch zooms
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx - 40, y: cy, id: 1 }, { x: cx + 40, y: cy, id: 2 }] });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx - 40 - i * 12, y: cy, id: 1 }, { x: cx + 40 + i * 12, y: cy, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(500);
  const cam2 = await page.evaluate(() => (window as unknown as { __trsmCam: () => number[] }).__trsmCam());
  expect(cam2[2]).toBeLessThan(cam1[2]);
  expect((await state(page)).phase).toBe("explore");
});
