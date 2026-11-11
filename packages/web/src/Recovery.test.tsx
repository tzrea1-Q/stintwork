// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { recoveryPath, recoverySnapshot, recoveryStint } from "./recovery-test-fixtures";
import { StintStream } from "./StintStream";
import { WorkItemCard } from "./WorkItemCard";
import { WorkItemDrawer } from "./WorkItemDrawer";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

test.each([
  ["en", "Resuming stint…"],
  ["zh-CN", "正在恢复 Stint…"],
])(
  "%s keeps slow recovery visible with Stop, blocked Start and unchanged content",
  async (language, label) => {
    localStorage.setItem(languageStorageKey, language);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const item = recoverySnapshot().workItems[0];
    const card = render(
      <LanguageProvider>
        <WorkItemCard item={item} onOpen={() => {}} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(label);
    card.unmount();
    render(
      <LanguageProvider>
        <WorkItemDrawer item={item} onClose={() => {}} />
      </LanguageProvider>,
    );
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: language === "en" ? "Start stint" : "开始 Stint" }),
    ).toBeDisabled();
    const stop = screen.getByRole("button", {
      name: language === "en" ? "Stop stint" : "停止 Stint",
    });
    stop.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(fetch).toHaveBeenCalledWith("/api/stints/recovery-stint/stop", { method: "POST" });
    expect(stop).toBeDisabled();
    expect(screen.getByRole("log")).toHaveTextContent("Agent content 原文");
    const details = screen.getAllByText(language === "en" ? "Recovery details" : "恢复详情")[0];
    await userEvent.setup().click(details);
    expect(details.closest("details")).toHaveAttribute("open");
    const disclosure = details.closest("details");
    if (!disclosure) throw new Error("Expected recovery details");
    expect(within(disclosure).getAllByText(recoveryPath, { exact: true }).length).toBeGreaterThan(
      0,
    );
  },
);

test.each([
  ["en", "Stint resumed after server restart"],
  ["zh-CN", "服务器重启后已恢复 Stint"],
])("%s marks successful recovery", (language, marker) => {
  localStorage.setItem(languageStorageKey, language);
  render(
    <LanguageProvider>
      <StintStream stint={recoveryStint("resumed")} />
    </LanguageProvider>,
  );
  expect(screen.getByText(marker)).toBeVisible();
  expect(screen.getByRole("log")).toHaveTextContent("Agent content 原文");
});

