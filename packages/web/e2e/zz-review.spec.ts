// SPDX-License-Identifier: Apache-2.0
// Throwaway coordinator review probe. Delete after review.
import { type Page, test } from "@playwright/test";
import type { AttentionItem, ProjectSnapshot } from "@stintwork/core";
import { richClock, richSnapshot } from "./rich.fixture";

const out = process.env.REVIEW_OUT ?? "/tmp/review";
const snap: ProjectSnapshot = structuredClone(richSnapshot);
const [a0, a1, a2, a3] = snap.workItems;
const agent = snap.attentionItems[0]?.agent ?? "claude";
const raisedAt = "2026-11-12T09:10:00Z";
snap.attentionItems = [
  ...snap.attentionItems,
  { id: "handoff-1", kind: "handoff-unresolved", workItem: a2.slug, ticket: 2, stintId: a2.stints[0]?.id ?? "s", agent, title: "Unresolved handoff", details: "**Which export format?** The agent stopped before choosing CSV or JSON.", raisedAt },
  { id: "checkpoint-1", kind: "checkpoint-warning", workItem: a0.slug, ticket: null, stintId: a0.stints[0]?.id ?? "s", agent, title: "Checkpoint warnings", details: "The checkpoint committed files that look risky.", raisedAt, warnings: [ { path: ".env.local", reasons: ["likely-secret"], excluded: false, committed: true, commits: ["a".repeat(40), "b".repeat(40)] }, { path: "dist/bundle.js", reasons: ["large-file", "generated-directory"], excluded: true } ] },
  { id: "memory-1", kind: "memory-proposal", workItem: a1.slug, ticket: null, stintId: a1.stints[0]?.id ?? "s", agent, title: "Memory proposal: AGENTS.md", details: "Record that e2e runs need port 4500.", raisedAt, path: "AGENTS.md", diff: "@@ -1,3 +1,4 @@\n # Working\n+Use port 4500 for parallel e2e runs.\n", baseCommit: "abc1234", checkpointCommit: "def5678" },
  { id: "gate-1", kind: "gate-ready", workItem: a3.slug, ticket: null, stintId: null, agent: null, title: "Gate ready", details: "", raisedAt, stage: a3.stage },
  { id: "stale-1", kind: "approval-stale", workItem: a2.slug, ticket: null, stintId: null, agent: null, title: "Approval stale", details: "", raisedAt: "2026-11-09T09:10:00Z", stage: a2.stage },
  { id: "login-1", kind: "login-required", workItem: null, ticket: null, stintId: null, agent, title: "Login required", details: "Run the login command, then refresh availability.", raisedAt, loginCommand: "claude /login" },
] as AttentionItem[];

async function fixture(page: Page, width: number, lang: "en" | "zh-CN", dark = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
  await page.clock.setFixedTime(new Date(richClock));
  await page.addInitScript((c) => localStorage.setItem("stintwork.language", c), lang);
  await page.route("**/api/project", (r) => r.fulfill({ json: snap }));
  await page.routeWebSocket("**/api/live", (socket) => socket.send(JSON.stringify(snap)));
  await page.goto("/?view=overview");
  await page.waitForTimeout(700);
}
async function real(page: Page, width: number, lang: "en" | "zh-CN", dark = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
  await page.addInitScript((c) => localStorage.setItem("stintwork.language", c), lang);
  await page.goto("http://localhost:4317/?view=overview");
  await page.waitForTimeout(900);
}
async function shootMain(page: Page, name: string) {
  const main = page.locator("main").first();
  const h = await main.evaluate((el) => el.scrollHeight);
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 1440, height: Math.min(h + 80, 3000) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png` });
}
for (const lang of ["en", "zh-CN"] as const) {
  for (const width of [1440, 1024, 768, 390]) {
    test(`real ${lang} ${width}`, async ({ page }) => {
      await real(page, width, lang);
      await shootMain(page, `real-${lang}-${width}`);
    });
    test(`fixture ${lang} ${width}`, async ({ page }) => {
      await fixture(page, width, lang);
      await shootMain(page, `fixture-${lang}-${width}`);
    });
  }
  test(`dark ${lang}`, async ({ page }) => {
    await real(page, 1440, lang, true);
    await shootMain(page, `real-${lang}-1440-dark`);
    await fixture(page, 1440, lang, true);
    await shootMain(page, `fixture-${lang}-1440-dark`);
  });
  for (const width of [1440, 390]) {
    test(`queue ${lang} ${width}`, async ({ page }) => {
      await fixture(page, width, lang);
      await page.locator("#needs-you-trigger").click();
      await page.waitForTimeout(700);
      const content = page.locator(".needs-you-content");
      const height = await content.evaluate((el) => el.scrollHeight);
      for (let y = 0, i = 0; y < height && i < 12; y += 750, i++) {
        await content.evaluate((el, top) => el.scrollTo(0, top), y);
        await page.waitForTimeout(100);
        await page.screenshot({ path: `${out}/queue-${lang}-${width}-${i}.png` });
      }
    });
  }
  test(`empty ${lang}`, async ({ page }) => {
    await page.route("**/api/project", (r) => r.fulfill({ json: { ...snap, workItems: [], attentionItems: [] } }));
    await page.routeWebSocket("**/api/live", (s) => s.send(JSON.stringify({ ...snap, workItems: [], attentionItems: [] })));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((c) => localStorage.setItem("stintwork.language", c), lang);
    await page.goto("/?view=overview");
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/empty-${lang}.png` });
  });
  test(`offline ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((c) => localStorage.setItem("stintwork.language", c), lang);
    await page.route("**/api/project", (r) => r.fulfill({ json: snap }));
    await page.routeWebSocket("**/api/live", (socket) => socket.close());
    await page.goto("/?view=overview");
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${out}/offline-${lang}.png` });
  });
}
