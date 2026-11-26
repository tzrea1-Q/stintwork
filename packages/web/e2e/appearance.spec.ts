// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import { sampleFrames, waitForRest } from "./support/frames";

for (const language of ["en", "zh-CN"] as const) {
  for (const width of [1440, 390]) {
    test(`appearance and motion ${language} ${width}px`, async ({ page }) => {
      const t = language === "en" ? en : zhCN;
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
      await page.addInitScript(
        (value) => localStorage.setItem("stintwork.language", value),
        language,
      );
      await page.goto("/");
      const open = async () => {
        await page.getByRole("button", { name: t.topBar.settings }).click();
      };
      const choose = async (group: string, choice: string) => {
        await open();
        await page
          .getByRole("group", { name: group })
          .getByRole("menuitemradio", { name: choice })
          .click();
      };
      await open();
      const menu = page.getByRole("menu", { name: t.topBar.settings });
      const box = await menu.boundingBox();
      if (!box) throw new Error("Settings menu has no bounding box");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(900);
      await page
        .getByRole("group", { name: t.topBar.appearance })
        .getByRole("menuitemradio", { name: t.topBar.themes.dark })
        .click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await page.reload();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await choose(t.topBar.appearance, t.topBar.themes.system);
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await choose(t.topBar.motion, t.topBar.motions.reduced);
      await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
      // The menu still fades under Reduced, but its scale animation is suppressed.
      await page.waitForSelector('[role="menu"]', { state: "detached" });
      const reducedFrames = page
        .waitForSelector('[role="menu"]')
        .then(() => sampleFrames(page, '[role="menu"]', 250));
      await open();
      const reduced = await reducedFrames;
      expect(reduced.some((frame) => Number(frame.opacity) < 1)).toBe(true);
      expect(Number(reduced.at(-1)?.opacity)).toBe(1);
      expect(
        reduced.every(
          (frame) => frame.transform === "none" || frame.transform === "matrix(1, 0, 0, 1, 0, 0)",
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await choose(t.topBar.motion, t.topBar.motions.full);
      await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
      await page.waitForSelector('[role="menu"]', { state: "detached" });
      const fullFrames = page
        .waitForSelector('[role="menu"]')
        .then(() => sampleFrames(page, '[role="menu"]', 250));
      await open();
      const full = await fullFrames;
      expect(
        full.some(
          (frame) => frame.transform !== "none" && frame.transform !== "matrix(1, 0, 0, 1, 0, 0)",
        ),
      ).toBe(true);
      await waitForRest(page, '[role="menu"]');
    });
  }
}
