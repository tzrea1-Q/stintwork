// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "@playwright/test";
import { assertLayout, collectLayoutIssues } from "./layout-check";

test("layout helper rejects page overflow and all four overlay edges", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.setContent('<div style="width: 600px">Overflow</div>');
  expect(await page.evaluate(collectLayoutIssues, {})).toContain(
    "Document horizontal overflow: 608 > 390",
  );
  for (const role of ["dialog", "menu"]) {
    for (const position of [
      "left:15px;top:16px",
      "left:16px;top:15px",
      "right:15px;top:16px",
      "left:16px;bottom:15px",
    ]) {
      await page.setContent(
        `<div role="${role}" style="position:fixed;width:100px;height:100px;${position}">Overlay</div>`,
      );
      expect(await page.evaluate(collectLayoutIssues, {})).toContain(
        "Overlay outside 16px viewport gutter: Overlay",
      );
    }
  }
  await page.setContent(
    '<div data-radix-popper-content-wrapper style="position:fixed;left:16px;top:16px;width:100px;height:100px">Overlay</div><div role="dialog" style="display:none">Closed</div>',
  );
  await assertLayout(page);
});

test("layout helper rejects clipped text and incomplete markers but allows local code scrolling", async ({
  page,
}) => {
  await page.setContent(
    '<p style="width:40px;overflow:hidden;white-space:nowrap">完整标题 Full title</p>',
  );
  expect(await page.evaluate(collectLayoutIssues, {})).toContain(
    "Clipped text without full-text truncation marker: 完整标题 Full title",
  );
  await page.locator("p").evaluate((element) => {
    element.setAttribute("data-truncate", "");
    element.setAttribute("title", "Partial");
  });
  expect(await page.evaluate(collectLayoutIssues, {})).toContain(
    "Truncation marker missing full title: 完整标题 Full title",
  );
  await page
    .locator("p")
    .evaluate((element) => element.setAttribute("title", "完整标题 Full title"));
  await assertLayout(page);
  await page.setContent(
    `<pre style="width:100px;overflow:auto">${"long-code-line".repeat(30)}</pre>`,
  );
  await assertLayout(page);
  await page.locator("pre").evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  expect(await page.locator("pre").evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await assertLayout(page);
});
