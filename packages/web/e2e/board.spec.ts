// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import type { ProjectSnapshot } from "@stintwork/core";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import { dialogSnapshot, gate } from "./dialogs.fixture";
import { assertLayout } from "./layout-check";

for (const language of ["en", "zh-CN"] as const) {
  const t = language === "en" ? en : zhCN;
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
        const response = await page.request.get("/api/project");
        expect(response.ok()).toBe(true);
        const snapshot: ProjectSnapshot = await response.json();
        snapshot.milestones = [
          {
            id: "first",
            name: "Browser milestone 浏览器里程碑",
            status: "active",
            workItemSlugs: ["long-title"],
          },
          {
            id: "next",
            name: "Next milestone 下个里程碑",
            status: "planned",
            workItemSlugs: ["short-title", "chinese-title"],
          },
        ];
        for (const item of snapshot.workItems)
          item.milestone = item.slug === "long-title" ? "first" : "next";
        await page.route("**/api/project", (route) => route.fulfill({ json: snapshot }));
        await page.routeWebSocket("**/api/live", (socket) => socket.send(JSON.stringify(snapshot)));
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
          expect(actions.x).toBeGreaterThan(context.x + context.width);
        } else if (width < 1024) {
          expect(actions.y).toBeGreaterThanOrEqual(context.y + context.height);
        }
        const stages = page.locator(".stage-scroll");
        const card = page.locator(".stage-board");
        await expect(
          page
            .locator(".board-toolbar")
            .getByRole("combobox", { name: t.topBar.milestone, exact: true }),
        ).toBeVisible();
        await expect(
          page
            .locator(".board-toolbar")
            .getByRole("combobox", { name: t.pipelineBoard.workflow, exact: true }),
        ).toBeVisible();
        const dimensions = await card.evaluate((element) => {
          const viewport = element.querySelector<HTMLElement>(".stage-scroll");
          if (!viewport) throw new Error("Missing stage scroller");
          return {
            card: element.getBoundingClientRect().width,
            scroller: viewport.getBoundingClientRect().width,
            viewport: document.documentElement.clientWidth,
          };
        });
        expect(dimensions.card).toBeLessThanOrEqual(dimensions.viewport);
        expect(dimensions.scroller).toBeLessThanOrEqual(dimensions.card);
        const columns = stages.locator(".stage-column");
        await expect(columns.locator(".stage-header .count")).toHaveCount(6);
        const emptyLabels = columns.locator(":scope > div > .sr-only");
        expect(await emptyLabels.count()).toBeGreaterThan(0);
        expect(await stages.evaluate((element) => getComputedStyle(element).position)).toBe(
          "relative",
        );
        expect(
          await emptyLabels.evaluateAll((labels) =>
            labels.every(
              (label) => (label as HTMLElement).offsetParent === label.closest(".stage-column"),
            ),
          ),
        ).toBe(true);
        if (width === 390 || width === 768) {
          expect(await stages.evaluate((element) => getComputedStyle(element).scrollSnapType)).toBe(
            "x mandatory",
          );
          await page.locator(".stage-navigation button").last().click();
          await expect
            .poll(() => stages.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
          await page.locator(".stage-navigation button").first().click();
          await expect.poll(() => stages.evaluate((element) => element.scrollLeft)).toBe(0);
        }
        await assertLayout(page, { region: ".pipeline-main" });
        if (width === 1440)
          expect(await stages.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
            await stages.evaluate((element) => element.clientWidth),
          );
        if (width < 1024) {
          expect(
            await stages.evaluate((element) => element.scrollWidth > element.clientWidth),
          ).toBe(true);
        }
        await stages.evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        if (width < 1024)
          expect(await stages.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
        await assertLayout(page, { region: ".pipeline-main" });
        const inference = page.getByRole("button", { name: t.card.inferred, exact: true }).first();
        await inference.hover();
        const description = page.getByRole("tooltip");
        await expect(description).toContainText(t.card.inference);
        const tooltip = page
          .locator("[data-radix-popper-content-wrapper]")
          .filter({ has: description });
        await assertLayout(page, { region: ".pipeline-main" });
        await tooltip.screenshot({ path: testInfo.outputPath("inferred-tooltip.png") });
        await page.mouse.move(0, 0, { steps: 10 });
        await expect(description).toBeHidden();
        await stages.evaluate((element) => {
          element.scrollLeft = 0;
        });
        expect(externalRequests).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath("board.png"), fullPage: true });

        const firstMilestone = snapshot.milestones[0];
        if (!firstMilestone) throw new Error("The board fixture needs a milestone");
        const picker = page
          .locator(".board-toolbar")
          .getByRole("combobox", { name: t.topBar.milestone });
        await expect(picker).toContainText(t.board.allMilestones);
        const url = page.url();
        await picker.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("listbox")).toHaveAttribute("data-state", "open");
        await page.getByRole("option", { name: firstMilestone.name, exact: true }).click();
        await expect(picker).toBeFocused();
        await expect(picker.locator("[data-truncate]")).toHaveAttribute(
          "title",
          firstMilestone.name,
        );
        for (const item of snapshot.workItems.filter(
          (entry) => entry.milestone !== firstMilestone.id,
        ))
          await expect(page.locator(`.board-scroll [data-work-item="${item.slug}"]`)).toHaveCount(
            0,
          );
        expect(page.url()).toBe(url);
        await assertLayout(page, { region: ".pipeline-main" });
        await page.screenshot({
          path: testInfo.outputPath("board-milestone-filtered.png"),
          fullPage: true,
        });
        await picker.click();
        await expect(page.getByRole("listbox")).toHaveAttribute("data-state", "open");
        await page.getByRole("option", { name: t.board.allMilestones, exact: true }).click();
        await expect(picker).toBeFocused();
        await expect(picker).toContainText(t.board.allMilestones);
        await page.keyboard.press("Control+k");
        const palette = page.getByRole("dialog", { name: t.planning.palette.title });
        await expect(palette).toHaveAttribute("data-state", "open");
        await expect(palette.getByRole("combobox")).toBeFocused();
        await palette.getByRole("option", { name: firstMilestone.name, exact: true }).click();
        await expect(palette).not.toBeVisible();
        await expect(picker).toContainText(firstMilestone.name);
      });

      test(`board states ${width}px ${language} ${colorScheme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript(
          (choice) => localStorage.setItem("stintwork.language", choice),
          language,
        );
        const request = gate();
        const connected = gate();
        let snapshot: ProjectSnapshot = { ...dialogSnapshot, workItems: [], attentionItems: [] };
        let publish = () => {};
        await page.routeWebSocket("**/api/live", (socket) => {
          publish = () => socket.send(JSON.stringify(snapshot));
          connected.release();
        });
        await page.route("**/api/project", async (route) => {
          await request.ready;
          await route.fulfill({ status: 503 });
        });
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        await expect(page.getByRole("status")).toHaveText(t.connection.reading);
        await assertLayout(page);
        await page.screenshot({ path: testInfo.outputPath("board-loading.png"), fullPage: true });
        request.release();
        await expect(page.getByRole("status")).toHaveText(t.connection.unavailable);
        await expect(page.getByRole("alert")).toHaveText(t.connection.errors.requestFailed(503));
        await assertLayout(page);
        await page.screenshot({ path: testInfo.outputPath("board-error.png"), fullPage: true });
        await connected.ready;
        publish();
        await expect(page.getByRole("heading", { name: t.board.empty, exact: true })).toBeVisible();
        await expect(page.getByRole("alert")).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: t.planning.create.title, exact: true }),
        ).toBeInViewport();
        await assertLayout(page);
        await page.screenshot({ path: testInfo.outputPath("board-empty.png"), fullPage: true });
        snapshot = dialogSnapshot;
        publish();
        const milestone = page
          .locator(".board-toolbar")
          .getByRole("combobox", { name: t.topBar.milestone });
        await milestone.click();
        const options = page.getByRole("listbox");
        await expect(options).toHaveAttribute("data-state", "open");
        await assertLayout(page, { region: '[role="listbox"]' });
        await options.screenshot({ path: testInfo.outputPath("board-milestone-open.png") });
        await options.getByRole("option", { name: "Next milestone", exact: true }).click();
        await expect(milestone).toBeFocused();
        await expect(page.getByText(t.board.emptyMilestone, { exact: true })).toBeVisible();
        await expect(page.locator(".stage-column")).toHaveCount(6);
        await expect(page.locator("[data-work-item]")).toHaveCount(0);
        await assertLayout(page);
        await page.screenshot({
          path: testInfo.outputPath("board-empty-milestone.png"),
          fullPage: true,
        });
      });
    }
  }
}
