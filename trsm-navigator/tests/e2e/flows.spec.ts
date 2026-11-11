import { expect, test } from "@playwright/test";
import { boot, chooseStart, searchAndPick, state, waitForCamera } from "./helpers";

test("Test A: same-floor route PASS (1-004) → Steve & Rashmi Gupta Lecture Theatre (1-067)", async ({ page }) => {
  const errors = await boot(page);
  await searchAndPick(page, "1-067", "L7:1-067");
  await expect(page.getByTestId("place-name")).toHaveText("Steve & Rashmi Gupta Lecture Theatre");
  await page.getByTestId("directions").click();
  await chooseStart(page, "PASS", "L7:1-004");
  await expect(page.getByTestId("route-summary")).toBeVisible();
  const s = await state(page);
  expect(s.legs).toEqual(["L7"]);
  expect(s.valid).toBe(true); // walls/courtyard validation inside the app
  expect(s.instructions[0]).toContain("Program Advising and Student Success (PASS)");
  expect(s.instructions.at(-1)).toMatch(/Lecture Theatre \(1-067\) is (on your left|on your right|straight ahead)/);
  await expect(page.getByTestId("step-list")).toContainText("Lecture Theatre");
  expect(errors).toEqual([]);
});

test("Test B: search for Business Career Hub / 2-148 selects the 8th-floor destination", async ({ page }) => {
  const errors = await boot(page);
  await searchAndPick(page, "Business Career Hub");
  await expect(page.getByTestId("place-name")).toHaveText("Business Career Hub");
  await expect(page.getByTestId("place-meta")).toContainText("Room 2-148");
  await expect(page.getByTestId("place-meta")).toContainText("8th floor");
  await expect(page.getByTestId("floor-8")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close" }).first().click();
  await searchAndPick(page, "2-148", "L8:2-148");
  await expect(page.getByTestId("place-name")).toHaveText("Business Career Hub");
  expect(errors).toEqual([]);
});

test("Test C + D: multi-floor route BCH (8th) → Harry Rosen Lecture Hall (9th) with Demo Walk", async ({ page }) => {
  const errors = await boot(page);
  await waitForCamera(page);
  await searchAndPick(page, "Harry Rosen", "L9:3-176");
  await page.getByTestId("directions").click();
  await chooseStart(page, "Business Career Hub", "L8:2-148");
  await expect(page.getByTestId("route-summary")).toContainText("8th → 9th");
  let s = await state(page);
  expect(s.legs).toEqual(["L8", "L9"]);
  expect(s.transitions).toEqual(["elevator"]);
  expect(s.valid).toBe(true);
  expect(s.instructions.join(" ")).toContain("Take the elevator up to the 9th floor.");
  await expect(page.getByTestId("floor-8")).toHaveAttribute("aria-pressed", "true");

  // Test D: demo walk
  await page.getByTestId("demo-walk").click();
  await expect(page.locator('[data-testid="instruction-banner"]:visible').first()).toBeVisible();
  await expect(page.locator('[data-testid="demo-badge"]:visible').first()).toContainText("simulated");
  const p0 = (await state(page)).position;
  const cam0 = await page.evaluate(() => (window as unknown as { __trsmCam: () => number[] }).__trsmCam());
  const firstInstr = await page.locator('[data-testid="current-instruction"]:visible').first().textContent();
  await page.waitForTimeout(1800);
  s = await state(page);
  expect(s.progress).toBeGreaterThan(5); // the blue dot advances
  expect(s.follow).toBe(true);
  expect(s.position!.p).not.toEqual(p0!.p);
  const cam1 = await page.evaluate(() => (window as unknown as { __trsmCam: () => number[] }).__trsmCam());
  expect(Math.hypot(cam1[0] - cam0[0], cam1[1] - cam0[1])).toBeGreaterThan(3); // camera follows
  await page.getByRole("button", { name: "4×" }).click();
  await expect(page.locator('[data-testid="current-instruction"]:visible').first()).not.toHaveText(firstInstr ?? "", { timeout: 15000 }); // instructions update
  // floor switches automatically at the elevator
  await expect(page.getByTestId("floor-9")).toHaveAttribute("aria-pressed", "true", { timeout: 20000 });
  await expect(page.getByTestId("arrived")).toBeVisible({ timeout: 25000 });
  await expect(page.getByTestId("arrived")).toContainText("Harry Rosen Lecture Hall");
  expect(errors).toEqual([]);
});

test("Demo Walk controls: pause, restart and stop", async ({ page }) => {
  await boot(page, "/?anchor=TRSM-7-03&to=L7:1-067");
  await page.getByTestId("demo-walk").click();
  await page.waitForTimeout(800);
  await page.getByTestId("demo-play").click(); // pause
  const a = (await state(page)).progress;
  await page.waitForTimeout(700);
  expect((await state(page)).progress).toBeCloseTo(a, 1);
  await page.getByTestId("demo-restart").click();
  await page.waitForTimeout(150);
  expect((await state(page)).progress).toBeLessThan(a);
  await page.getByTestId("stop-nav").click();
  await expect(page.getByTestId("directions-panel")).toBeVisible();
});

test("First-time visitor: browse a category, choose a start, follow steps one at a time", async ({ page }) => {
  const errors = await boot(page);
  await page.getByTestId("browse-washroom").click();
  await expect(page.getByTestId("browse-list")).toContainText("8th floor");
  await page.getByTestId("browse-item").first().click();
  await expect(page.getByTestId("place-name")).toHaveText("Washrooms");
  await page.getByTestId("directions").click();
  await expect(page.getByTestId("where-are-you")).toBeVisible();
  await page.getByTestId("quick-L7:elevator-south-west").click();
  await expect(page.getByTestId("route-summary")).toBeVisible();
  await expect(page.getByTestId("start-nav")).toBeInViewport();
  await page.getByTestId("start-nav").click();
  const banner = page.locator('[data-testid="current-instruction"]:visible').first();
  const steps = (await state(page)).instructions;
  await expect(banner).toHaveText(steps[0]);
  for (let i = 1; i < steps.length; i++) {
    await page.getByTestId("next-step").click();
    await expect(banner).toHaveText(steps[i]); // one tap = exactly one step
  }
  await page.getByTestId("next-step").click();
  await expect(page.getByTestId("arrived")).toBeVisible();
  expect(errors).toEqual([]);
});