test.each(["en", "zh-CN"] as const)(
  "%s distinguishes fallback checkpoint, checkpoint failure and an unchanged worktree",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const user = userEvent.setup();
    const stint = recoveryStint("fallback");
    stint.status = "interrupted";
    stint.endedAt = "2026-10-26T10:03:00Z";
    stint.recovery.reason = "Missing recovery metadata (legacy or incomplete stint log).";
    stint.checkpointCommit = "abc123";
    const view = render(
      <LanguageProvider>
        <StintStream stint={stint} replay />
      </LanguageProvider>,
    );
    expect(
      screen.getByText(
        language === "en"
          ? "Could not resume stint. Changes saved at checkpoint abc123. Start a new stint from the recorded state."
          : "无法恢复 Stint。更改已保存到检查点 abc123。请从已记录的状态开始新的 Stint。",
      ),
    ).toBeVisible();
    await user.click(screen.getByText(language === "en" ? "Recovery details" : "恢复详情"));
    expect(
      screen.getByText(
        language === "en" ? stint.recovery.reason : "缺少恢复元数据（旧版或不完整的 Stint 日志）。",
      ),
    ).toBeVisible();
    stint.checkpointCommit = null;
    stint.error = "Could not resume stint: load rejected\nCheckpoint failed: disk full 原文";
    view.rerender(
      <LanguageProvider>
        <StintStream stint={{ ...stint }} replay />
      </LanguageProvider>,
    );
    expect(
      screen.getByText(
        language === "en"
          ? `Could not resume stint or create a checkpoint. Your files remain in ${recoveryPath}. ${stint.error.replace(/\n/g, " ")}`
          : `无法恢复 Stint，也无法创建检查点。文件仍保留在 ${recoveryPath}。${stint.error.replace(/\n/g, " ")}`,
      ),
    ).toBeVisible();
    stint.error = "Could not resume stint: load rejected";
    view.rerender(
      <LanguageProvider>
        <StintStream stint={{ ...stint }} replay />
      </LanguageProvider>,
    );
    expect(
      screen.getByText(
        language === "en"
          ? "Could not resume stint. No new checkpoint was needed. Start a new stint from the recorded state."
          : "无法恢复 Stint。无需创建新的检查点。请从已记录的状态开始新的 Stint。",
      ),
    ).toBeVisible();
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s renders suspension, restored permissions and read-only replay of the same stint",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const { en } = await import("./i18n/en");
    const { zhCN } = await import("./i18n/zh-CN");
    const t = language === "en" ? en : zhCN;
    const { recoveryPermission } = await import("./recovery-test-fixtures");
    const stint = recoveryStint("suspending");
    stint.events.push(recoveryPermission());
    const view = render(
      <LanguageProvider>
        <StintStream stint={stint} />
      </LanguageProvider>,
    );
    expect(
      screen.getAllByText(language === "en" ? "Suspending stint…" : "正在暂停 Stint…").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Proceed 原文/ })).not.toBeInTheDocument();
    view.rerender(
      <LanguageProvider>
        <StintStream stint={{ ...stint, recovery: { ...stint.recovery, state: "resuming" } }} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("button", { name: /Proceed 原文/ })).toBeDisabled();
    expect(screen.getByText(t.needsYou.reconnectingPermission)).toBeVisible();
    view.rerender(
      <LanguageProvider>
        <StintStream stint={{ ...stint, recovery: { ...stint.recovery, state: "suspended" } }} />
      </LanguageProvider>,
    );
    expect(
      screen.getAllByText(language === "en" ? "Stint suspended" : "Stint 已暂停").length,
    ).toBeGreaterThan(0);
    stint.events = [recoveryPermission("live")];
    stint.recovery.state = "resumed";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    view.rerender(
      <LanguageProvider>
        <StintStream stint={{ ...stint }} />
      </LanguageProvider>,
    );
    const answer = screen.getByRole("button", { name: /Reject 原文/ });
    answer.focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(fetch).toHaveBeenCalledWith(
      "/api/stints/recovery-stint/permissions/permission",
      expect.objectContaining({ body: '{"optionId":"no","attemptId":"current"}' }),
    );
    view.rerender(
      <LanguageProvider>
        <StintStream stint={stint} replay />
      </LanguageProvider>,
    );
    expect(
      screen.queryByRole("button", { name: /Proceed 原文|Reject 原文/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(t.stints.noAnswer)).toBeVisible();
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s keeps conflicting checks disabled throughout recovery",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const { ChecksPanel } = await import("./ChecksPanel");
    const { en } = await import("./i18n/en");
    const { zhCN } = await import("./i18n/zh-CN");
    const t = language === "en" ? en : zhCN;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ commands: [{ name: "test", command: "pnpm test" }], checks: [] }),
      ),
    );
    render(
      <LanguageProvider>
        <ChecksPanel item={recoverySnapshot().workItems[0]} />
      </LanguageProvider>,
    );
    await screen.findByText(t.review.checks.noEvidence);
    expect(screen.getByRole("button", { name: t.review.checks.run })).toBeDisabled();
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s presents cleanup blocks as project warnings and translates Grok fallback without changing details",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const { WarningCallout } = await import("./ui/WarningCallout");
    const { coreTextFields, coreText } = await import("@stintwork/core");
    const detail = `Possible writer 123: ${recoveryPath}. Verify and stop old tools before restarting Stintwork.`;
    const view = render(
      <LanguageProvider>
        <WarningCallout
          warnings={[
            {
              path: ".stintwork/local/stints/recovery-stint.jsonl",
              ...coreTextFields(
                "message",
                coreText({ code: "recovery.blocked", params: { detail } }),
              ),
            },
          ]}
        />
      </LanguageProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      language === "en" ? "Possible writer 123:" : "Stint 恢复已阻止。",
    );
    await userEvent
      .setup()
      .click(screen.getByText(language === "en" ? "Warning details" : "警告详情"));
    expect(screen.getByRole("alert")).toHaveTextContent(detail);
    const stint = recoveryStint("fallback");
    stint.status = "interrupted";
    stint.checkpointCommit = "abc123";
    stint.agent = "grok";
    stint.recovery.reason =
      "Grok Build is experimental; restart recovery uses a checkpoint and a new stint.";
    view.rerender(
      <LanguageProvider>
        <StintStream stint={stint} replay />
      </LanguageProvider>,
    );
    await userEvent
      .setup()
      .click(screen.getByText(language === "en" ? "Recovery details" : "恢复详情"));
    expect(
      screen.getByText(
        language === "en"
          ? stint.recovery.reason
          : "Grok Build 为实验性支持；重启后将通过检查点和新的 Stint 继续。",
      ),
    ).toBeVisible();
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s shows the same recovery source in Needs you and returns focus on Escape",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const { Board } = await import("./Board");
    const { recoveryPermission } = await import("./recovery-test-fixtures");
    const { en } = await import("./i18n/en");
    const { zhCN } = await import("./i18n/zh-CN");
    const t = language === "en" ? en : zhCN;
    const stint = recoveryStint();
    stint.events.push(recoveryPermission());
    const snapshot = recoverySnapshot(stint);
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <Board snapshot={snapshot} />
      </LanguageProvider>,
    );
    const trigger = screen.getByRole("button", { name: `${t.topBar.needsYou} 1` });
    await user.click(trigger);
    const queue = screen.getByRole("dialog", { name: `${t.needsYou.heading} 1` });
    expect(
      within(queue).getByText(t.stints.recovery.states.resuming, { exact: true }),
    ).toBeVisible();
    await user.click(within(queue).getByText(t.stints.recovery.details, { exact: true }));
    expect(within(queue).getByText("0.163.0")).toBeVisible();
    expect(within(queue).getByText("2.1.1")).toBeVisible();
    expect(within(queue).getByRole("button", { name: /Proceed 原文/ })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s blocks recovery conflicts in Review while leaving browsing available",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const { ReviewOverlay } = await import("./ReviewOverlay");
    const { en } = await import("./i18n/en");
    const { zhCN } = await import("./i18n/zh-CN");
    const t = language === "en" ? en : zhCN;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const item = recoverySnapshot().workItems[0];
    item.riskyPaths = [{ path: "secret.env", blob: "blob", reasons: ["likely-secret"] }];
    render(
      <LanguageProvider>
        <ReviewOverlay item={item} onClose={() => {}} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("button", { name: t.review.risks.accept })).toBeDisabled();
    expect(screen.getByRole("button", { name: t.review.diff.close })).toBeEnabled();
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s refreshes an open recovery replay when its phase changes and retains read-only controls",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const { StintHistory } = await import("./StintHistory");
    const { summarizeStint } = await import("@stintwork/core");
    const { recoveryPermission } = await import("./recovery-test-fixtures");
    const { en } = await import("./i18n/en");
    const { zhCN } = await import("./i18n/zh-CN");
    const t = language === "en" ? en : zhCN;
    const user = userEvent.setup();
    let stint = recoveryStint();
    stint.events.push(recoveryPermission());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ stint })),
    );
    const view = render(
      <LanguageProvider>
        <StintHistory stints={[summarizeStint(stint)]} />
      </LanguageProvider>,
    );
    await user.click(screen.getByRole("button", { name: t.stints.openStint(stint.id) }));
    await screen.findByRole("log");
    expect(screen.queryByRole("button", { name: /Proceed 原文/ })).not.toBeInTheDocument();
    stint = { ...stint, recovery: { ...stint.recovery, state: "resumed" } };
    view.rerender(
      <LanguageProvider>
        <StintHistory stints={[summarizeStint(stint)]} />
      </LanguageProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(t.stints.recovery.states.resumed, { exact: true })).toBeVisible(),
    );
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s offers the existing new-stint path only after fallback ends",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const { en } = await import("./i18n/en");
    const { zhCN } = await import("./i18n/zh-CN");
    const t = language === "en" ? en : zhCN;
    const stint = recoveryStint("fallback");
    stint.status = "interrupted";
    stint.checkpointCommit = "abc123";
    stint.endedAt = "2026-10-26T10:05:00Z";
    stint.recovery.reason = "Missing recovery metadata (legacy or incomplete stint log).";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(
      <LanguageProvider>
        <WorkItemDrawer item={recoverySnapshot(stint).workItems[0]} onClose={() => {}} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("button", { name: t.stints.startNewStint })).toBeEnabled();
    expect(screen.queryByRole("button", { name: t.stints.stopStint })).not.toBeInTheDocument();
    expect(screen.getByText(t.stints.recovery.saved("abc123"))).toBeVisible();
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s hides unfinished recovery phases after Stop but retains genuine resume success",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const { en } = await import("./i18n/en");
    const { zhCN } = await import("./i18n/zh-CN");
    const t = language === "en" ? en : zhCN;
    const stint = recoveryStint();
    stint.status = "stopped";
    stint.endedAt = "2026-10-26T10:05:00Z";
    const view = render(
      <LanguageProvider>
        <StintStream stint={stint} replay />
      </LanguageProvider>,
    );
    expect(
      screen.queryByText(t.stints.recovery.states.resuming, { exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(t.stints.statuses.stopped, { exact: true })).toBeVisible();
    view.rerender(
      <LanguageProvider>
        <StintStream
          stint={{ ...stint, recovery: { ...stint.recovery, state: "resumed" } }}
          replay
        />
      </LanguageProvider>,
    );
    expect(screen.getByText(t.stints.recovery.states.resumed, { exact: true })).toBeVisible();
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s keeps recovery with the active stint before planning files",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(
      <LanguageProvider>
        <WorkItemDrawer item={recoverySnapshot().workItems[0]} onClose={() => {}} />
      </LanguageProvider>,
    );
    const live = document.querySelector('section[aria-labelledby="drawer-live-stint-title"]');
    const spec = document.querySelector("#drawer-spec");
    if (!live || !spec) throw new Error("Expected active stint and planning sections");
    expect(live.compareDocumentPosition(spec) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(live.querySelectorAll(".stint-stream > .stint-recovery")).toHaveLength(1);
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s collapsed history names the recorded worktree after replacement",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const { en } = await import("./i18n/en");
    const { zhCN } = await import("./i18n/zh-CN");
    const t = language === "en" ? en : zhCN;
    const stint = recoveryStint("fallback");
    stint.status = "interrupted";
    stint.error = "Checkpoint failed: disk full";
    const item = recoverySnapshot(stint).workItems[0];
    item.worktreePath = "/replacement/worktree";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(
      <LanguageProvider>
        <WorkItemDrawer item={item} onClose={() => {}} />
      </LanguageProvider>,
    );
    expect(
      screen.getByText(t.stints.recovery.checkpointFailed(recoveryPath, stint.error), {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      screen.queryByText(t.stints.recovery.checkpointFailed("/replacement/worktree", stint.error), {
        exact: true,
      }),
    ).not.toBeInTheDocument();
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s localizes a checkpoint failure even when an older summary lacks its worktree",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const { en } = await import("./i18n/en");
    const { zhCN } = await import("./i18n/zh-CN");
    const t = language === "en" ? en : zhCN;
    const { summarizeStint } = await import("@stintwork/core");
    const { StintHistory } = await import("./StintHistory");
    const stint = recoveryStint("fallback");
    stint.status = "interrupted";
    stint.error = "Checkpoint failed: disk full";
    const summary = summarizeStint(stint);
    delete summary.worktree;
    render(
      <LanguageProvider>
        <StintHistory stints={[summary]} />
      </LanguageProvider>,
    );
    expect(
      screen.getByText(t.stints.recovery.checkpointFailedUnknown(stint.error), { exact: true }),
    ).toBeVisible();
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s live header uses registered Agent names, optional tickets and an id fallback",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const { en } = await import("./i18n/en");
    const { zhCN } = await import("./i18n/zh-CN");
    const t = language === "en" ? en : zhCN;
    const { codexProfile } = await import("../../agents/src/profiles");
    const profile = { ...codexProfile, displayName: "Registered Codex 原文" };
    const item = recoverySnapshot().workItems[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const view = render(
      <LanguageProvider>
        <WorkItemDrawer item={item} agents={[profile]} onClose={() => {}} />
      </LanguageProvider>,
    );
    const live = screen.getByRole("heading", { name: t.stints.liveStint }).closest("section");
    if (!live) throw new Error("Expected live stint section");
    const header = within(live).getAllByRole("status")[0];
    expect(header).toHaveTextContent(`Registered Codex 原文 · ${t.stints.statuses.running}`);
    expect(header).not.toHaveTextContent("null");
    const active = item.activeStint;
    if (!active) throw new Error("Expected active stint");
    view.rerender(
      <LanguageProvider>
        <WorkItemDrawer
          item={{ ...item, activeStint: { ...active, ticket: 7 } }}
          agents={[profile]}
          onClose={() => {}}
        />
      </LanguageProvider>,
    );
    expect(header).toHaveTextContent(
      `Registered Codex 原文 · ${t.stints.briefTicket(7)} · ${t.stints.statuses.running}`,
    );
    view.rerender(
      <LanguageProvider>
        <WorkItemDrawer item={item} agents={[]} onClose={() => {}} />
      </LanguageProvider>,
    );
    expect(header).toHaveTextContent(`codex · ${t.stints.statuses.running}`);
    expect(header).not.toHaveTextContent("null");
  },
);

test.each(["en", "zh-CN"] as const)(
  "%s keeps the recorded worktree, executable and permission cwd in their own contexts",
  async (language) => {
    localStorage.setItem(languageStorageKey, language);
    const { en } = await import("./i18n/en");
    const { zhCN } = await import("./i18n/zh-CN");
    const t = language === "en" ? en : zhCN;
    const { recoveryPermission } = await import("./recovery-test-fixtures");
    const stint = recoveryStint();
    stint.events.push(recoveryPermission());
    render(
      <LanguageProvider>
        <StintStream stint={stint} />
      </LanguageProvider>,
    );
    const summary = screen.getByText(t.stints.recovery.details, { exact: true });
    await userEvent.setup().click(summary);
    const disclosure = summary.closest("details");
    if (!disclosure) throw new Error("Expected recovery details");
    for (const label of [t.stints.recovery.worktree, t.stints.preparation.executable]) {
      const field = within(disclosure).getByText(label, { exact: true }).parentElement;
      if (!field) throw new Error(`Missing labelled field: ${label}`);
      expect(within(field).getByRole("definition")).toHaveTextContent(recoveryPath);
    }
    expect(
      screen.getByRole("region", { name: t.stints.permissionTitle("Agent command 原文") }),
    ).toHaveTextContent(recoveryPath);
  },
);
