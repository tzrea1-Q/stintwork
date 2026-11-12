// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import type { ProjectSnapshot } from "@stintwork/core";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import { recoveryStint } from "../src/recovery-test-fixtures";
import { dialogReview, dialogSnapshot, gate } from "./dialogs.fixture";
import { assertLayout } from "./layout-check";
import { richClock, richSnapshot } from "./rich.fixture";

for (const language of ["en", "zh-CN"] as const) {
  const t = language === "en" ? en : zhCN;
  for (const width of [1440, 1024, 768, 390, 360]) {
    for (const colorScheme of width === 1440 || width === 390
      ? (["light", "dark"] as const)
      : (["light"] as const)) {
      test(`rich overview ${width}px ${language} ${colorScheme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.clock.setFixedTime(new Date(richClock));
        await page.addInitScript(
          (choice) => localStorage.setItem("stintwork.language", choice),
          language,
        );
        await page.route("**/api/project", (route) => route.fulfill({ json: richSnapshot }));
        await page.routeWebSocket("**/api/live", (socket) =>
          socket.send(JSON.stringify(richSnapshot)),
        );
        await page.goto("/?view=overview");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const next = page
          .locator('[data-slot="card"]')
          .filter({ hasText: t.overview.eyebrows.next });
        await expect(
          next.getByRole("heading", { name: richSnapshot.workItems[3].title }),
        ).toBeVisible();
        await expect(page.getByText(/30 (min elapsed|分钟)/)).toBeVisible();
        await assertLayout(page);
        await page.screenshot({ path: info.outputPath("rich-overview.png"), fullPage: true });
      });
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
          { id: "shipped", name: "Shipped milestone", status: "shipped", workItemSlugs: [] },
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
        await expect(
          overview.getByRole("heading", { name: t.overview.milestones, exact: true }),
        ).toBeVisible();
        await expect(
          overview.getByRole("heading", { name: t.overview.stages, exact: true }),
        ).toBeVisible();
        await expect(
          overview.getByRole("heading", { name: item.title, exact: true }),
        ).toBeVisible();
        const disclosure = overview.locator("summary");
        await disclosure.focus();
        await page.keyboard.press("Enter");
        await expect(overview.getByRole("button", { name: "Shipped milestone" })).toBeVisible();
        await assertLayout(page);
        await page.screenshot({ path: info.outputPath("overview.png"), fullPage: true });
        await overview
          .locator('[data-slot="card"]')
          .filter({ hasText: t.overview.next })
          .getByRole("button", { name: t.overview.open })
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
      test(`Overview states ${width}px ${language} ${colorScheme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript(
          (choice) => localStorage.setItem("stintwork.language", choice),
          language,
        );
        const request = gate();
        const connected = gate();
        const snapshot = structuredClone(dialogSnapshot);
        const base = snapshot.workItems[0];
        const columns = ["clarify", "spec", "tickets", "implement", "review", "ship"] as const;
        snapshot.workItems = columns.map((column, index) => ({
          ...structuredClone(base),
          slug: `overview-${column}`,
          title: `Long work item ${column} 工作项标题 ${"内容很长 ".repeat(12)}`,
          column,
          stage: snapshot.workflows[base.workflow].stages.find((stage) => stage.column === column)
            ?.id,
          milestone: index < 3 ? "active" : "planned",
          activeStint: null,
          stints: [],
          tickets: [],
        }));
        const running = snapshot.workItems[1];
        running.activeStint = { ...recoveryStint(), workItem: running.slug, stage: "spec" };
        running.stints = [{ ...dialogReview, workItem: running.slug }];
        const stale = snapshot.workItems[3];
        const github: NonNullable<ProjectSnapshot["workItems"][number]["github"]> = {
          repository: "example/repo",
          repositoryId: "repo",
          issueId: "issue",
          number: 1,
          url: "https://example.com/issue/1",
          complete: true,
          ticketsStale: true,
        };
        stale.github = github;
        const milestoneName = `Active milestone 里程碑 ${"long name ".repeat(12)}`;
        snapshot.milestones = [
          {
            id: "active",
            name: milestoneName,
            status: "active",
            workItemSlugs: snapshot.workItems.slice(0, 3).map((item) => item.slug),
          },
          {
            id: "planned",
            name: `Planned 计划 ${"里程碑".repeat(20)}`,
            status: "planned",
            workItemSlugs: snapshot.workItems.slice(3).map((item) => item.slug),
          },
          ...[1, 2, 3].map((index) => ({
            id: `shipped-${index}`,
            name: `Shipped milestone ${index} ${"已交付".repeat(15)}`,
            status: "shipped" as const,
            workItemSlugs: [],
          })),
        ];
        snapshot.attentionItems = [
          {
            kind: "login-required",
            id: "login",
            title: "Sign in",
            agent: "codex",
            workItem: null,
            ticket: null,
            stintId: null,
            details: "",
            raisedAt: "2026-10-13T10:00:00Z",
            loginCommand: "codex login",
          },
        ];
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
        await page.screenshot({ path: info.outputPath("overview-loading.png"), fullPage: true });
        request.release();
        await expect(page.getByRole("alert")).toHaveText(t.connection.errors.requestFailed(503));
        await assertLayout(page);
        await page.screenshot({ path: info.outputPath("overview-error.png"), fullPage: true });
        await connected.ready;
        publish();
        const overview = page.getByRole("main").filter({
          has: page.getByRole("heading", { name: t.viewNavigation.overview, level: 1 }),
        });
        for (const title of [
          snapshot.workItems[0].title,
          `${t.overview.attention} 1`,
          t.overview.running,
          t.overview.milestones,
          t.overview.stages,
          t.overview.activity,
        ]) {
          await expect(
            overview.locator('[data-slot="card-title"]').filter({ hasText: title }),
          ).toBeVisible();
        }
        await expect(overview.getByText(t.overview.progressIncomplete)).toBeVisible();
        await overview.locator("summary").click();
        await expect(
          overview.getByRole("button", { name: snapshot.milestones[4].name }),
        ).toBeVisible();
        await assertLayout(page);
        await page.screenshot({ path: info.outputPath("overview-full.png"), fullPage: true });
        const attention = overview
          .locator('[data-slot="card"]')
          .filter({ hasText: t.overview.attention });
        await attention.locator('[data-slot="card-content"] button').first().click();
        const queue = page.locator(".needs-you-queue");
        await expect(queue).toBeVisible();
        await assertLayout(page);
        await queue.getByRole("button", { name: t.needsYou.close }).click();
        snapshot.workItems[0].github = {
          ...github,
          ticketsStale: false,
          ticketsKnown: false,
        };
        publish();
        await expect(
          overview.getByText(`${t.overview.tickets}: ${t.overview.unavailable}`),
        ).toBeVisible();
        await assertLayout(page);
        await page.screenshot({
          path: info.outputPath("overview-unavailable.png"),
          fullPage: true,
        });
        await overview.getByRole("button", { name: milestoneName }).click();
        await expect(page).toHaveURL(/view=pipeline/);
        await expect(
          page
            .locator(".board-toolbar")
            .getByRole("combobox", { name: t.topBar.milestone, exact: true }),
        ).toContainText(milestoneName);
        await expect(page.locator(`[data-work-item="${stale.slug}"]`)).toHaveCount(0);
      });
    }
  }
}
