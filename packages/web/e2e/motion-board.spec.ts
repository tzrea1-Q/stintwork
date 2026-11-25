// SPDX-License-Identifier: Apache-2.0
import { expect, test, type WebSocketRoute } from "@playwright/test";
import { motionBoardSnapshot, moveMotionCard } from "./motion-board.fixture";
import { sampleElementFrames, sampleFrames } from "./support/frames";

test.use({ contextOptions: { reducedMotion: "no-preference", colorScheme: "light" } });

for (const initialView of ["pipeline", "overview"] as const) {
  test(`revealing Pipeline from ${initialView} does not animate cards, while opening the panel still does`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem("stintwork.language", "en"));
    const { snapshot } = motionBoardSnapshot();
    await page.route("**/api/project", (route) => route.fulfill({ json: snapshot }));
    await page.routeWebSocket("**/api/live", (connection) =>
      connection.send(JSON.stringify(snapshot)),
    );
    await page.goto(`/?view=${initialView}`);
    await expect(page.locator('[data-work-item="motion-0"]')).toBeAttached();
    await page.waitForTimeout(1000);
    if (initialView === "pipeline")
      await page.getByRole("button", { name: "Overview", exact: true }).click();
    const framesPromise = sampleElementFrames(page, ".stage-column .work-item", 600);
    await page.getByRole("button", { name: "Pipeline", exact: true }).click();
    const frames = await framesPromise;
    expect(frames.length).toBeGreaterThan(1);
    expect(frames[0]).toHaveLength(60);
    for (const frame of frames) {
      expect(frame).toHaveLength(frames[0].length);
      frame.forEach((card, index) => {
        expect(Math.hypot(card.translateX, card.translateY)).toBeLessThanOrEqual(1);
        for (const key of ["x", "y", "width", "height"] as const)
          expect(card[key]).toBe(frames[0][index][key]);
      });
    }
    const reflow = sampleElementFrames(page, ".stage-column .work-item", 600);
    await page.locator('[data-work-item="motion-0"]').click();
    const reflowFrames = await reflow;
    expect(
      reflowFrames.some((frame) =>
        frame.some((card) => Math.hypot(card.translateX, card.translateY) > 1),
      ),
    ).toBe(true);
  });
}

