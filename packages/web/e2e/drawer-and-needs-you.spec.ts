// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { ProjectSnapshot } from "@stintwork/core";
import { codexProfile, claudeProfile } from "../../agents/src/profiles";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import { assertLayout } from "./layout-check";

const longPath = `/worktrees/${"long-directory-工程/".repeat(14)}example.ts`;
const wideCode = `const longExample = "${"unbroken-code-原文".repeat(100)}";`;

async function openFixture(page: Page, language: "en" | "zh-CN") {
  const response = await page.request.get("/api/project");
  expect(response.ok()).toBe(true);
  const snapshot: ProjectSnapshot = await response.json();
  const item = snapshot.workItems.find((entry) => entry.slug === "long-title");
  if (!item?.spec || !item.tickets[0]) throw new Error("The shared long-title fixture is required");
  item.worktreePath = longPath;
  item.spec.text += `\n\n${"Long specification with developer content 原文.\n\n".repeat(30)}\n\n\`\`\`ts\n${wideCode}\n\`\`\``;
  item.tickets[0].title = "A long ticket name 工单标题 ".repeat(12);
  item.tickets[0].path = longPath;
  item.tickets[0].body += `\n\n${"Ticket details 原文.\n\n".repeat(20)}\n\n\`\`\`ts\n${wideCode}\n\`\`\``;
  await page.addInitScript(
    (choice) => localStorage.setItem("stintwork.language", choice),
    language,
  );
  await page.route("**/api/project", (route) => route.fulfill({ json: snapshot }));
  let publish = () => {};
  let connected!: () => void;
  const socketReady = new Promise<void>((resolve) => {
    connected = resolve;
  });
  await page.routeWebSocket("**/api/live", (socket) => {
    publish = () => socket.send(JSON.stringify(snapshot));
    publish();
    connected();
  });
  return {
    snapshot,
    item,
    publish: async () => {
      await socketReady;
      publish();
    },
  };
}

async function captureSheet(page: Page, testInfo: TestInfo, region: string, state: string) {
  await page.mouse.move(0, 0);
  await assertLayout(page, { region });
  await page.screenshot({ path: testInfo.outputPath(`${state}.png`), fullPage: true });
}

