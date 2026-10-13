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
  await page.routeWebSocket("**/api/live", (socket) => socket.send(JSON.stringify(snapshot)));
  return { snapshot, item };
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
        await page.goto("/");
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
        const languageTrigger = sheet.locator('.drawer-header button[aria-haspopup="menu"]');
        await languageTrigger.click();
        await expect(
          page.getByRole("menuitemradio", { name: t.topBar.languages[language] }),
        ).toBeFocused();
        await captureSheet(page, testInfo, '[role="menu"]', "drawer-language-open");
        const other = language === "en" ? "zh-CN" : "en";
        await page.keyboard.press(language === "en" ? "ArrowDown" : "ArrowUp");
        await expect(
          page.getByRole("menuitemradio", { name: t.topBar.languages[other] }),
        ).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("html")).toHaveAttribute("lang", other);
        await expect(languageTrigger).toBeFocused();
        await expect(sheet.locator(".drawer-ticket")).toHaveAttribute("open", "");
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

      test(`Needs you ${width}px ${language} ${colorScheme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        const { snapshot, item } = await openFixture(page, language);
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
        let releaseAnswer = () => {};
        const answerReady = new Promise<void>((resolve) => {
          releaseAnswer = resolve;
        });
        let attempts = 0;
        await page.route("**/api/stints/fixture-stint/permissions/request-0", async (route) => {
          expect(route.request().postDataJSON()).toEqual({ optionId: "allow_once" });
          attempts++;
          if (attempts === 1) {
            await answerReady;
            await route.fulfill({ status: 503, json: { reason: t.needsYou.permissionFailed } });
          } else await route.fulfill({ json: {} });
        });
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        const trigger = page.locator("#needs-you-trigger");
        await trigger.focus();
        await page.keyboard.press("Enter");
        const sheet = page.locator(".needs-you-queue");
        const close = sheet.getByRole("button", { name: t.needsYou.close });
        await expect(close).toBeFocused();
        const content = sheet.locator(".needs-you-content");
        const first = sheet.getByRole("article").first();
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
        await expect(sheet.getByRole("alert")).toContainText(t.needsYou.permissionFailed);
        await expect(answer).toBeEnabled();
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-error");
        await answer.click();
        await expect(first.getByText(t.needsYou.answerSent, { exact: true })).toBeVisible();
        await scrollContent(content);
        await expect(close).toBeInViewport();
        await expect(
          sheet.getByRole("button", { name: t.needsYou.enableNotifications }),
        ).toBeInViewport();
        await captureSheet(page, testInfo, ".needs-you-queue", "needs-you-long-scrolled");
        const openItem = first.getByRole("button", {
          name: `${item.title} · ${item.slug}`,
          exact: true,
        });
        await openItem.focus();
        await page.keyboard.press("Enter");
        await expect(sheet).not.toBeVisible();
        const drawer = page.locator(".work-item-drawer");
        const drawerClose = drawer.getByRole("button", { name: t.stints.closeWorkItem });
        await expect(drawerClose).toBeFocused();
        await captureSheet(page, testInfo, ".work-item-drawer", "needs-you-navigation-drawer");
        await drawerClose.click();
        await expect(page.locator('.board-scroll [data-work-item="long-title"]')).toBeFocused();

        snapshot.attentionItems = [];
        await page.reload();
        await trigger.click();
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
