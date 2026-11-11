// SPDX-License-Identifier: Apache-2.0
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  coreText,
  coreTextFields,
  deriveAttentionItems,
  isRiskyPaths,
  type ProjectSnapshot,
  summarizeStint,
  type Stint,
  type StintRecovery,
} from "@stintwork/core";
import { codexProfile } from "../../agents/src/profiles";
import {
  recoveryPath,
  recoveryPermission,
  recoverySnapshot,
  recoveryStint,
} from "../src/recovery-test-fixtures";
import { en } from "../src/i18n/en";
import { zhCN } from "../src/i18n/zh-CN";
import { assertLayout } from "./layout-check";

const fixtureSnapshots = new WeakMap<Page, ProjectSnapshot>();

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const snapshot = fixtureSnapshots.get(page);
  if (snapshot)
    await info.attach("recovery-fixture.json", {
      body: JSON.stringify(snapshot, null, 2),
      contentType: "application/json",
    });
  if (!page.isClosed())
    await info.attach("recovery-dom.html", {
      body: await page.content(),
      contentType: "text/html",
    });
});

async function fixture(page: Page, language: "en" | "zh-CN", risky = false) {
  const stint = recoveryStint();
  stint.events.push(recoveryPermission());
  const snapshot = recoverySnapshot(stint);
  snapshot.agents = [codexProfile];
  if (risky)
    snapshot.workItems[0].riskyPaths = [
      { path: "secret.env", blob: "a".repeat(40), reasons: ["likely-secret"] },
    ];
  fixtureSnapshots.set(page, snapshot);
  let send = () => {};
  let disconnect = () => {};
  let connections = 0;
  await page.addInitScript(
    (choice) => localStorage.setItem("stintwork.language", choice),
    language,
  );
  await page.route("**/api/project", (route) => route.fulfill({ json: snapshot }));
  await page.route("**/api/agents", (route) => route.fulfill({ json: { agents: [codexProfile] } }));
  await page.routeWebSocket("**/api/live", (socket) => {
    connections++;
    send = () => socket.send(JSON.stringify(snapshot));
    disconnect = () => socket.close();
    send();
  });
  function publish(next: Stint = stint) {
    const risks = snapshot.workItems[0].riskyPaths;
    expect(
      risks === undefined || isRiskyPaths(risks),
      "Recovery fixture risky paths must pass the real snapshot validator",
    ).toBe(true);
    snapshot.workItems[0].activeStint = next.status === "running" ? next : null;
    snapshot.workItems[0].stints = [summarizeStint(next)];
    snapshot.attentionItems = deriveAttentionItems(snapshot);
    send();
  }
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", language);
  await expect.poll(() => connections).toBe(1);
  return {
    snapshot,
    stint,
    publish,
    disconnect: () => disconnect(),
    connections: () => connections,
  };
}

async function capture(page: Page, info: TestInfo, state: string, region: string) {
  await page.mouse.move(0, 0);
  await assertLayout(page, { region });
  await page.screenshot({
    path: info.outputPath(`stint-recovery-review/${state}.png`),
    fullPage: true,
  });
}

