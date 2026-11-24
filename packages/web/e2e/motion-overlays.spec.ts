// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { en } from "../src/i18n/en";
import { dialogSnapshot } from "./dialogs.fixture";
import { sampleFrames, waitForRest } from "./support/frames";

test.use({ contextOptions: { reducedMotion: "no-preference", colorScheme: "light" } });
const identity = (value: string) => value === "none" || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(value);

for (const width of [1440, 390]) {
  test(`overlay motion at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("stintwork.language", "en"));
    await page.route("**/api/project", (route) => route.fulfill({ json: dialogSnapshot }));
    await page.routeWebSocket("**/api/live", (socket) =>
      socket.send(JSON.stringify(dialogSnapshot)),
    );
    await page.goto("/?view=pipeline");
    const trigger = page.getByRole("button", { name: en.planning.create.title, exact: true });
    const selector = '[role="dialog"]';
    await trigger.click();
    const frames = await sampleFrames(page, selector, 700);
    expect(frames.some((frame) => Number(frame.opacity) < 0.99 || !identity(frame.transform))).toBe(
      true,
    );
    expect(Number(frames.at(-1)?.opacity)).toBeCloseTo(1, 2);
    expect(identity(frames.at(-1)?.transform ?? "")).toBe(true);
    await waitForRest(page, selector);
    await page.keyboard.press("Escape");
    await expect(page.locator(selector)).toHaveCount(0, { timeout: 280 });
    for (let i = 0; i < 2; i++) {
      await trigger.click();
      await page.keyboard.press("Escape");
    }
    await expect(page.locator(selector)).toHaveCount(0, { timeout: 280 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await trigger.click();
    const reduced = await sampleFrames(page, selector, 500);
    expect(reduced.every((frame) => identity(frame.transform))).toBe(true);
    expect(reduced.some((frame) => Number(frame.opacity) < 0.99)).toBe(true);
    expect(Number(reduced.at(-1)?.opacity)).toBeCloseTo(1, 2);
    expect([...frames, ...reduced].every((frame) => frame.overflow <= 0)).toBe(true);
  });
}

test("sheet enters from the right at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addInitScript(() => localStorage.setItem("stintwork.language", "en"));
  await page.goto("/?view=pipeline");
  await page.locator('.board-scroll [data-work-item="long-title"]').click();
  const frames = await sampleFrames(page, '[role="dialog"]', 700);
  expect(frames[0].left).toBeGreaterThan(frames.at(-1)?.left ?? Infinity);
  expect(Number(frames.at(-1)?.opacity)).toBeCloseTo(1, 2);
  expect(identity(frames.at(-1)?.transform ?? "")).toBe(true);
  expect(frames.every((frame) => frame.overflow <= 0)).toBe(true);
});

for (const width of [1440, 390])
  test(`popover grows from its Radix origin at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    // The app currently has no Popover consumer, so mount the actual wrapper in a browser fixture.
    const bundle = await build({
      stdin: {
        contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { MotionRoot } from './src/ui/MotionRoot'; import { Popover, PopoverTrigger, PopoverContent } from './src/ui/Popover'; createRoot(document.getElementById('fixture')).render(<MotionRoot><Popover><PopoverTrigger>Open popover</PopoverTrigger><PopoverContent aria-label="Fixture popover">Content</PopoverContent></Popover></MotionRoot>);`,
        resolveDir: process.cwd(),
        loader: "tsx",
      },
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      jsx: "automatic",
    });
    await page.goto("/");
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.id = "fixture";
      document.body.append(el);
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole("button", { name: "Open popover" }).click();
    const popover = page.getByRole("dialog", { name: "Fixture popover" });
    await expect(popover).toBeVisible();
    const origin = await popover.evaluate((element) => {
      const [x, y] = getComputedStyle(element).transformOrigin.split(" ").map(Number.parseFloat);
      const { width, height } = element.getBoundingClientRect();
      const transform = new DOMMatrix(getComputedStyle(element).transform);
      return { x, y, width: width / transform.a, height: height / transform.d };
    });
    expect(
      Math.abs(origin.x - origin.width / 2) > 1 || Math.abs(origin.y - origin.height / 2) > 1,
    ).toBe(true);
    const frames = await sampleFrames(page, '[aria-label="Fixture popover"]', 400);
    expect(frames.every((frame) => frame.overflow <= 0)).toBe(true);
  });