for (const width of [1440, 390]) {
  test(`board snapshot continuity at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("stintwork.language", "en"));
    const { snapshot, template } = motionBoardSnapshot();
    let socket: WebSocketRoute | undefined;
    await page.route("**/api/project", (route) => route.fulfill({ json: snapshot }));
    await page.routeWebSocket("**/api/live", (connection) => {
      socket = connection;
      connection.send(JSON.stringify(snapshot));
    });
    await page.goto("/?view=pipeline");
    const card = page.locator('[data-work-item="motion-0"]');
    await expect(card).toBeVisible();
    await expect.poll(() => !!socket).toBe(true);
    await page.waitForTimeout(1000);
    const oldLeft = await card.evaluate((element) => element.getBoundingClientRect().left);
    const targetLeft = await page
      .locator('[data-card-column="tickets"] .work-item')
      .first()
      .evaluate((element) => element.getBoundingClientRect().left);
    const framesPromise = sampleFrames(page, '[data-work-item="motion-0"]', 800);
    moveMotionCard(snapshot, 0, "tickets");
    socket?.send(JSON.stringify(snapshot));
    const frames = await framesPromise;
    await expect(card).toBeAttached();
    await expect(card).toHaveCount(1);
    expect(
      frames.some(
        ({ left }) =>
          left > Math.min(oldLeft, targetLeft) + 1 && left < Math.max(oldLeft, targetLeft) - 1,
      ),
    ).toBe(true);
    await expect
      .poll(() =>
        card.evaluate((element) =>
          element.closest("[data-card-column]")?.getAttribute("data-card-column"),
        ),
      )
      .toBe("tickets");
    snapshot.workItems.push({
      ...structuredClone(template),
      slug: "motion-arrival",
      column: "spec",
    });
    snapshot.milestones
      .find((milestone) => milestone.id === "active")
      ?.workItemSlugs.push("motion-arrival");
    socket?.send(JSON.stringify(snapshot));
    await expect(page.locator('[data-work-item="motion-arrival"]')).toBeAttached();
    const arrival = await sampleFrames(page, '[data-work-item="motion-arrival"]', 800);
    expect(arrival.some((frame) => Number(frame.opacity) < 1)).toBe(true);
    expect(Number(arrival.at(-1)?.opacity)).toBeCloseTo(1);
    const bulk = sampleFrames(page, '[data-work-item="motion-1"]', 500);
    for (let i = 1; i <= 13; i++) moveMotionCard(snapshot, i, "tickets");
    socket?.send(JSON.stringify(snapshot));
    expect(new Set((await bulk).map((frame) => Math.round(frame.left))).size).toBeLessThanOrEqual(
      2,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = sampleFrames(page, '[data-work-item="motion-14"]', 500);
    moveMotionCard(snapshot, 14, "tickets");
    socket?.send(JSON.stringify(snapshot));
    expect(
      new Set((await reduced).map((frame) => Math.round(frame.left))).size,
    ).toBeLessThanOrEqual(2);
    if (width === 1440) {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.evaluate(() => {
        (window as typeof window & { motionLongTasks: number[] }).motionLongTasks = [];
        new PerformanceObserver((list) =>
          (window as typeof window & { motionLongTasks: number[] }).motionLongTasks.push(
            ...list.getEntries().map((entry) => entry.duration),
          ),
        ).observe({ type: "longtask", buffered: false });
      });
      const reflow = page.evaluate(
        () =>
          new Promise<{ overflow: number; oversized: boolean; details: string[] }[]>((resolve) => {
            const frames: { overflow: number; oversized: boolean; details: string[] }[] = [];
            const start = performance.now();
            const sample = () => {
              const cards = [...document.querySelectorAll(".stage-column .work-item")];
              const overflow = document.documentElement.scrollWidth - innerWidth;
              const oversizedCards = cards.filter(
                (item) =>
                  item.getBoundingClientRect().width >
                  (item.closest(".stage-column")?.getBoundingClientRect().width ?? Infinity) + 1,
              );
              const details = oversizedCards.slice(0, 5).map((item) => {
                const column = item.closest(".stage-column");
                return `card ${item.querySelector("[data-work-item]")?.getAttribute("data-work-item")} width=${item.getBoundingClientRect().width} column=${column?.getAttribute("data-card-column")} width=${column?.getBoundingClientRect().width} transform=${getComputedStyle(item).transform}`;
              });
              if (overflow > 0) {
                details.push(
                  `document scrollWidth=${document.documentElement.scrollWidth}, viewport=${innerWidth}`,
                );
                details.push(
                  ...[...document.querySelectorAll("body *")]
                    .filter((element) => element.getBoundingClientRect().right > innerWidth)
                    .slice(0, 5)
                    .map(
                      (element) =>
                        `${element.tagName}.${element.className} right=${element.getBoundingClientRect().right} transform=${getComputedStyle(element).transform}`,
                    ),
                );
              }
              frames.push({ overflow, oversized: oversizedCards.length > 0, details });
              if (performance.now() - start < 600) requestAnimationFrame(sample);
              else resolve(frames);
            };
            requestAnimationFrame(sample);
          }),
      );
      await card.click();
      const reflowFrames = await reflow;
      const overflowFrames = reflowFrames.filter((frame) => frame.overflow > 0);
      const oversizedFrames = reflowFrames.filter((frame) => frame.oversized);
      expect(overflowFrames, JSON.stringify(overflowFrames.slice(0, 3))).toHaveLength(0);
      expect(oversizedFrames, JSON.stringify(oversizedFrames.slice(0, 3))).toHaveLength(0);
      expect(reflowFrames.every((frame) => frame.overflow <= 0 && !frame.oversized)).toBe(true);
      expect(
        await page.evaluate(() =>
          (window as typeof window & { motionLongTasks: number[] }).motionLongTasks.every(
            (duration) => duration <= 50,
          ),
        ),
      ).toBe(true);
    }
  });
}
