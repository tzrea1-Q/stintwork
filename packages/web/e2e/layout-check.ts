// SPDX-License-Identifier: Apache-2.0
import { deepStrictEqual } from "node:assert";
import type { Page } from "@playwright/test";

export function collectLayoutIssues({ region = "body", checkDocument = true } = {}): string[] {
  const issues: string[] = [];
  const documentRoot = document.documentElement;
  if (checkDocument && documentRoot.scrollWidth > documentRoot.clientWidth) {
    issues.push(
      `Document horizontal overflow: ${documentRoot.scrollWidth} > ${documentRoot.clientWidth}`,
    );
  }
  const root = document.querySelector(region);
  if (!root) issues.push(`Missing layout region: ${region}`);
  for (const overlay of document.querySelectorAll<HTMLElement>(
    '[data-radix-popper-content-wrapper], [role="dialog"], [role="menu"]',
  )) {
    const bounds = overlay.getBoundingClientRect();
    const style = getComputedStyle(overlay);
    if (
      !bounds.width ||
      !bounds.height ||
      style.visibility === "hidden" ||
      style.display === "none"
    )
      continue;
    if (
      bounds.left < 16 ||
      bounds.top < 16 ||
      bounds.right > window.innerWidth - 16 ||
      bounds.bottom > window.innerHeight - 16
    ) {
      issues.push(`Overlay outside 16px viewport gutter: ${overlay.textContent?.trim()}`);
    }
  }
  for (const element of root
    ? [root as HTMLElement, ...root.querySelectorAll<HTMLElement>("*")]
    : []) {
    const text = element.textContent?.replace(/\s+/g, " ").trim();
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (
      !text ||
      !bounds.width ||
      !bounds.height ||
      style.visibility === "hidden" ||
      style.display === "none" ||
      element.closest(".sr-only")
    )
      continue;
    const marked = element.closest<HTMLElement>("[data-truncate]");
    const fullText = marked?.textContent?.replace(/\s+/g, " ").trim();
    const deliberate = !!marked && marked.title.replace(/\s+/g, " ").trim() === fullText;
    if (element.hasAttribute("data-truncate") && !deliberate)
      issues.push(`Truncation marker missing full title: ${text}`);
    const clips = (overflow: string) => overflow === "hidden" || overflow === "clip";
    if (
      !deliberate &&
      ((clips(style.overflowX || style.overflow) && element.scrollWidth > element.clientWidth) ||
        (clips(style.overflowY || style.overflow) && element.scrollHeight > element.clientHeight))
    ) {
      issues.push(`Clipped text without full-text truncation marker: ${text}`);
    }
  }
  return issues;
}

export async function assertLayout(
  page: Page,
  options?: Parameters<typeof collectLayoutIssues>[0],
) {
  deepStrictEqual(await page.evaluate(collectLayoutIssues, options), []);
}
