// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import { assertLayout } from "./layout-check";

const projectName = "Stintwork 项目 — a deliberately long developer-authored project name "
  .repeat(4)
  .trim();
const branchName = `feature/${"very-long-branch-中文/".repeat(12)}top-bar`;
const milestoneName = "UI foundations 里程碑 — long names remain available in either language "
  .repeat(4)
  .trim();
const warningPath = `.scratch/${"long-warning-path-中文/".repeat(8)}spec.md`;
const warningFirstLine =
  "Developer-authored warning 原文 with enough detail to wrap without clipping. ".repeat(8).trim();
const warningMessage = `${warningFirstLine}\nAdditional warning details 原文 remain available behind the disclosure.`;
const existingInstructions = Array.from(
  { length: 20 },
  (_, index) => `Existing instruction 原文 ${index + 1}\n`,
).join("");
const guide = {
  tracker: "local-markdown",
  checks: [
    { id: "tracker", ready: true, status: "ready" },
    { id: "agents", ready: false, status: "needs-change" },
    { id: "localRunData", ready: true, status: "ready" },
    { id: "roadmap", ready: false, status: "optional" },
    { id: "glossary", ready: false, status: "optional" },
    { id: "adrs", ready: true, status: "ready" },
  ],
  changes: [
    {
      path: "AGENTS.md",
      checkId: "agents",
      removedLines: 0,
      selectedByDefault: true,
      before: `# Existing developer instructions\n${existingInstructions}`,
      content: `# Existing developer instructions\n${existingInstructions}${"A long proposed instruction 中文 ".repeat(150)}\n${"Another instruction 原文\n".repeat(40)}`,
    },
    {
      path: ".stintwork/roadmap.md",
      reasonId: "roadmap",
      removedLines: 0,
      selectedByDefault: true,
      before: null,
      content: "# Proposed roadmap\n",
    },
  ],
  warnings: [
    { path: warningPath, message: warningMessage },
    { path: "docs/中文.md", message: "Additional setup warning 原文\nKeep this detail intact." },
  ],
  skills: [
    {
      agent: "codex",
      displayName: "Codex",
      skills: [
        {
          workflowId: "feature",
          stageId: "spec",
          workflow: "Feature",
          stage: "Spec",
          skill: "/to-spec",
          status: "missing",
        },
      ],
    },
  ],
};

