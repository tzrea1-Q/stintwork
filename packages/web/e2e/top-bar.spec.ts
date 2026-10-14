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
const warningMessage =
  "Developer-authored warning 原文 with enough detail to wrap without clipping. ".repeat(8).trim();
const existingInstructions = Array.from(
  { length: 20 },
  (_, index) => `Existing instruction 原文 ${index + 1}\n`,
).join("");
const guide = {
  checks: [
    { id: "tracker", ready: true },
    { id: "markdown", ready: true },
    { id: "agents", ready: false },
    { id: "glossary", ready: false },
    { id: "adrs", ready: true },
  ],
  changes: [
    {
      path: "AGENTS.md",
      checkId: "agents",
      before: `# Existing developer instructions\n${existingInstructions}`,
      content: `# Existing developer instructions\n${existingInstructions}${"A long proposed instruction 中文 ".repeat(150)}\n${"Another instruction 原文\n".repeat(40)}`,
    },
    {
      path: ".stintwork/roadmap.md",
      reasonId: "roadmap",
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
        let setupState: "populated" | "loading" | "error" | "empty" = "populated";
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
                  state === "empty"
                    ? { checks: guide.checks, changes: [], warnings: [], skills: [] }
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
        await expect(header.getByText(branchName, { exact: true }).locator("..")).toHaveAttribute(
          "title",
          branchName,
        );
        await expect(header.locator("select")).toHaveCount(0);
        if (width <= 768) {
          const project = await header.locator(".top-project").boundingBox();
          const actions = await header.locator(".top-actions").boundingBox();
          const utilities = await header.locator(".top-utilities").boundingBox();
          const milestone = await header.locator(".top-milestone").boundingBox();
          if (!project || !actions || !utilities || !milestone)
            throw new Error("Top-bar groups must be visible");
          expect(actions.y).toBeGreaterThanOrEqual(project.y + project.height);
          expect(utilities.y).toBeGreaterThan(actions.y);
          if (width < 768)
            expect(milestone.y).toBeGreaterThanOrEqual(utilities.y + utilities.height);
        }
        const capture = async (name: string, overlay?: string) => {
          await assertLayout(page, { region: ".top-bar" });
          if (overlay) {
            await expect(page.locator(overlay)).toHaveAttribute("data-state", "open");
            await assertLayout(page, { region: overlay });
          }
          await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
        };
        await capture("top-bar");

        const milestone = header.locator('.top-milestone [role="combobox"]');
        await milestone.click();
        await expect(page.getByRole("option", { name: milestoneName, exact: true })).toBeVisible();
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

        const warningsTrigger = header.locator("#warnings-trigger");
        await warningsTrigger.click();
        const warnings = page.getByRole("dialog", { name: t.topBar.projectWarnings });
        await expect(warnings.getByText(warningMessage, { exact: true })).toHaveCount(12);
        await capture("warnings-open", '[role="dialog"]');
        await warnings.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        expect(await warnings.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        await expect(warnings.getByText(t.topBar.readOnly, { exact: true })).toBeInViewport();
        await capture("warnings-scrolled", '[role="dialog"]');
        await page.keyboard.press("Escape");
        await expect(warningsTrigger).toBeFocused();

        const setupTrigger = header.locator("#setup-trigger");
        await setupTrigger.click();
        const setup = page.getByRole("dialog", { name: t.planning.setup.title });
        await expect(setup).toBeVisible();
        await expect(
          setup.getByRole("checkbox", {
            name: "AGENTS.md",
            exact: true,
          }),
        ).toBeChecked();
        await expect(setup).toHaveAccessibleDescription(t.planning.setup.summary(2, 2));
        const setupBody = setup.locator(".setup-body");
        const checks = setup.getByRole("list", { name: t.planning.setup.projectChecks });
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
        ).toBeInViewport({ ratio: 1 });
        const setupWarnings = setup.getByRole("alert", { name: t.warningCallout.title(2) });
        await expect(setupWarnings.getByText(warningMessage, { exact: true })).toBeVisible();
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
        await expect(setup.getByText(t.planning.setup.skillExplanation)).not.toBeVisible();
        await setup.getByText(t.planning.setup.readyCount(3), { exact: true }).click();
        await expect(
          setup.getByText(t.planning.setup.checks.tracker.name, { exact: true }),
        ).toBeVisible();
        await capture("setup-ready-expanded", '[role="dialog"]');
        await setup.getByText(t.planning.setup.readyCount(3), { exact: true }).click();
        const skills = setup.getByText(t.planning.setup.skills, { exact: true });
        await skills.focus();
        await page.keyboard.press("Enter");
        await expect(setup.getByText(t.planning.setup.skillExplanation)).toBeVisible();
        await capture("setup-skills-expanded", '[role="dialog"]');
        await page.keyboard.press("Enter");
        await expect(setup.getByText(t.planning.setup.skillExplanation)).not.toBeVisible();
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

        for (const state of ["loading", "error", "empty"] as const) {
          setupState = state;
          await setupTrigger.click();
          await expect(setup).toBeVisible();
          if (state === "loading")
            await expect(setup.getByRole("status")).toHaveText(t.planning.setup.loading);
          else if (state === "error")
            await expect(setup.getByRole("alert")).toHaveText(t.planning.setup.errors.load);
          else
            await expect(
              setup.getByText(t.planning.setup.noChanges, { exact: true }),
            ).toBeVisible();
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
        await setupTrigger.click();
        await expect(setup.getByRole("checkbox", { name: "AGENTS.md", exact: true })).toBeChecked();
        await setup.getByRole("checkbox", { name: "AGENTS.md", exact: true }).uncheck();
        await page.mouse.click(4, 4);
        await expect(setup).not.toBeVisible();
        await expect(setupTrigger).toBeFocused();
        emptyWarnings = true;
        await page.reload();
        await page.locator("#warnings-trigger").click();
        await expect(warnings.getByText(t.topBar.noWarnings, { exact: true })).toBeVisible();
        await capture("warnings-empty", '[role="dialog"]');
        await header.locator(".top-project").click();
        await expect(warnings).not.toBeVisible();
      });
    }
  }
}
