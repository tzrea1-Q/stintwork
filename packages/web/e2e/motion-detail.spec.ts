// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Page } from "@playwright/test";
import { spring, tween } from "../src/ui/motion";
import { sampleFrames } from "./support/frames";

test.use({ contextOptions: { reducedMotion: "no-preference", colorScheme: "light" } });

const indicator = '.work-item-drawer [data-slot="tabs-indicator"]';
const duration = spring.layout.visualDuration * 1000 * 3;

async function openDetail(page: Page) {
  await page.addInitScript(() => localStorage.setItem("stintwork.language", "en"));
  await page.goto("/?view=pipeline");
  await page.locator('.board-scroll [data-work-item="long-title"]').click();
  await expect(page.locator(".work-item-drawer")).toBeVisible();
}

async function movesBetween(page: Page, selector: string, action: () => Promise<void>) {
  const start = await page
    .locator(selector)
    .evaluate((element) => element.getBoundingClientRect().left);
  const samples = sampleFrames(page, selector, duration);
  await action();
  const frames = await samples;
  const end = frames.at(-1)?.left ?? start;
  expect(Math.abs(end - start)).toBeGreaterThan(1);
  expect(
    frames.some(
      ({ left }) => left > Math.min(start, end) + 0.5 && left < Math.max(start, end) - 0.5,
    ),
  ).toBe(true);
  return frames;
}

for (const width of [1440, 1024, 390]) {
  test(`detail tabs glide and retarget at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openDetail(page);
    const drawer = page.locator(".work-item-drawer");
    await movesBetween(page, indicator, () => drawer.getByRole("tab", { name: "Tickets" }).click());
    await drawer.getByRole("tab", { name: "Overview" }).click();
    await expect(drawer.getByRole("tab", { name: "Overview" })).toBeFocused();
    await movesBetween(page, indicator, () => page.keyboard.press("ArrowRight"));
    for (const name of ["Tickets", "Overview", "Stints", "Spec", "Tickets"]) {
      await drawer.getByRole("tab", { name }).click();
    }
    const selected = drawer.getByRole("tab", { name: "Tickets" });
    await expect(selected).toHaveAttribute("aria-selected", "true");
    await expect(drawer.getByRole("tabpanel")).toBeVisible();
    await expect
      .poll(async () => {
        const [tab, marker] = await Promise.all([
          selected.boundingBox(),
          page.locator(indicator).boundingBox(),
        ]);
        return tab && marker ? Math.abs(tab.x - marker.x) : Infinity;
      })
      // The line sits inside the trigger border, as the original ::after underline did.
      .toBeLessThanOrEqual(1.5);
  });
}

for (const width of [1440, 1024]) {
  test(`docked detail and navigation motion at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openDetail(page);
    const drawer = page.locator("aside.work-item-drawer");
    const opening = await sampleFrames(
      page,
      "aside.work-item-drawer",
      tween.sheet.duration * 1000 * 2,
    );
    if (width === 1440) expect(opening[0].left).toBeGreaterThan(opening.at(-1)?.left ?? Infinity);
    const expanding = sampleFrames(page, "aside.work-item-drawer", duration);
    await drawer.getByRole("button", { name: /full screen/i }).click();
    const frames = await expanding;
    expect(new Set(frames.map(({ width: value }) => Math.round(value))).size).toBeGreaterThan(2);
    expect([...opening, ...frames].every(({ overflow }) => overflow <= 0)).toBe(true);
    const collapsing = sampleFrames(page, "aside.work-item-drawer", duration);
    await drawer.getByRole("button", { name: "Collapse to panel" }).click();
    const collapsed = await collapsing;
    expect(new Set(collapsed.map(({ width: value }) => Math.round(value))).size).toBeGreaterThan(2);
    expect(collapsed.every(({ overflow }) => overflow <= 0)).toBe(true);
    await drawer.getByRole("button", { name: "Close work item" }).click();
    await expect(drawer).toHaveCount(0, { timeout: tween.dismiss.duration * 1000 + 100 });
    await movesBetween(page, '[data-slot="nav-indicator"]', () =>
      page.getByRole("button", { name: "Overview", exact: true }).click(),
    );
  });

  test(`reduced motion removes detail movement at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDetail(page);
    const frames = await sampleFrames(page, "aside.work-item-drawer", tween.sheet.duration * 1000);
    expect(
      frames.every(
        ({ transform }) => transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)",
      ),
    ).toBe(true);
    const samples = sampleFrames(page, indicator, spring.selection.visualDuration * 1000 * 2);
    await page.locator(".work-item-drawer").getByRole("tab", { name: "Tickets" }).click();
    const positions = await samples;
    expect(new Set(positions.map(({ left }) => Math.round(left))).size).toBeLessThanOrEqual(2);
  });
}

test("docked controls respond to presses after entry", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDetail(page);
  const drawer = page.locator("aside.work-item-drawer");
  await expect
    .poll(() => drawer.evaluate((element) => getComputedStyle(element).transform))
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  for (const name of ["Expand to full screen", "Close work item"]) {
    const button = drawer.getByRole("button", { name });
    await button.evaluate((element) => element.setAttribute("data-motion-test", "detail-press"));
    const box = await button.boundingBox();
    if (!box) throw new Error(`Missing ${name} box`);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1440);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const frames = await sampleFrames(
      page,
      '[data-motion-test="detail-press"]',
      spring.press.visualDuration * 1000 * 2,
    );
    await page.mouse.move(box.x - box.width, box.y - box.height);
    await page.mouse.up();
    expect(
      frames.some(({ transform }) => {
        const scale = transform.match(/^matrix\(([^,]+)/)?.[1];
        return scale !== undefined && Number(scale) < 0.999;
      }),
    ).toBe(true);
    await button.evaluate((element) => element.removeAttribute("data-motion-test"));
  }
});
