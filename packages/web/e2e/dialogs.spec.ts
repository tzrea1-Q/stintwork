// SPDX-License-Identifier: Apache-2.0
import { expect, type Locator, type Page, type TestInfo, test } from "@playwright/test";
import { builtInWorkflowYaml } from "@stintwork/core";
import { codexProfile } from "../../agents/src/profiles";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import {
  dialogBrief,
  dialogDiff,
  dialogFinding,
  dialogItem,
  dialogReview,
  dialogSnapshot,
  gate,
} from "./dialogs.fixture";
import { assertLayout } from "./layout-check";

async function capture(page: Page, dialog: Locator, testInfo: TestInfo, state: string) {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-state", "open");
  if (await dialog.getAttribute("class").then((value) => value?.includes("command-palette"))) {
    for (const region of [".command-search", "[cmdk-list]", ".command-footer"])
      await assertLayout(page, { region });
  } else {
    const id = await dialog.getAttribute("id");
    await assertLayout(page, { region: `[id="${id}"]` });
  }
  await dialog.screenshot({ path: testInfo.outputPath(`${state}.png`) });
}

async function reachable(page: Page, action: Locator) {
  await action.scrollIntoViewIfNeeded();
  const bounds = await action.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error("Essential action has no viewport bounds");
  expect(bounds.x).toBeGreaterThanOrEqual(16);
  expect(bounds.y).toBeGreaterThanOrEqual(16);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 16);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 16);
}