for (const language of ["en", "zh-CN"] as const) {
  const t = language === "en" ? en : zhCN;
  for (const width of [1440, 1024, 768, 390, 360]) {
    for (const colorScheme of width === 1440 || width === 390
      ? (["light", "dark"] as const)
      : (["light"] as const)) {
      test(`recovery review ${width}px ${language} ${colorScheme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme });
        const f = await fixture(page, language);
        const opener = page.locator('.board-scroll [data-work-item="recovery"]');
        await expect(page.locator(".work-item .stint-running")).toContainText(
          t.stints.recovery.states.resuming,
        );
        await capture(page, info, "pipeline-resuming", ".board-scroll");
        await opener.focus();
        await page.keyboard.press("Enter");
        const drawer = page.locator(".work-item-drawer");
        const live = drawer.locator('section[aria-labelledby="drawer-live-stint-title"]');
        await expect(
          live.locator(':scope > div:first-of-type > p[role="status"]'),
          "Stage stint headers use the registered Agent name and omit absent tickets",
        ).toHaveText(`Codex · ${t.stints.statuses.running}`);
        await expect(drawer.getByRole("button", { name: t.stints.closeWorkItem })).toBeFocused();
        await expect(
          drawer.getByRole("button", { name: t.stints.startStint, exact: true }),
        ).toBeDisabled();
        await expect(
          live.getByRole("button", { name: t.stints.stopStint, exact: true }),
        ).toBeEnabled();
        for (const picker of await drawer.locator(".stage-rail").getByRole("combobox").all())
          await expect(picker).toBeDisabled();
        await live
          .getByRole("heading", { name: t.stints.liveStint, exact: true })
          .scrollIntoViewIfNeeded();
        await expect(
          live.getByRole("heading", { name: t.stints.liveStint, exact: true }),
        ).toBeInViewport({ ratio: 1 });
        await expect(
          live
            .locator(".stint-recovery")
            .getByText(t.stints.recovery.states.resuming, { exact: true }),
          "The full recovery badge must remain visible with its active stint heading",
        ).toBeInViewport({ ratio: 1 });
        await expect(live.getByRole("button", { name: /Proceed 原文/ })).toBeDisabled();
        await expect(live.getByRole("button", { name: /Reject 原文/ })).toBeDisabled();
        await capture(page, info, "slow-load-reconnecting", ".work-item-drawer");
        const details = live.getByText(t.stints.recovery.details, { exact: true });
        await details.focus();
        await page.keyboard.press("Enter");
        const disclosure = live.locator(
          '.stint-stream > .stint-recovery > [data-slot="card-content"] > details',
        );
        await expect(
          disclosure,
          "Recovery details must be an open disclosure inside the active stint stream",
        ).toHaveAttribute("open", "");
        const insets = await disclosure.evaluate((element) => {
          const summary = element.querySelector("summary");
          const label = element.querySelector("dt");
          if (!summary || !label) throw new Error("Missing recovery summary or first detail label");
          const a = summary.getBoundingClientRect(),
            b = label.getBoundingClientRect();
          return { gap: b.top - a.bottom, inset: b.left - a.left };
        });
        expect(
          insets.gap,
          "Detail labels must clear the summary focus ring",
        ).toBeGreaterThanOrEqual(8);
        expect(
          insets.inset,
          "Disclosure details must use a token-sized inset",
        ).toBeGreaterThanOrEqual(8);
        await expect(
          live
            .locator(".stint-recovery")
            .getByText(t.stints.recovery.states.resuming, { exact: true }),
          "Expanding details must not clip the recovery badge",
        ).toBeInViewport({ ratio: 1 });
        for (const label of [t.stints.recovery.worktree, t.stints.preparation.executable]) {
          const field = disclosure.getByText(label, { exact: true }).locator("..").locator("dd");
          await expect(field, `Recorded ${label} must show the full path`).toHaveText(recoveryPath);
        }
        await expect(live.getByText("0.163.0", { exact: true })).toBeAttached();
        await expect(live.getByText("2.1.1", { exact: true })).toBeAttached();
        await capture(page, info, "recorded-source-long-path", ".work-item-drawer");
        await page.keyboard.press("Escape");
        await expect(drawer).not.toBeVisible();
        await expect(opener).toBeFocused();
        const queueTrigger = page.locator("#needs-you-trigger");
        await queueTrigger.click();
        const queue = page.locator(".needs-you-queue");
        await expect(queue.getByRole("article")).toHaveCount(1);
        await expect(queue.getByText(t.needsYou.reconnectingPermission)).toBeVisible();
        await expect(queue.getByRole("button", { name: /Proceed 原文/ })).toBeDisabled();
        await capture(page, info, "queue-reconnecting", ".needs-you-queue");
        // A non-owner also supplies reconnecting, never an answerable persisted callback.
        f.publish();
        f.publish();
        f.disconnect();
        await expect.poll(f.connections).toBe(2);
        await expect(queue.getByRole("article")).toHaveCount(1);
        f.stint.events = f.stint.events.filter((event) => event.type !== "permission_request");
        f.stint.events.push(recoveryPermission("live"));
        f.stint.recovery.state = "resumed";
        f.publish();
        f.publish();
        await expect(queue.getByText(t.needsYou.waitingPermission)).toBeVisible();
        await expect(queue.getByRole("article")).toHaveCount(1);
        await capture(page, info, "queue-live", ".needs-you-queue");
        await page.keyboard.press("Escape");
        await expect(queueTrigger).toBeFocused();
        await opener.click();
        await live.scrollIntoViewIfNeeded();
        await expect(
          live.getByText(t.stints.recovery.states.resumed, { exact: true }),
        ).toBeVisible();
        await expect(
          live.getByRole("log").getByText("Agent content 原文", { exact: true }),
        ).toHaveCount(1);
        await capture(page, info, "resumed-stream", ".work-item-drawer");
        const history = drawer.locator('section[aria-labelledby="drawer-stint-history-title"]');
        let historyReads = 0;
        let release!: () => void;
        const loading = new Promise<void>((resolve) => {
          release = resolve;
        });
        await page.route("**/api/stints/recovery-stint", async (route) => {
          await loading;
          historyReads++;
          if (historyReads === 2)
            await route.fulfill({ status: 503, json: { reason: t.stints.readHistoryFailed } });
          else await route.fulfill({ json: { stint: f.stint } });
        });
        await history.getByRole("button", { name: t.stints.openStint(f.stint.id) }).click();
        await expect(history.getByRole("button", { name: t.stints.readingStint })).toBeDisabled();
        await capture(page, info, "history-loading", ".work-item-drawer");
        release();
        await expect(history.getByRole("log")).toBeVisible();
        await expect(history.getByRole("button", { name: /Proceed 原文|Reject 原文/ })).toHaveCount(
          0,
        );
        await expect(
          history.getByRole("log").getByText("Agent content 原文", { exact: true }),
        ).toHaveCount(1);
        await capture(page, info, "history-read-only", ".work-item-drawer");
        await history.getByRole("button", { name: t.stints.closeStint(f.stint.id) }).click();
        await history.getByRole("button", { name: t.stints.openStint(f.stint.id) }).click();
        await expect(history.getByRole("alert")).toHaveText(t.stints.readHistoryFailed);
        await capture(page, info, "history-error", ".work-item-drawer");
        await history.getByRole("button", { name: t.stints.openStint(f.stint.id) }).click();
        await expect(history.getByRole("log")).toBeVisible();
        await history.getByRole("button", { name: t.stints.closeStint(f.stint.id) }).click();
        // Successful recovery itself raises no item; only the real permission did.
        f.stint.events = f.stint.events.filter((event) => event.type !== "permission_request");
        f.publish();
        await page.keyboard.press("Escape");
        await queueTrigger.click();
        await expect(queue.getByRole("article")).toHaveCount(0);
        await expect(queue.getByText(t.needsYou.empty, { exact: true })).toBeVisible();
        await capture(page, info, "recovery-success-no-attention", ".needs-you-queue");
        const warning = `Possible writer 123: ${recoveryPath}. ${"Verify old tools 原文. ".repeat(30)}`;
        f.snapshot.warnings = [
          {
            path: ".stintwork/local/stints/recovery-stint.jsonl",
            ...coreTextFields(
              "message",
              coreText({ code: "recovery.blocked", params: { detail: warning } }),
            ),
          },
        ];
        f.stint.recovery.state = "resuming";
        f.publish();
        await expect(queue.getByRole("article")).toHaveCount(0);
        await queue.getByText(t.warningCallout.details, { exact: true }).click();
        await capture(page, info, "cleanup-blocked-warning", ".needs-you-queue");
        f.snapshot.warnings = [];
        const fallback: Stint & { recovery: StintRecovery } = {
          ...f.stint,
          status: "interrupted",
          endedAt: "2026-10-26T10:05:00Z",
          checkpointCommit: "abc123",
          recovery: {
            ...f.stint.recovery,
            state: "fallback",
            reason: "Missing recovery metadata (legacy or incomplete stint log).",
          },
        };
        f.publish(fallback);
        await page.keyboard.press("Escape");
        await opener.click();
        await expect(
          drawer.getByRole("button", { name: t.stints.startNewStint, exact: true }),
        ).toBeEnabled();
        await history.scrollIntoViewIfNeeded();
        await expect(
          history.getByText(t.stints.recovery.saved("abc123"), { exact: true }),
        ).toBeVisible();
        await history.getByText(t.stints.recovery.details, { exact: true }).click();
        await expect(
          history.getByText(t.coreText["recovery.legacy"], { exact: true }),
        ).toBeVisible();
        await capture(page, info, "legacy-checkpoint-fallback", ".work-item-drawer");
        fallback.agent = "grok";
        fallback.recovery.launch = undefined;
        fallback.recovery.reason =
          "Grok Build is experimental; restart recovery uses a checkpoint and a new stint.";
        f.publish(fallback);
        await expect(history.getByText(t.coreText["recovery.grok"], { exact: true })).toBeVisible();
        await capture(page, info, "grok-fallback", ".work-item-drawer");
        fallback.checkpointCommit = null;
        fallback.recovery.reason = `loadSession rejected: ${"Long provider diagnostic 原文 ".repeat(30)}`;
        fallback.error = `Could not resume stint: ${fallback.recovery.reason}\nCheckpoint failed: disk full 原文`;
        f.publish(fallback);
        await expect(history.locator('.stint-recovery [role="status"]')).toHaveText(
          t.stints.recovery.checkpointFailed(recoveryPath, fallback.error),
        );
        await capture(page, info, "checkpoint-failure-long-reason", ".work-item-drawer");
      });
    }
  }

  test(`recovery conflicting Review actions ${language}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await fixture(page, language, true);
    await page.route("**/api/work-items/recovery/checks", (route) =>
      route.fulfill({ json: { commands: [{ name: "test", command: "pnpm test" }], checks: [] } }),
    );
    await page.route("**/api/work-items/recovery/diff", (route) =>
      route.fulfill({
        json: {
          branch: "stintwork/recovery",
          mainBranch: "main",
          mainCommit: "base",
          mergeBase: "base",
          headCommit: "base",
          files: [
            {
              path: "secret.env",
              status: "added",
              binary: false,
              additions: 1,
              deletions: 0,
              hunks: [
                {
                  header: "@@ -0,0 +1 @@",
                  oldStart: 0,
                  oldCount: 0,
                  newStart: 1,
                  newCount: 1,
                  lines: [{ kind: "added", oldLine: null, newLine: 1, text: "SYNTHETIC=fixture" }],
                },
              ],
            },
          ],
        },
      }),
    );
    await page.locator('.board-scroll [data-work-item="recovery"]').click();
    const drawer = page.locator(".work-item-drawer");
    await drawer.getByRole("button", { name: t.stints.openReview, exact: true }).click();
    const review = page.locator(".review-overlay");
    await expect(review.getByText(t.review.checks.noEvidence, { exact: true })).toBeVisible();
    await expect(
      review.getByRole("button", { name: t.review.checks.run, exact: true }),
    ).toBeDisabled();
    await expect(
      review.getByRole("region", { name: t.review.risks.label }),
      "The valid fixture must render a real risky path section",
    ).toBeVisible();
    await expect(
      review
        .getByRole("region", { name: t.review.risks.label })
        .getByText("secret.env", { exact: true }),
    ).toBeVisible();
    await expect(
      review.getByRole("button", { name: t.review.risks.accept, exact: true }),
    ).toBeDisabled();
    await expect(
      review.getByRole("button", { name: t.review.diff.sendBack, exact: true }),
    ).toBeDisabled();
    await capture(page, info, "review-conflicting-actions", ".review-overlay");
    await page.keyboard.press("Escape");
    await expect(review).not.toBeVisible();
    await expect(
      drawer.getByRole("button", { name: t.stints.openReview, exact: true }),
    ).toBeFocused();
  });

  test(`recovery Stop ${language}`, async ({ page }, info) => {
    const f = await fixture(page, language);
    await page.locator('.board-scroll [data-work-item="recovery"]').click();
    const drawer = page.locator(".work-item-drawer");
    const live = drawer.locator('section[aria-labelledby="drawer-live-stint-title"]');
    let stopped = 0;
    await page.route("**/api/stints/recovery-stint/stop", async (route) => {
      stopped++;
      await route.fulfill({ json: {} });
    });
    const stop = live.getByRole("button", { name: t.stints.stopStint, exact: true });
    await stop.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => stopped).toBe(1);
    await expect(live.getByRole("button", { name: t.stints.stopping })).toBeDisabled();
    await capture(page, info, "stop-during-resuming", ".work-item-drawer");
    f.publish({ ...f.stint, status: "stopped", endedAt: "2026-10-26T10:05:00Z", events: [] });
    await expect(live).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: t.stints.startStint, exact: true }),
    ).toBeEnabled();
  });

  test(`recovery permission delivery ${language}`, async ({ page }, info) => {
    const f = await fixture(page, language);
    await page.locator("#needs-you-trigger").click();
    const queue = page.locator(".needs-you-queue");
    f.stint.events = f.stint.events.filter((event) => event.type !== "permission_request");
    f.stint.events.push(recoveryPermission("live"));
    f.publish();
    let release!: () => void;
    const delivery = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/stints/recovery-stint/permissions/permission", async (route) => {
      expect(route.request().postDataJSON()).toEqual({ optionId: "no", attemptId: "current" });
      await delivery;
      await route.fulfill({
        status: 409,
        json: {
          reason: "This permission request is no longer pending.",
          reasonMessage: { code: "permission.notPending" },
        },
      });
    });
    const reject = queue.getByRole("button", { name: /Reject 原文/ });
    await reject.focus();
    await page.keyboard.press("Enter");
    await expect(queue.getByRole("button", { name: /Proceed 原文/ })).toBeDisabled();
    await capture(page, info, "permission-answering", ".needs-you-queue");
    release();
    await expect(queue.getByRole("alert")).toBeVisible();
    await capture(page, info, "permission-delivery-error", ".needs-you-queue");
  });
}
