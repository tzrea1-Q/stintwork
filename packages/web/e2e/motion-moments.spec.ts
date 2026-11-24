// SPDX-License-Identifier: Apache-2.0
import { expect, test, type WebSocketRoute } from "@playwright/test";
import { richSnapshot } from "./rich.fixture";
import { sampleFrames, waitForRest } from "./support/frames";

test.use({ contextOptions: { reducedMotion: "no-preference", colorScheme: "light" } });
const identity = (transform: string) =>
  transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)";

const scaleX = (transform: string) => {
  if (identity(transform)) return 1;
  const match = /^matrix\(([^,]+)/.exec(transform);
  return match ? Number(match[1]) : 1;
};

for (const width of [1440, 390]) {
  test(`live moments at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("stintwork.language", "en"));
    const snapshot = structuredClone(richSnapshot);
    let socket: WebSocketRoute | undefined;
    await page.route("**/api/project", (route) => route.fulfill({ json: snapshot }));
    await page.routeWebSocket("**/api/live", (connection) => {
      socket = connection;
      connection.send(JSON.stringify(snapshot));
    });
    await page.goto("/?view=pipeline");
    await expect.poll(() => !!socket).toBe(true);
    const card = page.locator('[data-work-item="rich-spec"]');
    await card.click();
    const drawer = page.locator(".work-item-drawer:not([data-exiting])");
    await expect(drawer).toBeVisible();
    const stint = snapshot.workItems[1].activeStint;
    if (!stint) throw new Error("Missing active stint");
    stint.events.push({ type: "message", id: "motion-live", text: "Live motion message" });
    socket?.send(JSON.stringify(snapshot));
    const message = drawer.locator(".stint-event").filter({ hasText: "Live motion message" });
    await expect(message).toBeVisible();
    const arrival = await sampleFrames(page, '[data-arriving="true"]', 800);
    expect(arrival.some((frame) => Number(frame.opacity) < 0.99)).toBe(true);
    expect(Number(arrival.at(-1)?.opacity)).toBeCloseTo(1, 1);
    await drawer.getByRole("button", { name: /close work item/i }).click();
    await expect(page.locator(".work-item-drawer")).toHaveCount(0);
    await card.click();
    await expect(message).toBeVisible();
    await waitForRest(page, ".work-item-drawer");
    const history = await sampleFrames(page, ".stint-event:last-child", 100);
    expect(Number(history[0].opacity)).toBeCloseTo(1, 1);
    const title = '[data-work-item="rich-spec"]';
    const neighbour = sampleFrames(page, title, 500);
    snapshot.workItems[1].activeStint = null;
    socket?.send(JSON.stringify(snapshot));
    const positions = await neighbour;
    await expect(drawer.locator(".stint-stream")).toHaveCount(0);
    expect(
      Math.max(...positions.map((f) => f.left)) - Math.min(...positions.map((f) => f.left)),
    ).toBeLessThanOrEqual(1);
    await drawer.getByRole("button", { name: /close work item/i }).click();
    await expect(page.locator(".work-item-drawer")).toHaveCount(0);
    await page.locator('[data-work-item="rich-implement"]').click();
    await drawer.getByRole("tab", { name: "Tickets" }).click();
    const ticket = snapshot.workItems[3].tickets[0];
    const checkSelector = `[data-ticket-check=${JSON.stringify(ticket.path)}]`;
    await expect(page.locator(`${checkSelector} .lucide-circle`)).toBeAttached();
    const check = sampleFrames(page, checkSelector, 800);
    await page.evaluate(() => {});
    ticket.resolved = true;
    ticket.status = "resolved";
    socket?.send(JSON.stringify(snapshot));
    await expect(page.locator(`${checkSelector} .lucide-circle-check`)).toBeAttached();
    expect((await check).some((frame) => scaleX(frame.transform) < 0.99)).toBe(true);
    await waitForRest(page, checkSelector);
    socket?.send(JSON.stringify(snapshot));
    expect((await sampleFrames(page, checkSelector, 150)).every((f) => identity(f.transform))).toBe(
      true,
    );
    const badge = "#needs-you-trigger [data-needs-you-badge]";
    await expect(page.locator(badge)).toBeAttached();
    const badgeFrames = sampleFrames(page, badge, 800);
    await page.evaluate(() => {});
    snapshot.attentionItems.push(structuredClone(snapshot.attentionItems[0]));
    socket?.send(JSON.stringify(snapshot));
    await expect(page.locator("#needs-you-trigger")).toHaveAttribute(
      "aria-label",
      new RegExp(`^Needs you ${snapshot.attentionItems.length}(?:\\D|$)`),
    );
    expect((await badgeFrames).some((f) => scaleX(f.transform) > 1.01)).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    ticket.resolved = false;
    ticket.status = "ready-for-agent";
    socket?.send(JSON.stringify(snapshot));
    await expect(page.locator(`${checkSelector} .lucide-circle`)).toBeAttached();
    const reducedCheck = sampleFrames(page, checkSelector, 500);
    await page.evaluate(() => {});
    ticket.resolved = true;
    ticket.status = "resolved";
    socket?.send(JSON.stringify(snapshot));
    await expect(page.locator(`${checkSelector} .lucide-circle-check`)).toBeAttached();
    expect((await reducedCheck).every((f) => identity(f.transform))).toBe(true);
    snapshot.attentionItems.push(structuredClone(snapshot.attentionItems[0]));
    socket?.send(JSON.stringify(snapshot));
    await expect(page.locator("#needs-you-trigger")).toHaveAttribute(
      "aria-label",
      new RegExp(`^Needs you ${snapshot.attentionItems.length}(?:\\D|$)`),
    );
    expect((await sampleFrames(page, badge, 500)).every((f) => identity(f.transform))).toBe(true);
  });
}