async function scrollContent(content: Locator) {
  expect(await content.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await content.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
}

for (const language of ["en", "zh-CN"] as const) {
  const t = language === "en" ? en : zhCN;
  for (const width of [1440, 1024, 768, 390, 360]) {
    for (const colorScheme of width === 1440 || width === 390
      ? (["light", "dark"] as const)
      : (["light"] as const)) {
      test(`drawer ${width}px ${language} ${colorScheme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        const { snapshot, item } = await openFixture(page, language);
        let releaseAgents = () => {};
        const agentsReady = new Promise<void>((resolve) => {
          releaseAgents = resolve;
        });
        await page.route("**/api/agents", async (route) => {
          await agentsReady;
          await route.fulfill({ status: 503, json: { reason: t.stints.loadAgentsFailed } });
        });
        await page.goto("/?view=pipeline");
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        const trigger = page.locator('.board-scroll [data-work-item="long-title"]');
        await trigger.focus();
        await page.keyboard.press("Enter");
        const sheet = page.locator(".work-item-drawer");
        const close = sheet.getByRole("button", { name: t.stints.closeWorkItem });
        await expect(close).toBeFocused();
        await expect(
          sheet.locator(".drawer-header").getByRole("heading", { name: item.title, exact: true }),
        ).toHaveAttribute("title", item.title);
        await expect(sheet.getByRole("combobox").last()).toBeDisabled();
        await captureSheet(page, testInfo, ".work-item-drawer", "drawer-loading");
        releaseAgents();
        await expect(
          sheet.getByRole("alert").filter({ hasText: t.stints.loadAgentsFailed }),
        ).toBeVisible();
        const warning = sheet.getByRole("alert").filter({ hasText: t.stints.loadAgentsFailed });
        const insets = await sheet.locator(".drawer-header").evaluate((element) => ({
          left:
            element.getBoundingClientRect().left +
            Number.parseFloat(getComputedStyle(element).paddingLeft),
          right:
            element.getBoundingClientRect().right -
            Number.parseFloat(getComputedStyle(element).paddingRight),
        }));
        const warningText = await warning.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const bounds = range.getBoundingClientRect();
          return { left: bounds.left, right: bounds.right };
        });
        expect(warningText.left).toBeGreaterThanOrEqual(insets.left - 1);
        expect(warningText.right).toBeLessThanOrEqual(insets.right + 1);
        await captureSheet(page, testInfo, ".work-item-drawer", "drawer-error");
        const content = sheet.locator(".drawer-content");
        await sheet.locator(".drawer-ticket summary").click();
        await expect(sheet.locator('.drawer-header button[aria-haspopup="menu"]')).toHaveCount(0);
        await scrollContent(content);
        const code = content.locator(".markdown pre").first();
        await code.scrollIntoViewIfNeeded();
        await code.evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        expect(await code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
        await expect(close).toBeInViewport();
        await captureSheet(page, testInfo, ".work-item-drawer", "drawer-long-scrolled");
        await close.click();
        await expect(sheet).not.toBeVisible();
        await expect(trigger).toBeFocused();

        const languageTrigger = page.locator("#settings-trigger");
        await languageTrigger.click();
        await expect(
          page.getByRole("menuitemradio", { name: t.topBar.languages[language] }),
        ).toBeFocused();
        await captureSheet(page, testInfo, '[role="menu"]', "settings-language-open");
        const other = language === "en" ? "zh-CN" : "en";
        await page.keyboard.press(language === "en" ? "ArrowDown" : "ArrowUp");
        await expect(
          page.getByRole("menuitemradio", { name: t.topBar.languages[other] }),
        ).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("html")).toHaveAttribute("lang", other);
        await expect(languageTrigger).toBeFocused();
        await trigger.click();
        await expect(sheet).toHaveAttribute("data-state", "open");
        await expect(
          sheet.getByRole("button", { name: (other === "en" ? en : zhCN).stints.closeWorkItem }),
        ).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(sheet).not.toBeVisible();
        await expect
          .poll(() => page.evaluate(() => localStorage.getItem("stintwork.language")))
          .toBe(other);
        await languageTrigger.click();
        await expect(
          page.getByRole("menuitemradio", { name: t.topBar.languages[other] }),
        ).toBeFocused();
        await page.keyboard.press(language === "en" ? "ArrowUp" : "ArrowDown");
        await expect(
          page.getByRole("menuitemradio", { name: t.topBar.languages[language] }),
        ).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        await expect(languageTrigger).toBeFocused();
        await expect
          .poll(() => page.evaluate(() => localStorage.getItem("stintwork.language")))
          .toBe(language);

        await page.route("**/api/agents", (route) =>
          route.fulfill({ json: { agents: [codexProfile, claudeProfile] } }),
        );
        await page.route("**/api/work-items/*/stages/*/agent", (route) =>
          route.fulfill({ json: { agent: route.request().postDataJSON().agent } }),
        );
        await page.reload();
        await trigger.click();
        const picker = sheet.locator(".stage-rail").getByRole("combobox").first();
        await expect(picker).toBeEnabled();
        await picker.click();
        await captureSheet(page, testInfo, '[role="listbox"]', "drawer-agent-open");
        await page.getByRole("option", { name: "Claude Code", exact: true }).click();
        await expect(picker).toContainText("Claude Code");
        await expect(picker).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(sheet).not.toBeVisible();
        await expect(trigger).toBeFocused();

        item.spec = null;
        item.tickets = [];
        item.stints = [];
        item.activeStint = null;
        item.worktreePath = undefined;
        snapshot.attentionItems = [];
        await page.reload();
        await trigger.click();
        await expect(sheet.getByText(t.stints.noSpec, { exact: true })).toBeVisible();
        await expect(sheet.getByText(t.stints.noTickets, { exact: true })).toBeVisible();
        await expect(sheet.getByText(t.stints.noStints, { exact: true })).toBeVisible();
        await captureSheet(page, testInfo, ".work-item-drawer", "drawer-empty");
        await sheet.getByRole("link", { name: t.stints.spec, exact: true }).focus();
        await page.keyboard.press("Escape");
        await expect(sheet).not.toBeVisible();
        await expect(trigger).toBeFocused();
      });

      test(`Needs you shows a stale local approval with a reopen action ${width}px ${language} ${colorScheme}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        const { snapshot, item } = await openFixture(page, language);
        item.stage = "tickets";
        item.column = "tickets";
        item.stages.spec = {
          approved: {
            by: "Developer",
            at: "2026-10-29T12:00:00Z",
            commit: "abc",
            state: "stale",
            stateReason: "head-changed",
          },
        };
        snapshot.workItems = [item];
        snapshot.warnings = [];
        snapshot.attentionItems = [
          {
            kind: "approval-stale",
            id: `approval-stale:${JSON.stringify([item.slug, "spec", "2026-10-29T12:00:00Z", "abc"])}`,
            workItem: item.slug,
            stage: "spec",
            ticket: null,
            stintId: null,
            agent: null,
            title: "Spec approval is stale",
            details:
              "HEAD changed while the approval was recorded. Reopen Spec to review the newer commits.",
            raisedAt: "2026-10-29T12:00:00Z",
          },
        ];
        await page.goto("/?view=pipeline");
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        await page.locator("#needs-you-trigger").click();
        const sheet = page.locator(".needs-you-queue");
        const stage = language === "en" ? "Spec" : "规格说明";
        await expect(
          sheet.getByRole("heading", { name: t.needsYou.staleApprovalTitle(stage) }),
        ).toBeVisible();
        await expect(sheet.getByText(t.needsYou.staleApprovalDetails(stage))).toBeVisible();
        const reopen = sheet.getByRole("button", { name: t.stints.reopen(stage) });
        await reopen.scrollIntoViewIfNeeded();
        await expect(reopen).toBeVisible();
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-approval-stale");
      });

      test(`Needs you ${width}px ${language} ${colorScheme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        const { snapshot, item, publish } = await openFixture(page, language);
        snapshot.agents = [
          {
            id: "fixture-agent",
            displayName: "Fixture agent 原文",
            installationHint: "Synthetic fixture",
            capabilities: {
              modes: [],
              defaultMode: null,
              additionalDirectories: false,
              permissionOptions: null,
              declineEndsTurn: true,
              authenticationRequired: {
                message: "Authentication required",
                loginCommand: "fixture-agent login",
              },
              configOptions: [],
            },
          },
        ];
        snapshot.warnings = [
          {
            path: longPath,
            message: `Project warning 原文\n${"Long warning detail 中文 ".repeat(30)}`,
          },
        ];
        snapshot.attentionItems = Array.from({ length: 8 }, (_, index) => ({
          id: `permission-${index}`,
          kind: "permission",
          workItem: item.slug,
          ticket: 1,
          stintId: "fixture-stint",
          agent: "fixture-agent",
          requestId: `request-${index}`,
          title: `Permission ${index}: ${"long attention title 原文 ".repeat(8)}`,
          details: JSON.stringify(
            { rawInput: { command: wideCode, cwd: longPath }, locations: [{ path: longPath }] },
            null,
            2,
          ),
          raisedAt: "2026-10-13T10:00:00Z",
          options: [
            {
              optionId: "allow_once",
              kind: "allow_once",
              name: "Allow this long command 原文 ".repeat(8),
            },
            { optionId: "reject_once", kind: "reject_once", name: "Decline 原文" },
          ],
        }));
        const restored = snapshot.attentionItems[0];
        if (restored.kind !== "permission") throw new Error("Expected permission fixture");
        restored.binding = "reconnecting";
        restored.attemptId = "old-attempt";
        let releaseAnswer = () => {};
        const answerReady = new Promise<void>((resolve) => {
          releaseAnswer = resolve;
        });
        let attempts = 0;
        await page.route("**/api/stints/fixture-stint/permissions/request-0", async (route) => {
          expect(route.request().postDataJSON()).toEqual({
            optionId: "allow_once",
            attemptId: "new-attempt",
          });
          attempts++;
          if (attempts === 1) {
            await answerReady;
            await route.fulfill({ status: 503, json: { reason: t.needsYou.permissionFailed } });
          } else await route.fulfill({ json: {} });
        });
        await page.goto("/?view=pipeline");
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        const trigger = page.locator("#needs-you-trigger");
        await expect(
          page.getByRole("button", { name: t.needsYou.pendingPermissions }),
        ).toBeVisible();
        await expect(page).toHaveTitle(new RegExp(t.needsYou.pendingPermissions));
        await expect(trigger).toHaveAccessibleName(
          `${t.topBar.needsYou} 8 · ${t.warningCallout.title(1)}`,
        );
        await trigger.focus();
        await page.keyboard.press("Enter");
        const sheet = page.locator(".needs-you-queue");
        const close = sheet.getByRole("button", { name: t.needsYou.close });
        await expect(close).toBeFocused();
        const content = sheet.locator(".needs-you-content");
        const warnings = sheet.getByRole("region", { name: t.topBar.projectWarnings });
        await expect(warnings).toBeAttached();
        await expect(warnings.getByText(longPath, { exact: true })).toBeAttached();
        const first = sheet.getByRole("article").first();
        await expect(first.getByRole("status")).toHaveText(t.needsYou.reconnectingPermission);
        await expect(
          first.getByRole("button", { name: new RegExp(`^${t.needsYou.allowOnce}`) }),
        ).toBeDisabled();
        await expect(
          first.getByRole("button", { name: new RegExp(`^${t.needsYou.deny}`) }),
        ).toBeDisabled();
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-reconnecting");
        restored.binding = "live";
        restored.attemptId = "new-attempt";
        await publish();
        await expect(first.getByRole("status")).toHaveText(t.needsYou.waitingPermission);
        await expect(sheet.getByRole("article")).toHaveCount(8);
        await first.getByText(t.needsYou.fullPermissionJson, { exact: true }).click();
        for (const code of await first.locator(".permission-details").all()) {
          await code.scrollIntoViewIfNeeded();
          expect(await code.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe(
            "pre",
          );
          expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
            true,
          );
          await code.focus();
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => code.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
        }
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-long");
        const answer = first.getByRole("button", { name: new RegExp(`^${t.needsYou.allowOnce}`) });
        await answer.focus();
        await page.keyboard.press("Enter");
        await expect(answer).toBeDisabled();
        await expect(
          first.getByRole("button", { name: new RegExp(`^${t.needsYou.deny}`) }),
        ).toBeDisabled();
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-answer-pending");
        releaseAnswer();
        await expect(sheet.locator('.needs-you-footer [role="alert"]')).toContainText(
          t.needsYou.permissionFailed,
        );
        await expect(answer).toBeEnabled();
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-error");
        await answer.click();
        await expect(first.getByText(t.needsYou.answerSent, { exact: true })).toBeVisible();
        await scrollContent(content);
        await expect(close).toBeInViewport();
        await expect(
          sheet.getByRole("button", { name: t.needsYou.enableNotifications }),
        ).toBeInViewport();
        await expect(warnings).toBeInViewport();
        await expect(sheet.getByText(t.needsYou.empty, { exact: true })).toHaveCount(0);
        const warningPath = warnings.locator("code[data-truncate]");
        await expect(warningPath).toHaveAttribute("title", longPath);
        expect(await warningPath.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe(
          "nowrap",
        );
        const warningDetails = warnings.locator("details");
        await expect(warningDetails.locator("li")).not.toBeVisible();
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-long-scrolled");
        await warningDetails.locator("summary").focus();
        await page.keyboard.press("Enter");
        await expect(warningDetails).toHaveAttribute("open", "");
        await expect(warningDetails.locator("li")).toContainText(snapshot.warnings[0].message);
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-warnings-expanded");
        await page.keyboard.press("Enter");
        await expect(warningDetails.locator("li")).not.toBeVisible();
        const openItem = first.getByRole("button", {
          name: `${item.title} · ${item.slug}`,
          exact: true,
        });
        await openItem.focus();
        await page.keyboard.press("Enter");
        await expect(sheet).not.toBeVisible();
        const drawer = page.locator(".work-item-drawer");
        const drawerClose = drawer.getByRole("button", { name: t.stints.closeWorkItem });
        await expect(
          drawer.getByRole("button", { name: t.needsYou.pendingPermissions }),
        ).toBeVisible();
        await expect(drawerClose).toBeFocused();
        await captureSheet(page, testInfo, ".work-item-drawer", "needs-you-navigation-drawer");
        await drawerClose.click();
        await expect(page.locator('.board-scroll [data-work-item="long-title"]')).toBeFocused();

        const projectWarnings = snapshot.warnings;
        snapshot.warnings = [];
        await page.reload();
        await expect(trigger).toHaveAccessibleName(`${t.topBar.needsYou} 8`);
        await trigger.click();
        await expect(sheet).toHaveAttribute("data-state", "open");
        await expect(warnings).toHaveCount(0);
        await expect(sheet.getByRole("article")).toHaveCount(8);
        await expect(sheet.getByText(t.needsYou.empty, { exact: true })).toHaveCount(0);
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-items-only");
        await page.keyboard.press("Escape");
        await expect(sheet).not.toBeVisible();
        snapshot.warnings = projectWarnings;
        snapshot.attentionItems = [];
        await page.reload();
        await expect(trigger).toHaveAccessibleName(
          `${t.topBar.needsYou} 0 · ${t.warningCallout.title(1)}`,
        );
        await trigger.click();
        await expect(sheet).toHaveAttribute("data-state", "open");
        await expect(warnings).toBeVisible();
        await expect(sheet.getByText(t.needsYou.empty, { exact: true })).toBeVisible();
        expect(await warnings.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe(
          "0px",
        );
        await expect(warningDetails.locator("li")).not.toBeVisible();
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-warnings-only");
        await warningDetails.locator("summary").focus();
        await page.keyboard.press("Enter");
        await expect(warningDetails).toHaveAttribute("open", "");
        await expect(warningDetails.locator("li")).toContainText(snapshot.warnings[0].message);
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-warnings-only-expanded");
        await page.keyboard.press("Escape");
        await expect(sheet).not.toBeVisible();
        snapshot.warnings = [];
        await page.reload();
        await trigger.click();
        await expect(sheet).toHaveAttribute("data-state", "open");
        await expect(warnings).toHaveCount(0);
        await expect(sheet.getByText(t.needsYou.empty, { exact: true })).toBeVisible();
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-empty");
        await sheet.getByRole("heading").click();
        await page.keyboard.press("Escape");
        await expect(sheet).not.toBeVisible();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await expect(close).toBeFocused();
        await page
          .locator('.bg-backdrop[data-state="open"]')
          .last()
          .click({
            position: { x: 4, y: 450 },
          });
        await expect(sheet).not.toBeVisible();
        await expect(trigger).toBeFocused();
      });
    }
  }
}
