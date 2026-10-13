// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { assertLayout } from "./layout-check";

for (const language of ["en", "zh-CN"] as const) {
  for (const width of [1440, 1024, 768, 390, 360]) {
    for (const colorScheme of width === 1440 || width === 390
      ? (["light", "dark"] as const)
      : (["light"] as const)) {
      test(`board ${width}px ${language} ${colorScheme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript(
          (choice) => localStorage.setItem("stintwork.language", choice),
          language,
        );
        const externalRequests: string[] = [];
        await page.route("**/*", async (route) => {
          const url = new URL(route.request().url());
          if (url.hostname !== "127.0.0.1") {
            externalRequests.push(url.href);
            await route.abort();
          } else await route.continue();
        });
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        await expect(page.locator('.board-scroll [data-work-item="long-title"]')).toBeAttached();
        await expect(page.locator('.board-scroll [data-work-item="chinese-title"]')).toHaveText(
          /^这是一个只有中文/,
        );
        const board = page.locator(".board-scroll");
        await expect(board).toBeVisible();
        const label = await page.locator(".board-milestone-label").boundingBox();
        const stats = await page.locator(".board-stats").boundingBox();
        const context = await page.locator(".board-toolbar-context").boundingBox();
        const actions = await page.locator(".board-toolbar-actions").boundingBox();
        const buttons = await page.locator(".board-toolbar-actions > button").all();
        const roadmap = await buttons[0].boundingBox();
        const create = await buttons[1].boundingBox();
        if (!label || !stats || !context || !actions || !roadmap || !create)
          throw new Error("Board toolbar groups and actions must be visible");
        expect(Math.abs(roadmap.y - create.y)).toBeLessThanOrEqual(1);
        if (width === 1440) {
          expect(
            Math.abs(label.y + label.height / 2 - stats.y - stats.height / 2),
          ).toBeLessThanOrEqual(1);
          expect(stats.x - label.x - label.width).toBeGreaterThanOrEqual(8);
          expect(stats.x - label.x - label.width).toBeLessThanOrEqual(24);
          expect(actions.x).toBeGreaterThan(context.x + context.width);
        } else if (width < 1024) {
          expect(actions.y).toBeGreaterThanOrEqual(context.y + context.height);
        }
        const stages = page.locator(".stage-scroll");
        const columns = stages.locator(".stage-column");
        await expect(columns.locator(".stage-header .count")).toHaveCount(6);
        if (width === 390 || width === 768) {
          expect(await stages.evaluate((element) => getComputedStyle(element).scrollSnapType)).toBe(
            "x mandatory",
          );
          const viewport = await stages.boundingBox();
          const first = await columns.nth(0).boundingBox();
          const second = await columns.nth(1).boundingBox();
          if (!viewport || !first || !second) throw new Error("Stage columns must have bounds");
          expect(Math.abs(first.width - width * 0.85)).toBeLessThanOrEqual(1);
          expect(second.x).toBeLessThan(viewport.x + viewport.width);
          expect(second.x + second.width).toBeGreaterThan(viewport.x + viewport.width);
          await stages.evaluate((element) => {
            element.scrollLeft = element.clientWidth * 0.65;
          });
          await expect
            .poll(async () => {
              const snapped = await columns.nth(1).boundingBox();
              return snapped ? Math.abs(snapped.x - viewport.x) : Number.POSITIVE_INFINITY;
            })
            .toBeLessThanOrEqual(1);
          await page.locator(".stage-navigation button").first().click();
          await expect.poll(() => stages.evaluate((element) => element.scrollLeft)).toBe(0);
          await page.locator(".stage-navigation button").last().click();
          await expect
            .poll(async () => {
              const next = await columns.nth(1).boundingBox();
              return next ? Math.abs(next.x - viewport.x) : Number.POSITIVE_INFINITY;
            })
            .toBeLessThanOrEqual(1);
        }
        await assertLayout(page, { region: ".pipeline-main" });
        if (width < 1200) {
          expect(
            await stages.evaluate((element) => element.scrollWidth > element.clientWidth),
          ).toBe(true);
        }
        await stages.evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        if (width < 1200)
          expect(await stages.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
        await assertLayout(page, { region: ".pipeline-main" });
        await stages.evaluate((element) => {
          element.scrollLeft = 0;
        });
        expect(externalRequests).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath("board.png"), fullPage: true });
      });
    }
  }
}
