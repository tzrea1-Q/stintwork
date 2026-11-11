// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import type { ProjectSnapshot } from "@stintwork/core";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import { assertLayout } from "./layout-check";

for (const language of ["en", "zh-CN"] as const) {
  const t = language === "en" ? en : zhCN;
  for (const width of [1440, 1024, 768, 390, 360]) {
    for (const colorScheme of width === 1440 || width === 390
      ? (["light", "dark"] as const)
      : (["light"] as const)) {
      test(`Overview ${width}px ${language} ${colorScheme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript(
          (choice) => localStorage.setItem("stintwork.language", choice),
          language,
        );
        const response = await page.request.get("/api/project");
        const snapshot: ProjectSnapshot = await response.json();
        const item = snapshot.workItems[0];
        snapshot.milestones = [
          {
            id: "overview",
            name: "Overview milestone",
            status: "active",
            workItemSlugs: [item.slug],
          },
        ];
        item.milestone = "overview";
        delete item.merged;
        item.activeStint = null;
        item.stints = [];
        item.tickets = [];
        snapshot.attentionItems = [];
        let current = snapshot;
        await page.route("**/api/project", (route) => route.fulfill({ json: current }));
        await page.routeWebSocket("**/api/live", (socket) => socket.send(JSON.stringify(current)));
        await page.goto("/");
        const overview = page.getByRole("main").filter({
          has: page.getByRole("heading", { name: t.viewNavigation.overview, level: 1 }),
        });
        await expect(
          overview.getByRole("heading", { name: t.viewNavigation.overview, level: 1 }),
        ).toBeVisible();
        await expect(overview.getByText(t.overview.milestones)).toBeVisible();
        await expect(overview.getByText(t.overview.stages)).toBeVisible();
        await expect(overview.getByText(t.overview.next)).toBeVisible();
        await assertLayout(page);
        await page.screenshot({ path: info.outputPath("overview.png"), fullPage: true });
        await overview
          .locator('[data-slot="card"]')
          .filter({ hasText: t.overview.next })
          .getByRole("button")
          .click();
        await expect(page).toHaveURL(/view=pipeline/);
        if (width >= 1024) {
          await expect(page.getByRole("complementary", { name: item.title })).toBeVisible();
        } else {
          await expect(page.getByRole("dialog", { name: item.title })).toBeVisible();
        }
        current = { ...snapshot, workItems: [], milestones: [], attentionItems: [] };
        await page.goto("/");
        await expect(overview.getByText(t.board.empty)).toBeVisible();
        await assertLayout(page);
        await page.screenshot({ path: info.outputPath("overview-empty.png"), fullPage: true });
      });
    }
  }
}
