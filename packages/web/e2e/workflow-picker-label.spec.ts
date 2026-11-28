// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import { richSnapshot } from "./rich.fixture";

for (const language of ["en", "zh-CN"] as const) {
  const t = language === "en" ? en : zhCN;
  test(`workflow label stays single during dismissal in ${language}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(
      (choice) => localStorage.setItem("stintwork.language", choice),
      language,
    );
    const snapshot = structuredClone(richSnapshot);
    await page.route("**/api/project", (route) => route.fulfill({ json: snapshot }));
    await page.routeWebSocket("**/api/live", (socket) => socket.send(JSON.stringify(snapshot)));
    await page.goto("/?view=pipeline");
    const trigger = page.getByRole("combobox", { name: t.pipelineBoard.workflow, exact: true });
    const handle = await trigger.elementHandle();
    if (!handle) throw new Error("Missing workflow picker");
    for (const method of ["escape", "option"] as const) {
      await trigger.click();
      await expect(page.getByRole("listbox")).toBeVisible();
      await page.waitForTimeout(400);
      const samplesPromise = handle.evaluate(
        (element) =>
          new Promise<{ text: string; listboxPresent: boolean }[]>((resolve) => {
            const samples: { text: string; listboxPresent: boolean }[] = [];
            const start = performance.now();
            const sample = () => {
              samples.push({
                text: (element as HTMLElement).innerText,
                listboxPresent: !!document.querySelector('[role="listbox"]'),
              });
              if (performance.now() - start < 1000) requestAnimationFrame(sample);
              else resolve(samples);
            };
            requestAnimationFrame(sample);
          }),
      );
      await page.waitForTimeout(100);
      if (method === "escape") await page.keyboard.press("Escape");
      else
        await page.getByRole("option", { name: t.pipelineBoard.allWorkflows, exact: true }).click();
      const samples = await samplesPromise;
      expect(samples.length).toBeGreaterThan(1);
      expect(samples.filter((sample) => sample.listboxPresent).length).toBeGreaterThanOrEqual(3);
      expect(samples.every((sample) => sample.text === t.pipelineBoard.allWorkflows)).toBe(true);
    }
  });
}
