// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { builtInWorkflowYaml } from "@stintwork/core";
import { codexProfile } from "../../agents/src/profiles";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import { dialogBrief, dialogDiff, dialogItem, dialogSnapshot } from "./dialogs.fixture";
import { assertLayout } from "./layout-check";

function gate() {
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { ready, release };
}

async function capture(page: Page, dialog: Locator, testInfo: TestInfo, state: string) {
  await expect(dialog).toBeVisible();
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

        test("create: empty, checking, long content, pending save and refusal", async ({
          page,
        }, testInfo) => {
          const preview = gate();
          const save = gate();
          await page.route("**/api/work-items/preview", async (route) => {
            await preview.ready;
            await route.fulfill({ json: { slug: "dialog-example" } });
          });
          await page.route("**/api/work-items", async (route) => {
            await save.ready;
            await route.fulfill({
              status: 409,
              json: { reason: "Fixture save refusal. No files changed." },
            });
          });
          await page.goto("/");
          await page.getByRole("button", { name: t.planning.create.title, exact: true }).click();
          const dialog = page.getByRole("dialog", { name: t.planning.create.title });
          const confirm = dialog.getByRole("button", {
            name: t.planning.create.title,
            exact: true,
          });
          await expect(confirm).toBeDisabled();
          await expect(dialog.getByRole("status")).toHaveText(t.planning.create.enterTitle);
          await capture(page, dialog, testInfo, "create-empty");
          await dialog
            .getByRole("textbox", { name: t.planning.create.titleLabel })
            .fill(dialogItem.title);
          await expect(dialog.getByRole("status")).toHaveText(t.planning.create.checking);
          await capture(page, dialog, testInfo, "create-checking");
          preview.release();
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
          await page.keyboard.press("Escape");
          await page.mouse.click(4, 4);
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
          await page.goto("/");
          const trigger = page.getByRole("button", { name: t.planning.roadmap.title });
          await trigger.click();
          const dialog = page.getByRole("dialog", { name: t.planning.roadmap.title });
          await capture(page, dialog, testInfo, "roadmap-long");
          await dialog
            .getByRole("textbox", { name: t.planning.roadmap.newName })
            .fill("New milestone 原文");
          const add = dialog.getByRole("button", { name: t.planning.roadmap.add });
          await reachable(page, add);
          await add.click();
          await expect(
            dialog.getByRole("button", { name: t.planning.roadmap.close }),
          ).toBeDisabled();
          await page.keyboard.press("Escape");
          await page.mouse.click(4, 4);
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
          await page.mouse.click(4, 4);
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
          await page.goto("/");
          const open = async () => {
            await expect(page.locator("#command-palette-trigger")).toBeVisible();
            await page.keyboard.press("Control+k");
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
          await page.keyboard.press("Escape");
          await page.mouse.click(4, 4);
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
          await page.mouse.click(4, 4);
          await expect(dialog).toBeHidden();
        });

        test("brief: loading, no agents, long prompt, error and nested dismissal", async ({
          page,
        }, testInfo) => {
          const preview = gate();
          let noAgents = true;
          let refuse = false;
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
          const start = dialog.getByRole("button", { name: t.stints.start, exact: true });
          await expect(start).toBeEnabled();
          await reachable(page, start);
          const content = dialog.locator(".brief-preview-content");
          expect(
            await content.evaluate((element) => element.scrollHeight > element.clientHeight),
          ).toBe(true);
          await dialog.getByRole("heading", { name: t.stints.fullPrompt }).scrollIntoViewIfNeeded();
          await capture(page, dialog, testInfo, "brief-long");
          await content.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
          await capture(page, dialog, testInfo, "brief-long-bottom");
          await page.mouse.click(4, 4);
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
          await hunk.scrollIntoViewIfNeeded();
          expect(await hunk.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
            true,
          );
          await hunk.focus();
          await expect(hunk).toBeFocused();
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => hunk.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
          await capture(page, dialog, testInfo, "review-long-diff");
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
          await page.mouse.click(4, 4);
          await expect(trigger).toBeFocused();
          await expect(parent).toBeVisible();
        });

        test("palette: long names, empty search, keyboard navigation and focus return", async ({
          page,
        }, testInfo) => {
          await page.goto("/");
          const trigger = page.locator("#command-palette-trigger");
          await trigger.click();
          const dialog = page.getByRole("dialog", { name: t.planning.palette.title });
          const search = dialog.getByRole("combobox", { name: t.planning.palette.search });
          await expect(search).toBeFocused();
          await capture(page, dialog, testInfo, "palette-long");
          await search.fill("no-matching-work-item-9384");
          await expect(dialog.getByText(t.planning.palette.empty)).toBeVisible();
          await capture(page, dialog, testInfo, "palette-empty");
          await search.fill("dialog-item");
          await expect(dialog.getByRole("option")).toHaveCount(1);
          await page.keyboard.press("ArrowDown");
          await page.keyboard.press("Enter");
          await expect(page.getByRole("dialog", { name: dialogItem.title })).toBeVisible();
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
