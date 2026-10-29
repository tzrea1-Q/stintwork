// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { ProjectSnapshot, PullRequest, PullRequestPreview, Stint } from "@stintwork/core";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import { dialogBrief, dialogItem, dialogSnapshot, gate as requestGate } from "./dialogs.fixture";
import { assertLayout } from "./layout-check";

const wideCode = `const result = ${JSON.stringify("Developer-authored content 原文 ".repeat(80))};`;
const recorded: Stint = {
  id: "recorded-stint",
  workItem: dialogItem.slug,
  stage: "spec",
  ticket: null,
  agent: "codex",
  status: "finished",
  startedAt: "2026-10-13T10:00:00Z",
  endedAt: "2026-10-13T10:05:00Z",
  worktree: { path: "/fixture/worktrees/dialog-item", branch: "stintwork/dialog-item" },
  baseCommit: "a".repeat(40),
  checkpointCommit: "b".repeat(40),
  brief: dialogBrief,
  handoff: {
    stint: "recorded-stint",
    agent: "codex",
    stoppedAt: `Kept the original content 原文。\n\n\`\`\`ts\n${wideCode}\n\`\`\``,
    unresolved: "Review the developer-authored paths before proceeding. ".repeat(12),
    nextStep: "Check the next stage 保留原文。",
  },
  events: [
    {
      type: "plan",
      id: "plan",
      entries: [
        {
          content: "Inspect the long paths 原文。 ".repeat(12),
          priority: "high",
          status: "completed",
        },
      ],
    },
    { type: "message", id: "message", text: `## Result\n\n\`\`\`ts\n${wideCode}\n\`\`\`` },
    {
      type: "tool_call",
      toolCallId: "tool",
      title: "Read developer-authored content 原文",
      kind: "read",
      status: "completed",
      output: wideCode,
    },
    { type: "other", kind: "fixture", update: { path: `src/${"long-path/".repeat(100)}file.ts` } },
  ],
};

async function capture(page: Page, overlay: Locator, info: TestInfo, state: string) {
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-state", "open");
  const id = await overlay.getAttribute("id");
  await assertLayout(page, { region: `[id="${id}"]` });
  await overlay.screenshot({ path: info.outputPath(`${state}.png`) });
}

async function scrollCode(page: Page, code: Locator) {
  await code.scrollIntoViewIfNeeded();
  await expect(code).toHaveCSS("white-space", "pre");
  expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await code.focus();
  await expect(code).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
}