for (const language of ["en", "zh-CN"] as const) {
  const t = language === "en" ? en : zhCN;
  for (const width of [1440, 1024, 768, 390, 360]) {
    for (const colorScheme of width === 1440 || width === 390
      ? (["light", "dark"] as const)
      : (["light"] as const)) {
      test.describe(`${width}px ${language} ${colorScheme}`, () => {
        let snapshot = dialogSnapshot;
        test.beforeEach(async ({ page }) => {
          snapshot = dialogSnapshot;
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ colorScheme });
          await page.addInitScript(
            (choice) => localStorage.setItem("stintwork.language", choice),
            language,
          );
          await page.route("**/api/project", (route) => route.fulfill({ json: snapshot }));
          await page.routeWebSocket("**/api/live", (socket) =>
            socket.send(JSON.stringify(snapshot)),
          );
          await page.route("**/api/agents", (route) => route.fulfill({ json: { agents: [] } }));
          await page.route("**/api/work-items/*/checks", (route) =>
            route.fulfill({
              json: {
                commands: [],
                checks: [],
                checkExecution: null,
                headCommit: dialogDiff.headCommit,
              },
            }),
          );
        });

        test("GitHub tracker directs creation to agent skills and repository issues", async ({
          page,
        }, testInfo) => {
          snapshot = {
            ...dialogSnapshot,
            setup: { ...dialogSnapshot.setup, tracker: "github-issues" },
            github: {
              repository: "example/project",
              repositoryId: "repo-id",
              items: [],
              scanned: 0,
              cursor: null,
              complete: true,
              pages: [],
              warnings: [],
            },
          };
          await page.goto("/?view=pipeline");
          await expect(page.getByText(t.board.githubCreation)).toBeVisible();
          await expect(page.getByRole("link", { name: t.board.githubIssues })).toHaveAttribute(
            "href",
            "https://github.com/example/project/issues",
          );
          await expect(page.getByRole("button", { name: t.board.createWorkItem })).toHaveCount(0);
          await page.keyboard.press("c");
          await expect(page.getByRole("dialog", { name: t.planning.create.title })).toHaveCount(0);
          await assertLayout(page);
          await page.screenshot({
            path: testInfo.outputPath("github-creation.png"),
            fullPage: true,
          });
          await page.getByRole("button", { name: t.topBar.openPalette }).click();
          await expect(page.getByText(t.planning.palette.create, { exact: true })).toHaveCount(0);
        });

        test("GitHub partial board offers load more", async ({ page }, testInfo) => {
          snapshot = {
            ...dialogSnapshot,
            setup: { ...dialogSnapshot.setup, tracker: "github-issues" },
            github: {
              repository: "example/project",
              repositoryId: "repo-id",
              items: [],
              scanned: 500,
              cursor: "next",
              complete: false,
              pages: [],
              warnings: [],
              fetchedAt: "2026-10-28T12:00:00Z",
            },
          };
          let requested = false;
          await page.route("**/api/github/discovery/load-more", (route) => {
            requested = true;
            return route.fulfill({ json: snapshot });
          });
          await page.goto("/?view=pipeline");
          await expect(page.getByText(t.board.githubStatus.errors.incomplete)).toBeVisible();
          await page.getByRole("button", { name: t.board.githubStatus.loadMore }).click();
          expect(requested).toBe(true);
          await assertLayout(page);
          await page.screenshot({
            path: testInfo.outputPath("github-partial.png"),
            fullPage: true,
          });
        });

        test("create: empty, checking, long content, pending save and refusal", async ({
          page,
        }, testInfo) => {
          const preview = gate();
          const save = gate();
          let previewAttempts = 0;
          await page.route("**/api/work-items/preview", async (route) => {
            await preview.ready;
            previewAttempts++;
            await route.fulfill(
              previewAttempts === 1
                ? { status: 409, json: { reason: en.planning.create.errors.preview } }
                : { json: { slug: "dialog-example" } },
            );
          });
          await page.route("**/api/work-items", async (route) => {
            await save.ready;
            await route.fulfill({
              status: 409,
              json: { reason: "Fixture save refusal. No files changed." },
            });
          });
          await page.goto("/?view=pipeline");
          await page.getByRole("button", { name: t.planning.create.title, exact: true }).click();
          const dialog = page.getByRole("dialog", { name: t.planning.create.title });
          const confirm = dialog.getByRole("button", {
            name: t.planning.create.title,
            exact: true,
          });
          await expect(confirm).toBeDisabled();
          await expect(dialog.getByRole("status")).toHaveText(t.planning.create.enterTitle);
          await capture(page, dialog, testInfo, "create-empty");
          for (const [label, selection] of [
            [t.planning.create.workflow, t.workflows.feature.name],
            [t.planning.create.milestone, snapshot.milestones[0].name],
          ]) {
            const picker = dialog.getByRole("combobox", { name: label, exact: true });
            const triggerWidth = await picker.evaluate(
              (element) => element.getBoundingClientRect().width,
            );
            await picker.click();
            const list = page.getByRole("listbox");
            await expect(list).toHaveAttribute("data-state", "open");
            await expect
              .poll(async () =>
                Math.abs(
                  (await list.evaluate((element) => element.getBoundingClientRect().width)) -
                    Math.min(Math.max(280, triggerWidth), width - 34),
                ),
              )
              .toBeLessThanOrEqual(1);
            await capture(
              page,
              list,
              testInfo,
              label === t.planning.create.workflow
                ? "create-workflow-open"
                : "create-milestone-open",
            );
            await page.getByRole("option", { name: selection, exact: true }).click();
            await expect(picker).toBeFocused();
          }
          await dialog
            .getByRole("textbox", { name: t.planning.create.titleLabel })
            .fill(dialogItem.title);
          await expect(dialog.getByRole("status")).toHaveText(t.planning.create.checking);
          await capture(page, dialog, testInfo, "create-checking");
          preview.release();
          await expect(dialog.getByRole("alert")).toHaveText(t.planning.create.errors.preview);
          await expect(confirm).toBeDisabled();
          await capture(page, dialog, testInfo, "create-preview-error");
          await dialog
            .getByRole("textbox", { name: t.planning.create.titleLabel })
            .fill(`${dialogItem.title} retry`);
          await expect(confirm).toBeEnabled();
          await dialog
            .getByRole("textbox", { name: t.planning.create.intent })
            .fill("Developer intent 原文。 ".repeat(100));
          await expect(confirm).toBeEnabled();
          await capture(page, dialog, testInfo, "create-long");
          await reachable(page, confirm);
          await confirm.click();
          await expect(
            dialog.getByRole("button", { name: t.planning.create.saving }),
          ).toBeDisabled();
          await dialog.focus();
          await expect(dialog).toBeFocused();
          await page.keyboard.press("Escape");
          await page
            .locator('.bg-backdrop[data-state="open"]')
            .last()
            .click({ position: { x: 4, y: 4 } });
          await capture(page, dialog, testInfo, "create-saving");
          save.release();
          await expect(dialog.getByRole("alert")).toHaveText(
            "Fixture save refusal. No files changed.",
          );
          await capture(page, dialog, testInfo, "create-error");
          await dialog.getByRole("button", { name: t.planning.create.cancel }).click();
          await expect(dialog).toBeHidden();
          await expect(
            page.getByRole("button", { name: t.planning.create.title, exact: true }),
          ).toBeFocused();
        });

        test("roadmap: long, pending write, refusal, recovery and empty", async ({
          page,
        }, testInfo) => {
          const save = gate();
          let refuse = true;
          await page.route("**/api/roadmap", async (route) => {
            await save.ready;
            await route.fulfill(
              refuse
                ? { status: 409, json: { reason: "Fixture roadmap refusal." } }
                : { json: { milestones: snapshot.milestones, commit: "d".repeat(40) } },
            );
          });
          await page.goto("/?view=pipeline");
          const trigger = page.getByRole("button", { name: t.planning.roadmap.title });
          await trigger.click();
          const dialog = page.getByRole("dialog", { name: t.planning.roadmap.title });
          await capture(page, dialog, testInfo, "roadmap-long");
          for (const label of [
            t.planning.roadmap.status(snapshot.milestones[0].name),
            t.planning.roadmap.workItem,
            t.planning.roadmap.destination,
          ]) {
            const picker = dialog.getByRole("combobox", { name: label, exact: true });
            await picker.scrollIntoViewIfNeeded();
            await picker.click();
            await capture(
              page,
              page.getByRole("listbox"),
              testInfo,
              `roadmap-select-${label === t.planning.roadmap.workItem ? "work-item" : label === t.planning.roadmap.destination ? "destination" : "status"}`,
            );
            await page.keyboard.press("Escape");
            await expect(picker).toBeFocused();
            await expect(dialog).toBeVisible();
          }
          await dialog
            .getByRole("textbox", { name: t.planning.roadmap.newName })
            .fill("New milestone 原文");
          const add = dialog.getByRole("button", { name: t.planning.roadmap.add });
          await reachable(page, add);
          await add.click();
          await expect(
            dialog.getByRole("button", { name: t.planning.roadmap.close }),
          ).toBeDisabled();
          await dialog.focus();
          await expect(dialog).toBeFocused();
          await page.keyboard.press("Escape");
          await page
            .locator('.bg-backdrop[data-state="open"]')
            .last()
            .click({ position: { x: 4, y: 4 } });
          await capture(page, dialog, testInfo, "roadmap-saving");
          save.release();
          await expect(dialog.getByRole("alert")).toHaveText("Fixture roadmap refusal.");
          await capture(page, dialog, testInfo, "roadmap-error");
          refuse = false;
          await add.click();
          await expect(dialog.getByRole("status")).toHaveText(t.planning.roadmap.committed);
          await page.keyboard.press("Escape");
          await expect(trigger).toBeFocused();
          snapshot = { ...dialogSnapshot, milestones: [], workItems: [], attentionItems: [] };
          await page.reload();
          await trigger.click();
          await expect(
            dialog.getByRole("button", { name: t.planning.roadmap.move }),
          ).toBeDisabled();
          await capture(page, dialog, testInfo, "roadmap-empty");
          await page
            .locator('.bg-backdrop[data-state="open"]')
            .last()
            .click({ position: { x: 4, y: 4 } });
          await expect(trigger).toBeFocused();
        });

        test("customise: loading, long YAML, pending save and refusals", async ({
          page,
        }, testInfo) => {
          const preview = gate();
          const save = gate();
          let previewError = false;
          await page.route("**/api/workflows/feature/customise/preview", async (route) => {
            await preview.ready;
            await route.fulfill(
              previewError
                ? { status: 409, json: { reason: "Fixture preview refusal." } }
                : {
                    json: {
                      path: ".stintwork/workflows/feature.yaml",
                      yaml: `${builtInWorkflowYaml.feature}\n# ${"Long configuration 原文 ".repeat(120)}\n${"# configuration\n".repeat(100)}`,
                    },
                  },
            );
          });
          await page.route("**/api/workflows/feature/customise", async (route) => {
            await save.ready;
            await route.fulfill({
              status: 409,
              json: { reason: "Fixture customisation refusal." },
            });
          });
          await page.goto("/?view=pipeline");
          const open = async () => {
            await page.locator("#command-palette-trigger").focus();
            await expect(page.locator("#command-palette-trigger")).toBeFocused();
            await page.keyboard.press("Control+k");
            const palette = page.getByRole("dialog", { name: t.planning.palette.title });
            await expect(
              palette.getByRole("combobox", { name: t.planning.palette.search }),
            ).toBeFocused();
            await capture(
              page,
              palette,
              testInfo,
              previewError ? "customise-palette-retry" : "customise-palette-open",
            );
            await page
              .getByRole("option", {
                name: t.planning.palette.customise(t.workflows.feature.name),
                exact: true,
              })
              .click();
          };
          await open();
          const dialog = page.getByRole("dialog", {
            name: t.planning.customise.title(t.workflows.feature.name),
          });
          await expect(dialog.getByRole("status")).toHaveText(t.planning.customise.loading);
          await capture(page, dialog, testInfo, "customise-loading");
          preview.release();
          const confirm = dialog.getByRole("button", { name: t.planning.customise.confirm });
          await expect(confirm).toBeEnabled();
          const yaml = dialog.locator("pre");
          expect(await yaml.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
            true,
          );
          await yaml.focus();
          await expect(yaml).toBeFocused();
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => yaml.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
          await capture(page, dialog, testInfo, "customise-long");
          await reachable(page, confirm);
          await confirm.click();
          await expect(
            dialog.getByRole("button", { name: t.planning.customise.saving }),
          ).toBeDisabled();
          await dialog.focus();
          await expect(dialog).toBeFocused();
          await page.keyboard.press("Escape");
          await page
            .locator('.bg-backdrop[data-state="open"]')
            .last()
            .click({ position: { x: 4, y: 4 } });
          await capture(page, dialog, testInfo, "customise-saving");
          save.release();
          await expect(dialog.getByRole("alert")).toHaveText("Fixture customisation refusal.");
          await capture(page, dialog, testInfo, "customise-save-error");
          await page.keyboard.press("Escape");
          previewError = true;
          await open();
          await expect(dialog.getByRole("alert")).toHaveText("Fixture preview refusal.");
          await expect(confirm).toBeDisabled();
          await capture(page, dialog, testInfo, "customise-preview-error");
          await page
            .locator('.bg-backdrop[data-state="open"]')
            .last()
            .click({ position: { x: 4, y: 4 } });
          await expect(dialog).toBeHidden();
        });

        test("brief: loading, no agents, long prompt, error and nested dismissal", async ({
          page,
        }, testInfo) => {
          const preview = gate();
          const starting = gate();
          let startAttempts = 0;
          let noAgents = true;
          let refuse = false;
          await page.route("**/api/stints", async (route) => {
            expect(route.request().postDataJSON()).toMatchObject({
              workItem: dialogItem.slug,
              agent: "codex",
              ticket: null,
            });
            startAttempts++;
            if (startAttempts === 1) {
              await starting.ready;
              await route.fulfill({ status: 409, json: { reason: "Fixture start refusal." } });
            } else await route.fulfill({ json: { id: "fixture-started" } });
          });
          await page.route("**/api/agents", (route) =>
            route.fulfill({ json: { agents: noAgents ? [] : [codexProfile] } }),
          );
          await page.route("**/api/work-items/dialog-item/brief-preview", async (route) => {
            await preview.ready;
            await route.fulfill(
              refuse
                ? { status: 409, json: { reason: "Fixture brief refusal." } }
                : { json: dialogBrief },
            );
          });
          await page.goto("/?item=dialog-item");
          const parent = page.getByRole("dialog", { name: dialogItem.title, exact: true });
          const trigger = parent.getByRole("button", { name: t.stints.startStint, exact: true });
          await trigger.click();
          const dialog = page.getByRole("dialog", { name: t.stints.briefPreview });
          await expect(dialog.getByRole("status")).toContainText(t.stints.readingBrief);
          await capture(page, dialog, testInfo, "brief-loading");
          preview.release();
          await expect(dialog.getByText(t.stints.noAgents)).toBeVisible();
          await expect(
            dialog.getByRole("button", { name: t.stints.start, exact: true }),
          ).toBeDisabled();
          await capture(page, dialog, testInfo, "brief-empty-agents");
          await page.keyboard.press("Escape");
          await expect(trigger).toBeFocused();
          noAgents = false;
          await trigger.click();
          const start = dialog.getByRole("button", {
            name: new RegExp(`^(${t.stints.start}|${t.stints.preparation.retry})$`),
          });
          await expect(start).toBeEnabled();
          for (const label of [t.stints.agent, t.stints.permissionLevel]) {
            const picker = dialog.getByRole("combobox", { name: label, exact: true });
            await picker.scrollIntoViewIfNeeded();
            await picker.click();
            await capture(
              page,
              page.getByRole("listbox"),
              testInfo,
              label === t.stints.agent ? "brief-agent-open" : "brief-permission-level-open",
            );
            await page.keyboard.press("Escape");
            await expect(picker).toBeFocused();
            await expect(dialog).toBeVisible();
          }
          await reachable(page, start);
          const content = dialog.locator(".brief-preview-content");
          expect(
            await content.evaluate((element) => element.scrollHeight > element.clientHeight),
          ).toBe(true);
          await dialog.getByRole("heading", { name: t.stints.fullPrompt }).scrollIntoViewIfNeeded();
          const prompt = dialog.locator(".brief-prompt").last();
          await expect(prompt).toHaveCSS("overflow", "auto");
          await prompt.focus();
          await page.keyboard.press("ArrowDown");
          await expect
            .poll(() => prompt.evaluate((element) => element.scrollTop))
            .toBeGreaterThan(0);
          await expect(dialog.getByRole("region", { name: t.stints.changedPaths })).toHaveCSS(
            "overflow",
            "auto",
          );
          await capture(page, dialog, testInfo, "brief-long");
          await content.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
          await capture(page, dialog, testInfo, "brief-long-bottom");
          await reachable(page, start);
          await start.click();
          await expect(
            dialog.getByRole("button", { name: t.stints.starting, exact: true }),
          ).toBeDisabled();
          await capture(page, dialog, testInfo, "brief-starting");
          starting.release();
          const startError = dialog
            .getByRole("alert")
            .filter({ hasText: "Fixture start refusal." });
          await expect(startError).toHaveCount(1);
          await expect(startError).toHaveText("Fixture start refusal.");
          await expect(dialog.getByRole("alert").filter({ hasText: "Codex" })).toHaveCount(1);
          await expect(start).toBeEnabled();
          await capture(page, dialog, testInfo, "brief-start-error");
          await start.click();
          await expect(dialog).toBeHidden();
          await expect(trigger).toBeFocused();
          expect(startAttempts).toBe(2);
          await trigger.click();
          await expect(start).toBeEnabled();
          await expect(dialog.getByRole("button", { name: t.stints.closeBrief })).toBeFocused();
          await page
            .locator('.bg-backdrop[data-state="open"]')
            .last()
            .click({ position: { x: 4, y: 4 } });
          await expect(trigger).toBeFocused();
          await expect(parent).toBeVisible();
          refuse = true;
          await trigger.click();
          await expect(dialog.getByRole("alert")).toHaveText("Fixture brief refusal.");
          await expect(start).toBeDisabled();
          await capture(page, dialog, testInfo, "brief-error");
        });

        test("review: loading, empty, long diff scrolling, refusal and retry", async ({
          page,
        }, testInfo) => {
          const load = gate();
          let state: "empty" | "long" | "error" = "empty";
          await page.route("**/api/work-items/dialog-item/checks", (route) =>
            route.fulfill({
              json: {
                commands: [{ name: "Fixture check", command: "node fixture-check.js" }],
                checks: [
                  {
                    name: "Fixture check",
                    command: "node fixture-check.js",
                    status: "failed",
                    commit: dialogDiff.headCommit,
                    durationMs: 12,
                    outputExcerpt: `Error: ${"Long check output 原文 ".repeat(100)}`,
                  },
                ],
                checkExecution: null,
                headCommit: dialogDiff.headCommit,
              },
            }),
          );
          await page.route("**/api/work-items/dialog-item/diff", async (route) => {
            await load.ready;
            await route.fulfill(
              state === "error"
                ? { status: 409, json: { reason: "Fixture diff refusal." } }
                : { json: state === "empty" ? { ...dialogDiff, files: [] } : dialogDiff },
            );
          });
          await page.goto("/?item=dialog-item");
          const parent = page.getByRole("dialog", { name: dialogItem.title, exact: true });
          const trigger = parent.getByRole("button", { name: t.stints.openReview });
          await trigger.click();
          const dialog = page.locator(".review-overlay");
          await expect(dialog.getByRole("status")).toHaveText(t.review.diff.reading);
          await capture(page, dialog, testInfo, "review-loading");
          load.release();
          await expect(dialog.getByRole("status")).toHaveText(t.review.diff.empty);
          await capture(page, dialog, testInfo, "review-empty");
          state = "long";
          const refresh = dialog.getByRole("button", { name: t.review.diff.refresh });
          await refresh.click();
          const hunk = dialog.locator(".review-hunk");
          await expect(hunk).toBeVisible();
          if (width < 768) {
            const panes = dialog.getByRole("group", { name: t.review.diff.panes });
            const diffButton = panes.getByRole("button", { name: t.review.diff.diff, exact: true });
            await expect(diffButton).toHaveAttribute("aria-pressed", "true");
            const diffRegion = dialog.getByRole("region", {
              name: t.review.diff.workItemDiff,
              exact: true,
            });
            await expect(dialog.locator(".review-files")).toBeHidden();
            await expect(dialog.locator(".review-evidence")).toBeHidden();
            expect((await diffRegion.boundingBox())?.height).toBeGreaterThanOrEqual(900 * 0.6);
            const details = dialog.getByRole("button", {
              name: t.review.diff.details,
              exact: true,
            });
            await details.click();
            await expect(details).toHaveAttribute("aria-expanded", "true");
            await capture(page, dialog, testInfo, "review-details");
            await details.click();
            await expect(details).toHaveAttribute("aria-expanded", "false");
            await panes.getByRole("button", { name: t.review.diff.files, exact: true }).click();
            const files = dialog.getByRole("navigation", {
              name: t.review.diff.changedFiles,
              exact: true,
            });
            await expect(files).toBeVisible();
            await expect(diffRegion).toBeHidden();
            await capture(page, dialog, testInfo, "review-files-pane");
            await files.getByRole("link").first().click();
            await expect(diffButton).toHaveAttribute("aria-pressed", "true");
            await expect(diffRegion).toBeVisible();
            await expect(files).toBeHidden();
            await expect(dialog.locator("[data-diff-path]").first()).toBeFocused();
          }
          await hunk.scrollIntoViewIfNeeded();
          const header = hunk.locator("h4 code");
          await expect(header).toHaveText(dialogDiff.files[0].hunks[0].header);
          const initialHeaderLeft = (await header.boundingBox())?.x;
          expect(initialHeaderLeft).toBeDefined();
          expect(await hunk.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
            true,
          );
          await hunk.focus();
          await expect(hunk).toBeFocused();
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => hunk.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
          expect(
            await hunk.evaluate((element, initialLeft) => {
              const heading = element.querySelector("h4 code");
              const line = element.querySelector(".review-line-text code");
              const text = heading?.firstChild;
              if (!text || !heading || !line || initialLeft === undefined) return null;
              const headerLeft = heading.getBoundingClientRect().left;
              const prefix = document.createRange();
              prefix.setStart(text, 0);
              prefix.setEnd(text, 2);
              const visible = element.getBoundingClientRect();
              const bounds = prefix.getBoundingClientRect();
              return {
                aligned: Math.abs(headerLeft - line.getBoundingClientRect().left) < 1,
                scrollsWithCode: Math.abs(initialLeft - headerLeft - element.scrollLeft) < 1,
                prefixVisible: bounds.left >= visible.left && bounds.right <= visible.right,
              };
            }, initialHeaderLeft),
          ).toEqual({ aligned: true, scrollsWithCode: true, prefixVisible: true });
          await capture(page, dialog, testInfo, "review-long-diff");
          if (width < 768) {
            await dialog.getByRole("button", { name: t.review.diff.findings, exact: true }).click();
            await expect(dialog.locator(".review-evidence")).toBeVisible();
            await expect(dialog.locator(".review-diff")).toBeHidden();
            await capture(page, dialog, testInfo, "review-findings-pane");
          }
          const checks = dialog.getByRole("region", { name: t.review.diff.checks, exact: true });
          await expect(
            checks.getByRole("progressbar", {
              name: `0 ${t.review.visualRefresh07.of} 1 ${t.review.visualRefresh07.passing}`,
            }),
          ).toHaveAttribute("aria-valuenow", "0");
          await expect(
            checks.getByRole("img", { name: t.review.checks.statuses.failed }),
          ).toBeVisible();
          const output = checks.locator("pre");
          await output.scrollIntoViewIfNeeded();
          await expect(output).toHaveCSS("white-space", "pre");
          expect(
            await output.evaluate((element) => element.scrollWidth > element.clientWidth),
          ).toBe(true);
          await output.focus();
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => output.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
          await capture(page, dialog, testInfo, "review-check-output");
          for (const [label, kind] of [
            [t.review.findings.axis, "axis"],
            [t.review.findings.severity, "severity"],
            [t.review.findings.status, "status"],
          ]) {
            const filter = dialog.getByRole("combobox", { name: label, exact: true });
            await filter.click();
            await capture(page, page.getByRole("listbox"), testInfo, `review-filter-${kind}`);
            await page.keyboard.press("Escape");
            await expect(filter).toBeFocused();
            await expect(dialog).toBeVisible();
          }
          await reachable(page, refresh);
          state = "error";
          await refresh.click();
          await expect(dialog.getByRole("alert")).toHaveText("Fixture diff refusal.");
          await capture(page, dialog, testInfo, "review-error");
          state = "empty";
          await refresh.click();
          await expect(dialog.getByRole("status")).toHaveText(t.review.diff.empty);
          await page.keyboard.press("Escape");
          await expect(trigger).toBeFocused();
          await expect(parent).toBeVisible();
          await trigger.click();
          await expect(dialog.getByRole("status")).toHaveText(t.review.diff.empty);
          await expect(dialog.getByRole("button", { name: t.review.diff.close })).toBeFocused();
          await page
            .locator('.bg-backdrop[data-state="open"]')
            .last()
            .click({ position: { x: 4, y: 4 } });
          await expect(trigger).toBeFocused();
          await expect(parent).toBeVisible();
        });

        test("review findings: long inline/outside findings, pending decision, refusal and malformed reply", async ({
          page,
        }, testInfo) => {
          snapshot = {
            ...dialogSnapshot,
            workItems: [
              {
                ...dialogItem,
                stage: "review",
                column: "review",
                headCommit: dialogDiff.headCommit,
                stints: [dialogReview],
              },
            ],
          };
          const decision = gate();
          let attempts = 0;
          await page.route("**/api/work-items/dialog-item/diff", (route) =>
            route.fulfill({ json: dialogDiff }),
          );
          await page.route("**/api/work-items/dialog-item/findings/decision", async (route) => {
            const body = route.request().postDataJSON();
            expect(body).toMatchObject({ id: dialogFinding.id, status: "resolved", reason: "" });
            attempts++;
            if (attempts === 1) {
              await decision.ready;
              await route.fulfill({
                status: 409,
                json: {
                  reason: `Fixture decision refusal. ${"Long recovery detail 原文。 ".repeat(15)}`,
                },
              });
            } else
              await route.fulfill({
                json: {
                  decision: { ...body, kind: "finding", by: "You", at: "2026-10-13T10:10:00Z" },
                },
              });
          });
          await page.goto("/?item=dialog-item");
          const parent = page.getByRole("dialog", { name: dialogItem.title, exact: true });
          await expect(parent).toHaveAttribute("data-state", "open");
          const trigger = parent.getByRole("button", { name: t.stints.openReview, exact: true });
          await trigger.click();
          const dialog = page.locator(".review-overlay");
          await expect(dialog.getByRole("button", { name: t.review.diff.close })).toBeFocused();
          if (width < 768) {
            const findingsButton = dialog.getByRole("button", {
              name: t.review.diff.findings,
              exact: true,
            });
            await findingsButton.click();
            await expect(findingsButton).toHaveAttribute("aria-pressed", "true");
            await expect(dialog.locator(".review-evidence")).toBeVisible();
            await capture(page, dialog, testInfo, "review-findings-navigation");
            await dialog
              .locator(".review-evidence")
              .getByRole("link", { name: dialogFinding.title, exact: true })
              .click();
            await expect(
              dialog.getByRole("button", { name: t.review.diff.diff, exact: true }),
            ).toHaveAttribute("aria-pressed", "true");
            await expect(dialog.locator(".review-diff")).toBeVisible();
            await expect(
              dialog.getByRole("article", { name: dialogFinding.title, exact: true }),
            ).toBeFocused();
          }
          for (const finding of dialogReview.findings?.findings ?? []) {
            const card = dialog.getByRole("article", { name: finding.title, exact: true });
            await expect(card).toBeVisible();
            await card.scrollIntoViewIfNeeded();
            await capture(page, dialog, testInfo, `review-finding-${finding.id.split(":")[1]}`);
          }
          const card = dialog.getByRole("article", { name: dialogFinding.title, exact: true });
          const resolve = card.getByRole("button", {
            name: t.review.findings.resolve,
            exact: true,
          });
          await resolve.scrollIntoViewIfNeeded();
          await resolve.focus();
          await expect(resolve).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(resolve).toBeDisabled();
          await capture(page, dialog, testInfo, "review-decision-pending");
          decision.release();
          await expect(dialog.getByRole("alert")).toContainText("Fixture decision refusal.");
          await expect(resolve).toBeEnabled();
          await dialog.getByRole("alert").scrollIntoViewIfNeeded();
          await capture(page, dialog, testInfo, "review-decision-error");
          await resolve.click();
          await expect(
            card.getByText(t.review.findings.statuses.resolved, { exact: true }),
          ).toBeVisible();
          await expect(dialog.getByRole("alert")).toHaveCount(0);
          await capture(page, dialog, testInfo, "review-decision-resolved");
          expect(attempts).toBe(2);
          await dialog.getByRole("button", { name: t.review.diff.close }).click();
          await expect(trigger).toBeFocused();
          snapshot = {
            ...snapshot,
            workItems: [
              {
                ...snapshot.workItems[0],
                stints: [
                  { ...dialogReview, findings: { commit: dialogDiff.headCommit, findings: [] } },
                ],
              },
            ],
          };
          await page.reload();
          await expect(parent).toHaveAttribute("data-state", "open");
          await trigger.click();
          await expect(dialog.getByRole("button", { name: t.review.diff.close })).toBeFocused();
          if (width < 768) {
            await dialog.getByRole("button", { name: t.review.diff.findings, exact: true }).click();
            await expect(dialog.locator(".review-evidence")).toBeVisible();
          }
          await expect(dialog.getByText(t.review.findings.none, { exact: true })).toBeVisible();
          await capture(page, dialog, testInfo, "review-no-findings");
          await dialog.getByRole("button", { name: t.review.diff.close }).click();
          await expect(trigger).toBeFocused();
          snapshot = {
            ...snapshot,
            workItems: [
              {
                ...snapshot.workItems[0],
                stints: [
                  {
                    ...dialogReview,
                    findings: {
                      commit: dialogDiff.headCommit,
                      findings: null,
                      error: "Malformed developer reply 原文。 ".repeat(12),
                      rawReply: `raw ${"unbroken-reply-原文".repeat(120)}`,
                    },
                  },
                ],
              },
            ],
          };
          await page.reload();
          await expect(parent).toHaveAttribute("data-state", "open");
          await trigger.click();
          await expect(dialog.getByRole("button", { name: t.review.diff.close })).toBeFocused();
          if (width < 768) {
            await dialog.getByRole("button", { name: t.review.diff.findings, exact: true }).click();
            await expect(dialog.locator(".review-evidence")).toBeVisible();
          }
          const evidence = dialog.getByRole("complementary", {
            name: t.review.diff.evidence,
            exact: true,
          });
          await expect(evidence.getByRole("alert")).toContainText(t.review.findings.unavailable);
          await evidence.getByText(t.review.findings.rawReply, { exact: true }).click();
          const rawReply = evidence.locator("pre");
          await rawReply.scrollIntoViewIfNeeded();
          await rawReply.focus();
          await expect(rawReply).toBeFocused();
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => rawReply.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
          await capture(page, dialog, testInfo, "review-malformed-reply");
        });

        test("palette: long names, empty search, keyboard navigation and focus return", async ({
          page,
        }, testInfo) => {
          await page.goto("/?view=pipeline");
          const trigger = page.locator("#command-palette-trigger");
          await trigger.click();
          const dialog = page.getByRole("dialog", { name: t.planning.palette.title });
          const search = dialog.getByRole("combobox", { name: t.planning.palette.search });
          await expect(search).toBeFocused();
          await expect(search).toHaveCSS("outline-style", "none");
          await capture(page, dialog, testInfo, "palette-long");
          await search.fill("no-matching-work-item-9384");
          await expect(dialog.getByText(t.planning.palette.empty)).toBeVisible();
          await capture(page, dialog, testInfo, "palette-empty");
          await search.fill("dialog-item");
          await expect(dialog.getByRole("option")).toHaveCount(1);
          await expect(search).toBeFocused();
          await page.keyboard.press("ArrowDown");
          await page.keyboard.press("Enter");
          const drawer = page.locator(".work-item-drawer");
          await expect(drawer.getByRole("button", { name: t.stints.closeWorkItem })).toBeFocused();
          await capture(page, drawer, testInfo, "palette-navigation-drawer");
          await page.keyboard.press("Escape");
          await trigger.click();
          await expect(search).toBeFocused();
          await page.keyboard.press("Escape");
          await expect(trigger).toBeFocused();
          await trigger.click();
          await expect(search).toBeFocused();
          await page
            .locator('.bg-backdrop[data-state="open"]')
            .last()
            .click({
              position: { x: 4, y: 4 },
            });
          await expect(dialog).not.toBeVisible();
          await expect(trigger).toBeFocused();
        });
      });
    }
  }
}
