// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import type { ProjectSnapshot } from "@stintwork/core";
import { sampleFrames } from "./support/frames";

test.use({ contextOptions: { reducedMotion: "no-preference", colorScheme: "light" } });

for (const width of [1440, 390]) {
  test(`motion and reduced motion at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("stintwork.language", "en"));
    const snapshot: ProjectSnapshot = await (await page.request.get("/api/project")).json();
    const item = snapshot.workItems.find((entry) => entry.slug === "long-title");
    if (!item) throw new Error("Missing shared fixture item");
    snapshot.milestones = [
      { id: "motion", name: "Motion milestone", status: "active", workItemSlugs: [item.slug] },
    ];
    item.milestone = "motion";
    await page.route("**/api/project", (route) => route.fulfill({ json: snapshot }));
    await page.routeWebSocket("**/api/live", (socket) => socket.send(JSON.stringify(snapshot)));
    await page.goto("/");
    const progress = page.locator('[data-slot="progress"]').first();
    await expect(progress).toBeVisible();
    const value = Number(await progress.getAttribute("aria-valuenow"));
    const max = Number(await progress.getAttribute("aria-valuemax"));
    const transform = await progress
      .locator('[data-slot="progress-indicator"]')
      .evaluate((element) => getComputedStyle(element).transform);
    const scale = (value: string) =>
      value === "none" ? 1 : Number(value.match(/^matrix\(([^,]+)/)?.[1]);
    expect(scale(transform)).toBeCloseTo(value / max, 2);
    await page.goto("/?view=pipeline");
    await page.locator('.board-scroll [data-work-item="long-title"]').click();
    const drawer = page.locator(".work-item-drawer");
    const button = drawer.getByRole("button").first();
    await button.evaluate((element) => element.setAttribute("data-motion-test", "press"));
    const pressSelector = '[data-motion-test="press"]';
    const box = await button.boundingBox();
    if (!box) throw new Error("Missing button box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const press = await sampleFrames(page, pressSelector, 200);
    await page.mouse.move(box.x - 5, box.y - 5);
    await page.mouse.up();
    const release = await sampleFrames(page, pressSelector, 500);
    expect(press.some((frame) => scale(frame.transform) < 0.999)).toBe(true);
    expect(scale(release.at(-1)?.transform ?? "none")).toBeCloseTo(1, 2);
    const details = drawer
      .locator("details")
      .filter({ has: page.getByText("Agents by stage", { exact: true }) });
    await details.evaluate((element) => element.setAttribute("data-motion-test", "disclosure"));
    const disclosure = '[data-motion-test="disclosure"]';
    const opening = sampleFrames(page, disclosure, 450);
    await details.locator("summary").click();
    const heights = await opening;
    await expect(details).toHaveAttribute("open", "");
    expect(new Set(heights.map((frame) => frame.height)).size).toBeGreaterThan(2);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const reduced = await sampleFrames(page, pressSelector, 200);
    await page.mouse.up();
    expect(reduced.every((frame) => Math.abs(scale(frame.transform) - 1) < 0.001)).toBe(true);
    expect(
      [...press, ...release, ...heights, ...reduced].every((frame) => frame.overflow <= 0),
    ).toBe(true);
  });
}
