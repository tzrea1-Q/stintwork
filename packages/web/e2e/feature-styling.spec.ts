// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { ProjectSnapshot, PullRequest, PullRequestPreview, Stint } from "@stintwork/core";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import { dialogBrief, dialogItem, dialogSnapshot } from "./dialogs.fixture";
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
  const id = await overlay.getAttribute("id");
  await assertLayout(page, { region: `[id="${id}"]` });
  await overlay.screenshot({ path: info.outputPath(`${state}.png`) });
}

async function scrollCode(page: Page, code: Locator) {
  await code.scrollIntoViewIfNeeded();
  await expect(code).toHaveCSS("white-space", "pre");
  expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await code.focus();
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
        test.beforeEach(async ({ page }) => {
          snapshot = { ...dialogSnapshot, workItems: [{ ...dialogItem, stints: [recorded] }] };
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
          await page.route("**/api/stints/recorded-stint", (route) =>
            route.fulfill({ json: { stint: recorded } }),
          );
        });

        test("gate, handoff and replay keep long code inside their own boxes", async ({
          page,
        }, info) => {
          await page.route("**/api/work-items/*/gates/spec/approve", (route) =>
            route.fulfill({ json: { stage: "tickets" } }),
          );
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
          await expect(gate.getByRole("status").last()).toHaveText(
            t.stints.gateApproved(t.workflows.feature.stages.tickets),
          );
          await capture(page, drawer, info, "gate-approved");
          await page.keyboard.press("Escape");
          await expect(trigger).toBeFocused();
        });

        test("publishing and merge confirmations dismiss only their topmost dialog", async ({
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
            title: dialogItem.title,
            body: `## Developer-authored description 原文\n${wideCode}\n${"Long description 原文\n".repeat(60)}`,
            confirmation: "fixture-confirmation",
          };
          snapshot = { ...snapshot, workItems: [{ ...dialogItem, stage: "ship", column: "ship" }] };
          await page.route("**/api/work-items/*/ship/preview-pr", (route) =>
            route.fulfill({ json: { preview } }),
          );
          await page.route("**/api/work-items/*/ship/preview-merge-pr", (route) =>
            route.fulfill({ json: { mergeMethod: "squash" } }),
          );
          await page.goto("/");
          await page
            .getByRole("button", {
              name: t.card.open(dialogItem.slug, dialogItem.title),
              exact: true,
            })
            .click();
          const drawer = page.getByRole("dialog", { name: dialogItem.title, exact: true });
          const publish = drawer.getByRole("button", { name: t.review.ship.openPr });
          await publish.click();
          const confirmation = page.getByRole("dialog", { name: t.review.ship.confirmPublishing });
          await scrollCode(page, confirmation.locator("pre"));
          await capture(page, confirmation, info, "publishing-confirmation");
          await confirmation
            .getByRole("button", { name: t.review.ship.confirmPush })
            .scrollIntoViewIfNeeded();
          await assertLayout(page, { region: `[id="${await confirmation.getAttribute("id")}"]` });
          await page.keyboard.press("Escape");
          await expect(confirmation).toBeHidden();
          await expect(drawer).toBeVisible();
          await expect(publish).toBeFocused();
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
          const mergeDialog = page.getByRole("dialog", { name: t.review.ship.confirmMerge });
          await capture(page, mergeDialog, info, "merge-confirmation");
          await mergeDialog.getByRole("button", { name: t.review.ship.cancel }).click();
          await expect(mergeDialog).toBeHidden();
          await expect(drawer).toBeVisible();
          await expect(merge).toBeFocused();
        });
      });
    }
  }
}