for (const language of ["en", "zh-CN"] as const) {
  const t = language === "en" ? en : zhCN;
  for (const width of [1440, 1024, 768, 390, 360]) {
    for (const colorScheme of width === 1440 || width === 390
      ? (["light", "dark"] as const)
      : (["light"] as const)) {
      test.describe(`feature styling ${width}px ${language} ${colorScheme}`, () => {
        let snapshot: ProjectSnapshot;
        let publish: () => Promise<void>;
        test.beforeEach(async ({ page }) => {
          snapshot = { ...dialogSnapshot, workItems: [{ ...dialogItem, stints: [recorded] }] };
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ colorScheme });
          await page.addInitScript(
            (choice) => localStorage.setItem("stintwork.language", choice),
            language,
          );
          await page.route("**/api/project", (route) => route.fulfill({ json: snapshot }));
          const connected = requestGate();
          let send = () => {};
          publish = async () => {
            await connected.ready;
            send();
          };
          await page.routeWebSocket("**/api/live", (socket) => {
            send = () => socket.send(JSON.stringify(snapshot));
            send();
            connected.release();
          });
          await page.route("**/api/agents", (route) => route.fulfill({ json: { agents: [] } }));
          await page.route("**/api/stints/recorded-stint", (route) =>
            route.fulfill({ json: { stint: recorded } }),
          );
        });

        test("GitHub gate sends reviewed evidence and displays a stale approval", async ({
          page,
        }, info) => {
          snapshot.workItems[0].github = {
            repository: "fixture/project",
            repositoryId: "R",
            issueId: "I",
            number: 1,
            url: "https://github.com/fixture/project/issues/1",
            complete: true,
            reviewDigest: "digest",
            reviewHead: "head",
          };
          snapshot.workItems[0].stages = { clarify: { approved: { remoteState: "current" } } };
          await page.route("**/api/github/items/1/gates/approve", async (route) => {
            expect(route.request().postDataJSON()).toEqual({
              stage: "spec",
              reviewedDigest: "digest",
              reviewedHead: "head",
            });
            await route.fulfill({ json: { approval: "stale" } });
          });
          await page.goto("/");
          await page
            .getByRole("button", {
              name: t.card.open(dialogItem.slug, dialogItem.title),
              exact: true,
            })
            .click();
          const drawer = page.getByRole("dialog", { name: dialogItem.title, exact: true });
          const gate = drawer.getByRole("region", {
            name: t.stints.gate(t.workflows.feature.stages.spec),
          });
          await gate
            .getByRole("button", { name: t.stints.approve(t.workflows.feature.stages.spec) })
            .click();
          await expect(gate.getByText(t.stints.githubApproval.stale)).toBeVisible();
          await expect(gate.getByRole("button", { name: t.stints.githubRefresh })).toBeVisible();
          await capture(page, drawer, info, "github-gate-stale");
        });

        test("local gate shows a stale approval after a HEAD race", async ({ page }, info) => {
          await page.route("**/api/work-items/*/gates/spec/approve", (route) =>
            route.fulfill({
              json: { stage: "tickets", approval: "stale", reason: "head-changed" },
            }),
          );
          await page.goto("/");
          await page
            .getByRole("button", {
              name: t.card.open(dialogItem.slug, dialogItem.title),
              exact: true,
            })
            .click();
          const drawer = page.getByRole("dialog", { name: dialogItem.title, exact: true });
          const gate = drawer.getByRole("region", {
            name: t.stints.gate(t.workflows.feature.stages.spec),
          });
          await gate
            .getByRole("button", { name: t.stints.approve(t.workflows.feature.stages.spec) })
            .click();
          await expect(
            gate.getByText(
              t.stints.localApprovalStaleAfterApprove(t.workflows.feature.stages.spec),
            ),
          ).toBeVisible();
          await capture(page, drawer, info, "local-gate-stale");
        });

        test("local gate lists a projected stale approval", async ({ page }, info) => {
          snapshot.workItems[0].stages = {
            clarify: {
              approved: {
                by: "You",
                at: "2026-10-13T10:00:00Z",
                commit: "head",
                state: "stale",
                stateReason: "head-changed",
              },
            },
          };
          await page.goto("/");
          await page
            .getByRole("button", {
              name: t.card.open(dialogItem.slug, dialogItem.title),
              exact: true,
            })
            .click();
          const drawer = page.getByRole("dialog", { name: dialogItem.title, exact: true });
          const gate = drawer.getByRole("region", {
            name: t.stints.gate(t.workflows.feature.stages.spec),
          });
          const line = gate.getByText(
            `${t.workflows.feature.stages.clarify}: ${t.stints.localApprovalStale(t.workflows.feature.stages.clarify)}`,
          );
          await expect(line).toBeVisible();
          await line.scrollIntoViewIfNeeded();
          await capture(page, drawer, info, "local-gate-stale-projected");
        });

        test("local stale approval survives the stage advance", async ({ page }, info) => {
          await page.route("**/api/work-items/*/gates/spec/approve", async (route) => {
            snapshot.workItems[0] = {
              ...snapshot.workItems[0],
              stage: "tickets",
              stages: {
                ...snapshot.workItems[0].stages,
                spec: {
                  approved: {
                    by: "You",
                    at: "2026-10-13T10:00:00Z",
                    commit: "head",
                    state: "stale",
                    stateReason: "head-changed",
                  },
                },
              },
            };
            await route.fulfill({
              json: { stage: "tickets", approval: "stale", reason: "head-changed" },
            });
            await publish();
          });
          await page.goto("/");
          await page
            .getByRole("button", {
              name: t.card.open(dialogItem.slug, dialogItem.title),
              exact: true,
            })
            .click();
          const drawer = page.getByRole("dialog", { name: dialogItem.title, exact: true });
          const specGate = drawer.getByRole("region", {
            name: t.stints.gate(t.workflows.feature.stages.spec),
          });
          await specGate
            .getByRole("button", { name: t.stints.approve(t.workflows.feature.stages.spec) })
            .click();
          const gate = drawer.getByRole("region", {
            name: t.stints.gate(t.workflows.feature.stages.tickets),
          });
          const line = gate.getByText(
            `${t.workflows.feature.stages.spec}: ${t.stints.localApprovalStale(t.workflows.feature.stages.spec)}`,
          );
          await expect(line).toBeVisible();
          await expect(
            gate.getByRole("button", { name: t.stints.reopen(t.workflows.feature.stages.spec) }),
          ).toBeVisible();
          await line.scrollIntoViewIfNeeded();
          await capture(page, drawer, info, "local-gate-stale-advanced");
        });

        test("gate, handoff and replay keep long code inside their own boxes", async ({
          page,
        }, info) => {
          const saving = requestGate();
          let attempts = 0;
          await page.route("**/api/work-items/*/gates/spec/approve", async (route) => {
            attempts++;
            if (attempts === 1) {
              await saving.ready;
              await route.fulfill({
                status: 409,
                json: {
                  reason: `Fixture gate refusal. ${"Long recovery detail 原文。 ".repeat(15)}`,
                },
              });
            } else await route.fulfill({ json: { stage: "tickets" } });
          });
          await page.goto("/");
          const trigger = page.getByRole("button", {
            name: t.card.open(dialogItem.slug, dialogItem.title),
            exact: true,
          });
          await trigger.click();
          const drawer = page.getByRole("dialog", { name: dialogItem.title, exact: true });
          const gate = drawer.getByRole("region", {
            name: t.stints.gate(t.workflows.feature.stages.spec),
          });
          await gate.scrollIntoViewIfNeeded();
          await expect(
            gate.getByRole("button", { name: t.stints.approve(t.workflows.feature.stages.spec) }),
          ).toBeEnabled();
          await scrollCode(page, gate.locator("pre").first());
          await capture(page, drawer, info, "gate-handoff");
          const history = drawer.getByRole("list", { name: t.stints.history });
          const replay = history.getByRole("button", { name: t.stints.openStint(recorded.id) });
          await replay.click();
          await expect(history.locator(".stint-stream")).toBeVisible();
          await history.locator(".stint-tool-output summary").click();
          await history.locator(".stint-event-other summary").click();
          for (const code of await history.locator("pre").all()) await scrollCode(page, code);
          await capture(page, drawer, info, "stint-replay-details");
          await history.getByRole("button", { name: t.stints.closeStint(recorded.id) }).click();
          const approve = gate.getByRole("button", {
            name: t.stints.approve(t.workflows.feature.stages.spec),
          });
          await approve.click();
          await expect(approve).toBeDisabled();
          await capture(page, drawer, info, "gate-saving");
          saving.release();
          await expect(gate.getByRole("alert")).toContainText("Fixture gate refusal.");
          await expect(approve).toBeEnabled();
          await capture(page, drawer, info, "gate-error");
          await approve.click();
          await expect(gate.getByRole("status").last()).toHaveText(
            t.stints.gateApproved(t.workflows.feature.stages.tickets),
          );
          await capture(page, drawer, info, "gate-approved");
          expect(attempts).toBe(2);
          const close = drawer.getByRole("button", { name: t.stints.closeWorkItem });
          await close.focus();
          await expect(close).toBeFocused();
          const tooltip = page.getByRole("tooltip", { name: t.stints.closeWorkItem, exact: true });
          await expect(tooltip).toHaveText(t.stints.closeWorkItem);
          const tooltipBox = page
            .locator("[data-radix-popper-content-wrapper]")
            .filter({ has: tooltip });
          await expect(
            tooltipBox.locator('[data-state="instant-open"], [data-state="delayed-open"]'),
          ).toBeVisible();
          await assertLayout(page, { region: ".work-item-drawer" });
          await tooltipBox.screenshot({ path: info.outputPath("gate-close-tooltip.png") });
          await page.keyboard.press("Escape");
          await expect(tooltip).toBeHidden();
          await expect(drawer).toHaveAttribute("data-state", "open");
          await expect(close).toBeFocused();
          await page.keyboard.press("Escape");
          await expect(drawer).toBeHidden();
          await expect(trigger).toBeFocused();
          snapshot = {
            ...snapshot,
            workItems: [{ ...dialogItem, spec: null, stints: [], tickets: [] }],
          };
          await page.reload();
          await trigger.click();
          await expect(drawer.getByRole("button", { name: t.stints.closeWorkItem })).toBeFocused();
          await expect(approve).toBeDisabled();
          await expect(gate.getByText(t.stints.noHandoffRecorded, { exact: true })).toBeVisible();
          await expect(gate.getByText(t.stints.noWarnings, { exact: true })).toBeVisible();
          await gate.scrollIntoViewIfNeeded();
          await capture(page, drawer, info, "gate-empty-blocked");
        });

        test("ship: pending/refused publishing and merge, conflicts, empty CI and nested dismissal", async ({
          page,
        }, info) => {
          const pr: PullRequest = {
            number: 12,
            repo: "fixture/project",
            url: "https://github.com/fixture/project/pull/12",
            remote: "origin",
            remoteUrl: "git@github.com:fixture/project.git",
            branch: "stintwork/dialog-item",
            base: "main",
            headCommit: "c".repeat(40),
          };
          const preview: PullRequestPreview = {
            ...pr,
            remoteUrl: `git@github.com:fixture/${"long-remote-path/".repeat(12)}project.git`,
            branch: `stintwork/${"long-branch-原文/".repeat(12)}dialog-item`,
            base: `release/${"long-base/".repeat(12)}main`,
            title: dialogItem.title,
            body: `## Developer-authored description 原文\n${wideCode}\n${"Long description 原文\n".repeat(60)}`,
            confirmation: "fixture-confirmation",
          };
          const previewReady = requestGate();
          const publishing = requestGate();
          const mergeReady = requestGate();
          const merging = requestGate();
          let previewAttempts = 0;
          let publishAttempts = 0;
          let mergePreviewAttempts = 0;
          let mergeAttempts = 0;
          const longPath = `src/${"conflicting-directory-原文/".repeat(30)}module.ts`;
          snapshot = { ...snapshot, workItems: [{ ...dialogItem, stage: "ship", column: "ship" }] };
          await page.route("**/api/work-items/*/ship/preview-pr", async (route) => {
            previewAttempts++;
            if (previewAttempts === 1) {
              await previewReady.ready;
              await route.fulfill({
                status: 409,
                json: { reason: "Fixture publishing preview refusal." },
              });
            } else await route.fulfill({ json: { preview } });
          });
          await page.route("**/api/work-items/*/ship/open-pr", async (route) => {
            expect(route.request().postDataJSON()).toEqual({ confirmation: preview.confirmation });
            publishAttempts++;
            if (publishAttempts === 1) {
              await publishing.ready;
              await route.fulfill({
                status: 409,
                json: {
                  reason: `Fixture publishing refusal. ${"Long recovery detail 原文。 ".repeat(15)}`,
                  conflicts: [longPath],
                  paths: [longPath],
                },
              });
            } else await route.fulfill({ json: { pullRequest: pr } });
          });
          await page.route("**/api/work-items/*/ship/preview-merge-pr", async (route) => {
            mergePreviewAttempts++;
            if (mergePreviewAttempts === 1) {
              await mergeReady.ready;
              await route.fulfill({
                status: 409,
                json: { reason: "Fixture merge preview refusal." },
              });
            } else await route.fulfill({ json: { mergeMethod: "squash" } });
          });
          await page.route("**/api/work-items/*/ship/merge-pr", async (route) => {
            expect(route.request().postDataJSON()).toEqual({ mergeMethod: "squash" });
            mergeAttempts++;
            if (mergeAttempts === 1) {
              await merging.ready;
              await route.fulfill({
                status: 409,
                json: { reason: "Fixture merge refusal.", paths: [longPath] },
              });
            } else await route.fulfill({ json: { merged: { commit: "d".repeat(40) } } });
          });
          await page.goto("/");
          await page
            .getByRole("button", {
              name: t.card.open(dialogItem.slug, dialogItem.title),
              exact: true,
            })
            .click();
          const drawer = page.getByRole("dialog", { name: dialogItem.title, exact: true });
          await expect(drawer.getByRole("button", { name: t.stints.closeWorkItem })).toBeFocused();
          const ship = drawer.getByRole("region", { name: t.review.ship.label, exact: true });
          const publish = drawer.getByRole("button", { name: t.review.ship.openPr });
          await ship.scrollIntoViewIfNeeded();
          await capture(page, drawer, info, "ship-no-pr");
          await publish.click();
          await expect(publish).toBeDisabled();
          await capture(page, drawer, info, "ship-preview-loading");
          previewReady.release();
          await expect(ship.getByRole("alert")).toHaveText("Fixture publishing preview refusal.");
          await expect(publish).toBeEnabled();
          await capture(page, drawer, info, "ship-preview-error");
          await publish.click();
          const confirmation = page.getByRole("dialog", { name: t.review.ship.confirmPublishing });
          await scrollCode(page, confirmation.locator("pre"));
          await capture(page, confirmation, info, "publishing-confirmation");
          await confirmation.getByRole("button", { name: t.review.ship.confirmPush }).focus();
          await expect(
            confirmation.getByRole("button", { name: t.review.ship.confirmPush }),
          ).toBeFocused();
          await assertLayout(page, { region: `[id="${await confirmation.getAttribute("id")}"]` });
          await page.keyboard.press("Escape");
          await expect(confirmation).toBeHidden();
          await expect(drawer).toBeVisible();
          await expect(publish).toBeFocused();
          await publish.click();
          await expect(confirmation).toHaveAttribute("data-state", "open");
          const confirmPush = confirmation.getByRole("button", { name: t.review.ship.confirmPush });
          await confirmPush.click();
          await expect(confirmPush).toBeDisabled();
          await confirmation.focus();
          await expect(confirmation).toBeFocused();
          await page.keyboard.press("Escape");
          await page
            .locator('.bg-backdrop[data-state="open"]')
            .last()
            .click({ position: { x: 4, y: 4 } });
          await capture(page, confirmation, info, "ship-publishing-pending");
          publishing.release();
          await expect(confirmation).toBeHidden();
          await expect(publish).toBeFocused();
          await expect(ship.getByRole("alert")).toContainText("Fixture publishing refusal.");
          await expect(
            ship
              .getByRole("region", { name: t.review.ship.conflicts })
              .getByText(longPath, { exact: true }),
          ).toBeVisible();
          await expect(ship.getByRole("button", { name: t.review.ship.sendBack })).toBeEnabled();
          await ship.getByRole("alert").scrollIntoViewIfNeeded();
          await capture(page, drawer, info, "ship-conflicts-paths-error");
          await publish.click();
          await expect(confirmation).toHaveAttribute("data-state", "open");
          await confirmPush.click();
          await expect(confirmation).toBeHidden();
          await expect(ship.getByRole("button", { name: t.review.ship.mergePr })).toBeDisabled();
          await expect(ship.getByText(t.review.ship.notReady, { exact: true })).toBeVisible();
          await capture(page, drawer, info, "ship-pr-empty-ci");
          expect(publishAttempts).toBe(2);
          await expect(publish).toBeHidden();
          const close = drawer.getByRole("button", { name: t.stints.closeWorkItem });
          await close.focus();
          await expect(close).toBeFocused();
          const tooltip = page.getByRole("tooltip", { name: t.stints.closeWorkItem, exact: true });
          await expect(tooltip).toHaveText(t.stints.closeWorkItem);
          const tooltipBox = page
            .locator("[data-radix-popper-content-wrapper]")
            .filter({ has: tooltip });
          await expect(
            tooltipBox.locator('[data-state="instant-open"], [data-state="delayed-open"]'),
          ).toBeVisible();
          await assertLayout(page, { region: ".work-item-drawer" });
          await tooltipBox.screenshot({ path: info.outputPath("ship-close-tooltip.png") });
          await page.keyboard.press("Escape");
          await expect(tooltip).toBeHidden();
          await expect(drawer).toHaveAttribute("data-state", "open");
          await expect(close).toBeFocused();
          await page.keyboard.press("Escape");
          await expect(drawer).toBeHidden();
          snapshot = {
            ...snapshot,
            workItems: [
              {
                ...snapshot.workItems[0],
                pullRequest: pr,
                headCommit: pr.headCommit,
                stages: { ...dialogItem.stages, review: { approved: { commit: pr.headCommit } } },
                pullRequestChecks: {
                  number: 12,
                  headCommit: pr.headCommit,
                  state: "OPEN",
                  fetchedAt: "2026-10-13T10:00:00Z",
                  checks: [{ name: "CI", bucket: "pass", link: "" }],
                },
              },
            ],
          };
          await page.reload();
          await page
            .getByRole("button", {
              name: t.card.open(dialogItem.slug, dialogItem.title),
              exact: true,
            })
            .click();
          const merge = drawer.getByRole("button", { name: t.review.ship.mergePr });
          await expect(merge).toBeEnabled();
          await merge.click();
          await expect(merge).toBeDisabled();
          await capture(page, drawer, info, "ship-merge-preview-loading");
          mergeReady.release();
          await expect(ship.getByRole("alert")).toHaveText("Fixture merge preview refusal.");
          await expect(merge).toBeEnabled();
          await capture(page, drawer, info, "ship-merge-preview-error");
          await merge.click();
          const mergeDialog = page.getByRole("dialog", { name: t.review.ship.confirmMerge });
          await capture(page, mergeDialog, info, "merge-confirmation");
          await mergeDialog.getByRole("button", { name: t.review.ship.cancel }).click();
          await expect(mergeDialog).toBeHidden();
          await expect(drawer).toBeVisible();
          await expect(merge).toBeFocused();
          await merge.click();
          await expect(mergeDialog).toHaveAttribute("data-state", "open");
          const confirmMerge = mergeDialog.getByRole("button", {
            name: t.review.ship.confirmMethod("squash"),
          });
          await confirmMerge.click();
          await expect(confirmMerge).toBeDisabled();
          await mergeDialog.focus();
          await expect(mergeDialog).toBeFocused();
          await page.keyboard.press("Escape");
          await page
            .locator('.bg-backdrop[data-state="open"]')
            .last()
            .click({ position: { x: 4, y: 4 } });
          await capture(page, mergeDialog, info, "ship-merging-pending");
          merging.release();
          await expect(mergeDialog).toBeHidden();
          await expect(merge).toBeFocused();
          await expect(ship.getByRole("alert")).toHaveText("Fixture merge refusal.");
          await capture(page, drawer, info, "ship-merge-error");
          await merge.click();
          await expect(mergeDialog).toHaveAttribute("data-state", "open");
          await confirmMerge.click();
          await expect(mergeDialog).toBeHidden();
          await expect(ship.getByRole("status")).toHaveText(
            t.review.ship.shippedAt(12, "d".repeat(40)),
          );
          await capture(page, drawer, info, "ship-merged");
          expect(mergeAttempts).toBe(2);
          snapshot = {
            ...snapshot,
            workItems: [
              {
                ...snapshot.workItems[0],
                merged: {
                  at: "2026-10-13T10:10:00Z",
                  commit: "d".repeat(40),
                  pr: pr.url,
                  method: "squash",
                },
              },
            ],
          };
          await page.reload();
          await expect(drawer.getByRole("button", { name: t.stints.closeWorkItem })).toBeFocused();
          await expect(
            ship.getByRole("heading", { name: t.review.ship.shipped, exact: true }),
          ).toBeVisible();
          await expect(ship.getByRole("button")).toHaveCount(0);
          await ship.scrollIntoViewIfNeeded();
          await capture(page, drawer, info, "ship-shipped-record");
        });
      });
    }
  }
}