for (const language of ["en", "zh-CN"] as const) {
  for (const width of [1440, 1330, 1024, 860, 768, 390, 360]) {
    for (const colorScheme of width === 1440 || width === 390 || width === 360
      ? (["light", "dark"] as const)
      : (["light"] as const)) {
      test(`top bar ${width}px ${language} ${colorScheme}`, async ({ page }, testInfo) => {
        const t = language === "en" ? en : zhCN;
        let setupState: "populated" | "loading" | "error" | "empty" | "manual" = "populated";
        let emptyWarnings = false;
        let applied: unknown;
        let applyAttempts = 0;
        let releaseApply = () => {};
        const applying = new Promise<void>((resolve) => {
          releaseApply = resolve;
        });
        let releaseLoading = () => {};
        const loading = new Promise<void>((resolve) => {
          releaseLoading = resolve;
        });
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript(
          (choice) => localStorage.setItem("stintwork.language", choice),
          language,
        );
        await page.routeWebSocket("**/api/live", () => {});
        await page.route("**/api/project", async (route) => {
          const response = await route.fetch();
          const snapshot = await response.json();
          await route.fulfill({
            response,
            json: {
              ...snapshot,
              name: projectName,
              branch: branchName,
              attentionItems: [],
              setup: {
                ...snapshot.setup,
                hasIssueTracker: true,
                usesLocalMarkdown: true,
                hasAgents: false,
                hasClaude: false,
                hasGlossary: false,
                hasAdrs: true,
              },
              milestones: [
                {
                  id: "long",
                  name: milestoneName,
                  status: "active",
                  workItemSlugs: snapshot.workItems.map((item: { slug: string }) => item.slug),
                },
              ],
              warnings: emptyWarnings
                ? []
                : Array.from({ length: 12 }, (_, index) => ({
                    path: `${warningPath}:${index + 1}`,
                    message: warningMessage,
                  })),
            },
          });
        });
        await page.route("**/api/setup", async (route) => {
          if (route.request().method() === "POST") {
            applied = route.request().postDataJSON();
            applyAttempts++;
            if (applyAttempts === 1) {
              await applying;
              await route.fulfill({
                status: 409,
                json: { reason: en.planning.setup.errors.apply },
              });
            } else await route.fulfill({ json: { ...guide, changes: [], commit: "a".repeat(40) } });
          } else {
            const state = setupState;
            if (state === "loading") await loading;
            if (state === "error")
              await route.fulfill({ status: 500, json: { reason: en.planning.setup.errors.load } });
            else
              await route.fulfill({
                json:
                  state === "empty" || state === "manual"
                    ? {
                        ...guide,
                        checks:
                          state === "empty"
                            ? guide.checks.map((check) =>
                                check.status === "needs-change"
                                  ? { ...check, ready: true, status: "ready" }
                                  : check,
                              )
                            : guide.checks,
                        changes: [],
                        warnings: state === "empty" ? [] : guide.warnings,
                      }
                    : guide,
              });
          }
        });
        await page.goto("/");
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        const header = page.locator(".top-bar");
        await expect(header.getByText(projectName, { exact: true })).toHaveAttribute(
          "title",
          projectName,
        );
        await expect(header.getByText(branchName, { exact: true })).toHaveAttribute(
          "title",
          branchName,
        );
        const branch = header.getByText(branchName, { exact: true });
        await expect(branch).toBeVisible();
        const project = header.getByText(projectName, { exact: true });
        expect(
          await branch.evaluate((element) => element.getBoundingClientRect().width),
        ).toBeGreaterThan(0);
        expect(
          await project.evaluate((element) => element.getBoundingClientRect().width),
        ).toBeGreaterThanOrEqual(30);
        await expect(header.locator("select")).toHaveCount(0);
        await expect(header.getByRole("button")).toHaveCount(5);
        const nav = header.getByRole("navigation", { name: t.viewNavigation.label });
        await nav.getByRole("button", { name: t.viewNavigation.pipeline }).click();
        await nav.getByRole("button", { name: t.viewNavigation.overview }).click();
        await expect(nav.getByRole("button", { name: t.viewNavigation.overview })).toHaveAttribute(
          "aria-current",
          "page",
        );
        await expect(page).toHaveURL(/view=overview/);
        await assertLayout(page);
        await page.screenshot({ path: testInfo.outputPath("overview.png"), fullPage: true });
        await page.goBack();
        await expect(nav.getByRole("button", { name: t.viewNavigation.pipeline })).toHaveAttribute(
          "aria-current",
          "page",
        );
        await expect(header.getByRole("combobox")).toHaveCount(0);
        if (width >= 1024) {
          const navBounds = await nav.boundingBox();
          expect(navBounds).not.toBeNull();
          expect(
            Math.abs((navBounds?.x ?? 0) + (navBounds?.width ?? 0) / 2 - width / 2),
          ).toBeLessThanOrEqual(1);
        }
        await expect(header.locator("#needs-you-trigger")).toHaveText("");
        const projectBounds = await header.locator(".top-project").boundingBox();
        const actionBounds = await header.locator(".top-actions").boundingBox();
        if (!projectBounds || !actionBounds) throw new Error("Top-bar groups must be visible");
        expect(
          Math.abs(
            projectBounds.y + projectBounds.height / 2 - actionBounds.y - actionBounds.height / 2,
          ),
        ).toBeLessThanOrEqual(1);
        expect(actionBounds.x).toBeGreaterThanOrEqual(projectBounds.x + projectBounds.width);
        expect(
          await header
            .locator(".top-actions")
            .evaluate((element) => getComputedStyle(element).flexWrap),
        ).toBe("nowrap");
        for (const button of await header.getByRole("button").all()) {
          const bounds = await button.boundingBox();
          if (!bounds) throw new Error("Top-bar action must be visible");
          expect(
            Math.abs(bounds.y + bounds.height / 2 - actionBounds.y - actionBounds.height / 2),
          ).toBeLessThanOrEqual(1);
        }
        await expect(header.locator("#settings-trigger")).toHaveAccessibleName(t.topBar.settings);
        const capture = async (name: string, overlay?: string) => {
          await assertLayout(page, { region: ".top-bar" });
          if (overlay) {
            await expect(page.locator(overlay)).toHaveAttribute("data-state", "open");
            await assertLayout(page, { region: overlay });
          }
          await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
        };
        await capture("top-bar");
        if (width < 640) {
          const settings = header.locator("#settings-trigger");
          await settings.hover();
          const tooltip = page.getByRole("tooltip", { name: t.topBar.settings });
          await expect(tooltip).toBeVisible();
          await expect(tooltip).toHaveAttribute("data-state", "delayed-open");
          await assertLayout(page, { region: '[role="tooltip"]' });
          await capture("settings-tooltip");
          await page.mouse.move(0, 0, { steps: 10 });
          await expect(tooltip).not.toBeVisible();
        }

        // The language changes mid-test, so match the milestone picker's name in either language.
        const milestone = page.locator(".board-toolbar").getByRole("combobox", {
          name: new RegExp(`^(${en.topBar.milestone}|${zhCN.topBar.milestone})$`),
        });
        const triggerWidth = await milestone.evaluate(
          (element) => element.getBoundingClientRect().width,
        );
        await milestone.click();
        const milestoneOptions = page.getByRole("listbox");
        await expect(milestoneOptions).toHaveAttribute("data-state", "open");
        await expect
          .poll(async () =>
            Math.abs(
              (await milestoneOptions.evaluate(
                (element) => element.getBoundingClientRect().width,
              )) - Math.min(Math.max(280, triggerWidth), width - 34),
            ),
          )
          .toBeLessThanOrEqual(1);
        const milestoneOption = page.getByRole("option", { name: milestoneName, exact: true });
        await expect(milestoneOption).toBeVisible();
        const optionLabel = milestoneOption.locator("[data-truncate]");
        await expect(optionLabel).toHaveAttribute("title", milestoneName);
        expect(
          await optionLabel.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              whitespace: style.whiteSpace,
              ellipsis: style.textOverflow,
              singleLine:
                element.getBoundingClientRect().height <= Number.parseFloat(style.lineHeight) + 1,
              truncated: element.scrollWidth > element.clientWidth,
            };
          }),
        ).toEqual({
          whitespace: "nowrap",
          ellipsis: "ellipsis",
          singleLine: true,
          truncated: true,
        });
        await capture("milestone-open", '[role="listbox"]');
        await page.getByRole("option", { name: milestoneName, exact: true }).click();
        await expect(milestone).toBeFocused();
        await expect(milestone.locator("[data-truncate]")).toHaveAttribute("title", milestoneName);
        const boardMilestone = page.locator(".board-milestone-label [data-truncate]");
        await expect(boardMilestone).toHaveAttribute("title", milestoneName);
        await expect(boardMilestone).toHaveText(milestoneName);
        expect(
          await boardMilestone.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              whitespace: style.whiteSpace,
              ellipsis: style.textOverflow,
              height: element.getBoundingClientRect().height,
              lineHeight: Number.parseFloat(style.lineHeight),
            };
          }),
        ).toMatchObject({ whitespace: "nowrap", ellipsis: "ellipsis" });
        if (width <= 390)
          expect(
            await boardMilestone.evaluate((element) => element.scrollWidth > element.clientWidth),
          ).toBe(true);
        await assertLayout(page, { region: ".pipeline-main" });
        await capture("board-long-milestone");

        const languageTrigger = header.locator('button[aria-haspopup="menu"]');
        await languageTrigger.click();
        const current = page.getByRole("menuitemradio", { name: t.topBar.languages[language] });
        await expect(current).toBeFocused();
        await expect(current).toHaveAttribute("aria-checked", "true");
        await capture("language-open", '[role="menu"]');
        const other = language === "en" ? "zh-CN" : "en";
        await page.keyboard.press(language === "en" ? "ArrowDown" : "ArrowUp");
        await expect(
          page.getByRole("menuitemradio", { name: t.topBar.languages[other] }),
        ).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("html")).toHaveAttribute("lang", other);
        await expect(languageTrigger).toBeFocused();
        await expect(milestone).toContainText(milestoneName);
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

        const warningsTrigger = header.locator("#needs-you-trigger");
        await expect(warningsTrigger).toHaveAccessibleName(
          `${t.topBar.needsYou} 0 · ${t.warningCallout.title(12)}`,
        );
        await expect(warningsTrigger.locator("[data-warning-dot]")).toBeVisible();
        await warningsTrigger.click();
        const warnings = page.locator(".needs-you-queue");
        await expect(warnings).toHaveAttribute("data-state", "open");
        const projectWarnings = warnings.getByRole("region", { name: t.topBar.projectWarnings });
        await expect(projectWarnings).toBeVisible();
        await expect(warnings.getByText(t.needsYou.empty, { exact: true })).toBeVisible();
        expect(
          await projectWarnings.evaluate((element) => getComputedStyle(element).borderTopWidth),
        ).toBe("0px");
        await expect(projectWarnings.getByText(warningFirstLine, { exact: true })).toHaveCount(12);
        const warningPreview = projectWarnings.getByText(warningFirstLine, { exact: true }).first();
        await expect(warningPreview).toHaveAttribute("title", warningFirstLine);
        expect(
          await warningPreview.evaluate((element) => getComputedStyle(element).whiteSpace),
        ).toBe("nowrap");
        for (const path of await projectWarnings.locator("code[data-truncate]").all()) {
          await expect(path).toHaveAttribute("title", await path.innerText());
          expect(await path.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
            true,
          );
          expect(await path.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe(
            "nowrap",
          );
        }
        const warningDetails = projectWarnings.locator("details");
        await expect(warningDetails.locator("li").first()).not.toBeVisible();
        await capture("warnings-open", '[role="dialog"]');
        await warningDetails.locator("summary").focus();
        await page.keyboard.press("Enter");
        await expect(warningDetails).toHaveAttribute("open", "");
        await expect(warningDetails.locator("li")).toHaveCount(12);
        await expect(warningDetails.locator("li").first()).toContainText(warningMessage);
        await capture("warnings-expanded", '[role="dialog"]');
        const warningContent = warnings.locator(".needs-you-content");
        await warningContent.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        expect(await warningContent.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        await expect(warnings.getByText(t.topBar.readOnly, { exact: true })).toBeInViewport();
        await capture("warnings-scrolled", '[role="dialog"]');
        await page.keyboard.press("Escape");
        await expect(warningsTrigger).toBeFocused();

        const setupTrigger = header.locator("#settings-trigger");
        await expect(setupTrigger).toHaveAccessibleDescription(t.topBar.setupIncomplete);
        const openSetup = async () => {
          await setupTrigger.click();
          await expect(page.getByRole("menu")).toHaveAttribute("data-state", "open");
          const item = page.getByRole("menuitem", { name: `${t.topBar.projectSetup} 3/5` });
          await expect(item).toBeVisible();
          await item.click();
          await expect(page.locator(".setup-guide")).toHaveAttribute("data-state", "open");
          await expect(page.getByRole("menu")).toHaveCount(0);
        };
        await openSetup();
        const setup = page.getByRole("dialog", { name: t.planning.setup.title });
        await expect(setup).toBeVisible();
        await expect(
          setup.getByRole("checkbox", {
            name: "AGENTS.md",
            exact: true,
          }),
        ).toBeChecked();
        await expect(setup).toHaveAccessibleDescription(t.planning.setup.description);
        const setupBody = setup.locator(".setup-body");
        const checks = setup.getByRole("group", { name: t.planning.setup.projectChecks });
        await expect(checks).toBeVisible();
        const bodyBounds = await setupBody.boundingBox();
        const checksBounds = await checks.boundingBox();
        expect(bodyBounds).not.toBeNull();
        expect(checksBounds).not.toBeNull();
        expect((checksBounds?.y ?? 0) - (bodyBounds?.y ?? 0)).toBeLessThan(
          (bodyBounds?.height ?? 0) * 0.4,
        );
        await expect(
          checks.getByText(t.planning.setup.checks.agents.name, { exact: true }),
        ).toBeVisible();
        const setupWarnings = setup.getByRole("alert", { name: t.warningCallout.title(2) });
        await expect(setupWarnings.getByText(warningFirstLine, { exact: true })).toBeVisible();
        await expect(setupWarnings.getByText("docs/中文.md:", { exact: false })).not.toBeVisible();
        const footer = setup.locator("footer");
        const expectFooter = async () => {
          await expect(footer).toBeInViewport({ ratio: 1 });
          for (const button of await footer.getByRole("button").all())
            await expect(button).toBeInViewport({ ratio: 1 });
        };
        await expectFooter();
        await capture("setup-open", '[role="dialog"]');
        await setupWarnings.getByText(t.warningCallout.details, { exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect(setupWarnings.getByText("docs/中文.md:", { exact: false })).toBeVisible();
        await capture("setup-warnings-expanded", '[role="dialog"]');
        await page.keyboard.press("Enter");
        await expect(setupWarnings.getByText("docs/中文.md:", { exact: false })).not.toBeVisible();
        await expect(setup.getByText(t.planning.setup.skillExplanation)).toBeVisible();
        await expect(
          setup.getByText(t.planning.setup.checks.tracker.name, { exact: true }),
        ).toBeVisible();
        const skills = setup.getByText(t.planning.setup.skillSummary("Codex", 0, 1, 0), {
          exact: true,
        });
        await skills.focus();
        await page.keyboard.press("Enter");
        await expect(setup.getByText("/to-spec", { exact: true })).toBeVisible();
        await capture("setup-skills-expanded", '[role="dialog"]');
        await page.keyboard.press("Enter");
        await expect(setup.getByText("/to-spec", { exact: true })).not.toBeVisible();
        const agentsChange = setup.getByRole("region", {
          name: t.planning.setup.changeLabel("AGENTS.md"),
          exact: true,
        });
        await agentsChange.getByText(t.planning.setup.previewDiff, { exact: true }).click();
        const proposedCode = setup
          .getByRole("region", { name: t.planning.setup.changeLabel("AGENTS.md"), exact: true })
          .getByRole("region", { name: t.codeBlock, exact: true })
          .last();
        await expect(proposedCode).toBeVisible();
        await expect(proposedCode.locator('[data-diff-kind="added"]')).toHaveCount(41);
        await expect(proposedCode.locator('[data-diff-kind="added"]').first()).toHaveText(
          `+${"A long proposed instruction 中文 ".repeat(150)}`,
        );
        await expect(proposedCode.locator('[data-diff-kind="context"]')).toHaveCount(3);
        await expect(proposedCode).not.toContainText("# Existing developer instructions");
        await expect(proposedCode).toContainText("@@ -19,3 +19,44 @@");
        const previewText = await proposedCode.textContent();
        expect(
          await proposedCode.evaluate((element) => element.scrollWidth > element.clientWidth),
        ).toBe(true);
        await proposedCode.focus();
        await page.keyboard.press("ArrowRight");
        await expect
          .poll(() => proposedCode.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
        await capture("setup-preview-open", '[role="dialog"]');
        const footerPosition = await footer.boundingBox();
        await setupBody.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        expect(await setupBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        await expectFooter();
        expect((await footer.boundingBox())?.y).toBe(footerPosition?.y);
        await capture("setup-scrolled", '[role="dialog"]');
        await setup
          .getByRole("checkbox", {
            name: ".stintwork/roadmap.md",
            exact: true,
          })
          .uncheck();
        await setup.getByRole("button", { name: t.planning.setup.review(1), exact: true }).click();
        await expect(setup.getByRole("region", { name: t.planning.setup.confirm })).toBeVisible();
        await expect(setup.getByRole("region", { name: t.planning.setup.confirm })).toBeFocused();
        const reviewCode = setup.getByRole("region", { name: t.codeBlock, exact: true });
        await expect(reviewCode).toHaveText(previewText ?? "");
        await expect(reviewCode.locator('[data-diff-kind="added"]')).toHaveCount(41);
        await expect(setup.getByText(".stintwork/roadmap.md", { exact: true })).toHaveCount(0);
        await expectFooter();
        await capture("setup-confirmation", '[role="dialog"]');
        await setup.getByRole("button", { name: t.planning.setup.back, exact: true }).click();
        await expect(setup.getByRole("checkbox", { name: "AGENTS.md", exact: true })).toBeChecked();
        await setup.getByRole("button", { name: t.planning.setup.review(1), exact: true }).click();
        await setup.getByRole("button", { name: t.planning.setup.apply, exact: true }).click();
        await expect(
          setup.getByRole("button", { name: t.planning.setup.saving, exact: true }),
        ).toBeDisabled();
        await page.keyboard.press("Escape");
        await page.mouse.click(4, 4);
        await expect(setup).toBeVisible();
        await expectFooter();
        await expect(
          setup.getByRole("button", { name: t.planning.setup.back, exact: true }),
        ).toBeDisabled();
        await capture("setup-applying", '[role="dialog"]');
        releaseApply();
        await expect(
          setup.getByRole("alert").filter({ hasText: t.planning.setup.errors.apply }),
        ).toBeVisible();
        await expect(
          setup.getByRole("button", { name: t.planning.setup.apply, exact: true }),
        ).toBeEnabled();
        await capture("setup-apply-error", '[role="dialog"]');
        await setup.getByRole("button", { name: t.planning.setup.apply, exact: true }).click();
        await expect(setup.getByRole("status")).toHaveText(t.planning.setup.committed("aaaaaaa"));
        await expect(
          setup.getByRole("button", { name: t.planning.setup.close, exact: true }),
        ).toBeFocused();
        expect(applyAttempts).toBe(2);
        expect(applied).toEqual({ confirmed: true, changes: [guide.changes[0]] });
        await capture("setup-applied", '[role="dialog"]');
        await expectFooter();
        await setup.getByRole("button", { name: t.planning.setup.close, exact: true }).click();
        await expect(setup).not.toBeVisible();
        await expect(setupTrigger).toBeFocused();

        for (const state of ["loading", "error", "empty", "manual"] as const) {
          setupState = state;
          await openSetup();
          await expect(setup).toBeVisible();
          if (state === "loading")
            await expect(setup.getByRole("status")).toHaveText(t.planning.setup.loading);
          else if (state === "error")
            await expect(setup.getByRole("alert")).toHaveText(t.planning.setup.errors.load);
          else {
            const checks = setup.getByRole("group", { name: t.planning.setup.projectChecks });
            const complete = setup.getByText(t.planning.setup.noChanges, { exact: true });
            await expect(
              setup.getByText(t.planning.setup.skillSummary("Codex", 0, 1, 0), { exact: true }),
            ).toBeVisible();
            await expect(setup.getByRole("checkbox")).toHaveCount(0);
            if (state === "empty") {
              await expect(complete).toBeVisible();
              await expect(checks).toHaveCount(0);
              await expect(
                setup.getByRole("button", { name: t.planning.setup.close, exact: true }),
              ).toBeEnabled();
            } else {
              await expect(complete).toHaveCount(0);
              await expect(checks).toBeVisible();
              await expect(
                checks.getByText(t.planning.setup.noAutomaticFix, { exact: true }),
              ).toBeVisible();
              await expect(
                setup.getByRole("button", { name: t.planning.setup.review(0), exact: true }),
              ).toBeDisabled();
            }
          }
          await capture(`setup-${state}`, '[role="dialog"]');
          await expectFooter();
          if (state === "error") {
            setupState = "populated";
            await setup.getByRole("button", { name: t.planning.setup.retry, exact: true }).click();
            await expect(
              setup.getByRole("checkbox", { name: "AGENTS.md", exact: true }),
            ).toBeChecked();
            await capture("setup-load-retried", '[role="dialog"]');
          }
          if (state === "loading") {
            releaseLoading();
            await expect(
              setup.getByRole("checkbox", {
                name: "AGENTS.md",
                exact: true,
              }),
            ).toBeChecked();
          }
          await page.keyboard.press("Escape");
          await expect(setup).not.toBeVisible();
          await expect(setupTrigger).toBeFocused();
        }
        setupState = "populated";
        await openSetup();
        await expect(setup.getByRole("checkbox", { name: "AGENTS.md", exact: true })).toBeChecked();
        await setup.getByRole("checkbox", { name: "AGENTS.md", exact: true }).uncheck();
        await page.mouse.click(4, 4);
        await expect(setup).not.toBeVisible();
        await expect(setupTrigger).toBeFocused();
        emptyWarnings = true;
        await page.reload();
        await page.locator("#needs-you-trigger").click();
        await expect(warnings).toHaveAttribute("data-state", "open");
        await expect(warnings.getByText(t.needsYou.empty, { exact: true })).toBeVisible();
        await expect(warnings.getByRole("region", { name: t.topBar.projectWarnings })).toHaveCount(
          0,
        );
        await capture("warnings-empty", '[role="dialog"]');
        await page.mouse.click(4, 4);
        await expect(warnings).not.toBeVisible();
      });
    }
  }
}

for (const language of ["en", "zh-CN"] as const) {
  for (const width of [1440, 1024, 768, 390]) {
    for (const colorScheme of width === 1440 || width === 390
      ? (["light", "dark"] as const)
      : (["light"] as const)) {
      test(`GitHub Project setup ${width}px ${language} ${colorScheme}`, async ({
        page,
      }, testInfo) => {
        const t = language === "en" ? en : zhCN;
        const port = Number(process.env.PLAYWRIGHT_PORT ?? 4178) + 1;
        const url = `http://127.0.0.1:${port}`;
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        await page.addInitScript(
          (choice) => localStorage.setItem("stintwork.language", choice),
          language,
        );
        const response = await page.request.get(`${url}/api/setup`);
        expect(response.ok()).toBe(true);
        const plan = await response.json();
        expect(plan.tracker).toBe("github-issues");
        await page.goto(url);
        const settings = page.getByRole("button", { name: t.topBar.settings });
        await settings.click();
        await expect(page.getByRole("menu")).toHaveAttribute("data-state", "open");
        await page.getByRole("menuitem", { name: new RegExp(t.topBar.projectSetup) }).click();
        const dialog = page.getByRole("dialog", { name: t.planning.setup.title });
        await expect(dialog).toHaveAttribute("data-state", "open");
        await expect(dialog).toHaveAccessibleDescription(t.planning.setup.githubNotice);
        await expect(
          dialog.getByText(t.planning.setup.githubTracker, { exact: true }),
        ).toBeVisible();
        for (const change of plan.changes.filter(
          (change: { removedLines: number }) => change.removedLines > 0,
        )) {
          const region = dialog.getByRole("region", {
            name: t.planning.setup.changeLabel(change.path),
            exact: true,
          });
          await expect(region.getByRole("checkbox")).not.toBeChecked();
          await expect(
            region.getByText(t.planning.setup.replacesLines(change.removedLines)),
          ).toBeVisible();
        }
        await expect(dialog.getByRole("checkbox", { name: "CLAUDE.md", exact: true })).toHaveCount(
          0,
        );
        await assertLayout(page, { region: '[role="dialog"]' });
        await page.screenshot({ path: testInfo.outputPath("github-setup.png"), fullPage: true });
        const replacement = dialog.getByRole("checkbox", {
          name: new RegExp(t.planning.setup.switchTracker),
        });
        await replacement.check();
        await expect(
          dialog.getByRole("checkbox", { name: "CLAUDE.md", exact: true }),
        ).not.toBeChecked();
        const selected = await dialog
          .getByRole("checkbox")
          .evaluateAll(
            (inputs) => inputs.filter((input) => (input as HTMLInputElement).checked).length,
          );
        await dialog
          .getByRole("button", { name: t.planning.setup.review(selected), exact: true })
          .click();
        const review = dialog.getByRole("region", { name: t.planning.setup.confirm });
        await expect(review).toBeFocused();
        const destructive = review.getByRole("region", { name: t.planning.setup.removesContent });
        await expect(destructive).toBeVisible();
        await expect(destructive.locator("details")).toHaveAttribute("open", "");
        await expect(destructive.locator('[data-diff-kind="removed"]').first()).toBeVisible();
        await assertLayout(page, { region: '[role="dialog"]' });
        await page.screenshot({
          path: testInfo.outputPath("github-setup-review.png"),
          fullPage: true,
        });
        await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible();
        await expect(settings).toBeFocused();
      });
    }
  }
}
