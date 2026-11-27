// SPDX-License-Identifier: Apache-2.0
import { expect, test, type WebSocketRoute } from "@playwright/test";
import { motionBoardSnapshot, moveMotionCard } from "./motion-board.fixture";

for (const mode of ["full", "reduced", "hidden"] as const) {
  test(`card content stays with its shell during ${mode} motion`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: mode === "reduced" ? "reduce" : "no-preference" });
    await page.addInitScript(() => localStorage.setItem("stintwork.language", "en"));
    const { snapshot } = motionBoardSnapshot();
    let socket: WebSocketRoute | undefined;
    await page.route("**/api/project", (route) => route.fulfill({ json: snapshot }));
    await page.routeWebSocket("**/api/live", (connection) => {
      socket = connection;
      connection.send(JSON.stringify(snapshot));
    });
    await page.goto("/?view=pipeline");
    const card = page.locator('[data-work-item="motion-30"]');
    await expect(card).toBeVisible();
    await expect.poll(() => !!socket).toBe(true);
    await page.waitForTimeout(1000);
    if (mode === "hidden") {
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden",
        });
      });
    }
    const framesPromise = page.evaluate(
      () =>
        new Promise<{ x: number; y: number; dx: number; dy: number }[]>((resolve) => {
          const frames: { x: number; y: number; dx: number; dy: number }[] = [];
          const start = performance.now();
          const sample = () => {
            const title = document.querySelector(
              '[data-work-item="motion-30"] span[data-truncate]',
            );
            const shell = title?.closest("article");
            if (title && shell) {
              const a = shell.getBoundingClientRect();
              const b = title.getBoundingClientRect();
              frames.push({ x: a.x, y: a.y, dx: b.x - a.x, dy: b.y - a.y });
            }
            if (performance.now() - start < 1500) requestAnimationFrame(sample);
            else resolve(frames);
          };
          requestAnimationFrame(sample);
        }),
    );
    // Ensure the sampler captures the original position before sending the update.
    await page.waitForTimeout(100);
    moveMotionCard(snapshot, 0, "tickets");
    socket?.send(JSON.stringify(snapshot));
    const frames = await framesPromise;
    expect(frames.length).toBeGreaterThan(1);
    expect(
      frames.some(
        (frame) => Math.abs(frame.x - frames[0].x) > 1 || Math.abs(frame.y - frames[0].y) > 1,
      ),
    ).toBe(true);
    for (const frame of frames) {
      expect(Math.abs(frame.dx - frames[0].dx)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(frame.dy - frames[0].dy)).toBeLessThanOrEqual(0.5);
    }
    if (mode === "hidden") {
      const offset = await page.evaluate(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const title = document.querySelector('[data-work-item="motion-30"] span[data-truncate]');
        const shell = title?.closest("article");
        if (!title || !shell) throw new Error("Missing card after visibility change");
        const a = shell.getBoundingClientRect();
        const b = title.getBoundingClientRect();
        return { dx: b.x - a.x, dy: b.y - a.y };
      });
      expect(Math.abs(offset.dx - frames[0].dx)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(offset.dy - frames[0].dy)).toBeLessThanOrEqual(0.5);
    }
  });
}

for (const [width, panel] of [
  [768, false],
  [768, true],
  [1024, true],
] as const) {
  test(`stage headers stay inside the board at ${width}px with panel ${panel ? "open" : "closed"}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("stintwork.language", "en"));
    const { snapshot } = motionBoardSnapshot();
    await page.route("**/api/project", (route) => route.fulfill({ json: snapshot }));
    await page.routeWebSocket("**/api/live", (connection) =>
      connection.send(JSON.stringify(snapshot)),
    );
    await page.goto("/?view=pipeline");
    const card = page.locator('[data-work-item="motion-0"]');
    await expect(card).toBeVisible();
    if (panel) await card.click();
    await page.waitForTimeout(1000);
    const bounds = await page.locator(".stage-board").evaluate((board) => {
      const rect = board.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        headers: [...board.querySelectorAll("header.stage-header")].map((header) => {
          const { left, right } = header.getBoundingClientRect();
          return { left, right };
        }),
      };
    });
    expect(bounds.headers.length).toBeGreaterThan(0);
    for (const header of bounds.headers) {
      expect(header.left).toBeGreaterThanOrEqual(bounds.left - 0.5);
      expect(header.right).toBeLessThanOrEqual(bounds.right + 0.5);
    }
  });
}
