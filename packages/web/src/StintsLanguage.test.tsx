// SPDX-License-Identifier: Apache-2.0
import {
  applyStintLogEntry,
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  indexProject,
  summarizeStint,
  type Stint,
} from "@stintwork/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { codexProfile } from "../../agents/src/profiles";
import { WorkItemDrawer } from "./WorkItemDrawer";
import { StintHistory } from "./StintHistory";
import { StintStream } from "./StintStream";
import { GateView } from "./GateView";
import { LanguageProvider, languageStorageKey } from "./i18n/language";

const files = createMemoryRepoFiles({
  "AGENTS.md": "Developer conventions 原文",
  ".scratch/example/spec.md": "# Repo title 原文\nSpec body café 中文",
  ".scratch/example/workflow.yaml": "workflow: feature\nstage: implement",
  ".scratch/example/issues/01-work.md":
    "# Ticket title 原文\nStatus: ready-for-agent\nBlocked by: none",
});
const item = indexProject(files, { name: "Project 中文" }).workItems[0];
const brief = compileBrief({
  files,
  workItem: item,
  stage: builtInWorkflows.feature.stages[3],
  ticket: item.tickets[0],
});
const running = applyStintLogEntry(null, {
  type: "started",
  at: "2026-10-09T10:00:00Z",
  stint: {
    id: "stint-中文",
    workItem: item.slug,
    stage: "implement",
    ticket: 1,
    agent: "codex",
    worktree: { path: "/worktree/中文", branch: "stintwork/example" },
    baseCommit: "base",
    brief,
  },
}) as Stint;
const finished = applyStintLogEntry(running, {
  type: "ended",
  at: "2026-10-09T10:01:00Z",
  status: "finished",
  checkpointCommit: "checkpoint-sha",
  handoff: {
    stint: running.id,
    agent: "codex",
    stoppedAt: "Handoff 原文 café",
    unresolved: "Unresolved 原文",
    nextStep: "Next 原文",
  },
}) as Stint;

beforeEach(() => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ agents: [codexProfile] }))),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.lang = "en";
});

test("Chinese drawer sections, stage agents and Stop keep repo content verbatim", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(
    <LanguageProvider>
      <WorkItemDrawer
        item={{ ...item, activeStint: running, stints: [summarizeStint(running)] }}
        onClose={onClose}
      />
    </LanguageProvider>,
  );
  const drawer = within(screen.getByRole("dialog", { name: "Repo title 原文" }));
  const sections = within(drawer.getByRole("navigation", { name: "工作项章节" }));
  expect(sections.getByRole("link", { name: "规格说明" })).toHaveAttribute("href", "#drawer-spec");
  expect(sections.getByRole("link", { name: "工单 1" })).toHaveAttribute("href", "#drawer-tickets");
  expect(drawer.getByRole("list", { name: "功能工作流阶段" })).toHaveTextContent("实现");
  expect(await drawer.findByRole("combobox", { name: "实现 Agent" })).toHaveValue("codex");
  expect(drawer.getByText("01 · Ticket title 原文")).toBeInTheDocument();
  expect(drawer.getByText("Spec body café 中文")).toBeInTheDocument();
  expect(drawer.getByRole("button", { name: "开始 Stint" })).toBeDisabled();
  await user.click(drawer.getByRole("button", { name: "停止" }));
  expect(fetch).toHaveBeenCalledWith("/api/stints/stint-%E4%B8%AD%E6%96%87/stop", {
    method: "POST",
  });
  expect(drawer.getByRole("button", { name: "正在停止 Stint…" })).toBeDisabled();
  await user.click(drawer.getByRole("button", { name: "关闭工作项" }));
  expect(onClose).toHaveBeenCalledOnce();
});

test("Chinese resume brief uses glossary permission names and preserves the prompt and handoff", async () => {
  const user = userEvent.setup();
  const resumed = { ...brief, checkpointCommit: "checkpoint-sha", lastHandoff: finished.handoff };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(url === "/api/agents" ? { agents: [codexProfile] } : resumed)),
    ),
  );
  render(
    <LanguageProvider>
      <WorkItemDrawer item={{ ...item, stints: [summarizeStint(finished)] }} onClose={() => {}} />
    </LanguageProvider>,
  );
  await user.click(screen.getByRole("button", { name: "开始 Stint" }));
  const sheet = within(screen.getByRole("dialog", { name: "简报预览" }));
  await sheet.findByRole("heading", { name: "完整提示词" });
  const levels = within(sheet.getByRole("combobox", { name: "权限级别" }));
  for (const name of ["问询", "自由编辑", "自主"])
    expect(levels.getByRole("option", { name })).toBeInTheDocument();
  await user.selectOptions(sheet.getByRole("combobox", { name: "权限级别" }), "ask");
  const requests = vi.mocked(fetch).mock.calls.length;
  await user.selectOptions(screen.getByRole("combobox", { name: "语言" }), "en");
  expect(screen.getByRole("dialog", { name: "Brief preview" })).toBeInTheDocument();
  expect(sheet.getByRole("combobox", { name: "Permission level" })).toHaveValue("ask");
  await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "zh-CN");
  expect(sheet.getByRole("combobox", { name: "权限级别" })).toHaveValue("ask");
  expect(fetch).toHaveBeenCalledTimes(requests);
  await user.selectOptions(sheet.getByRole("combobox", { name: "权限级别" }), "edit-freely");
  expect(sheet.getByText("Handoff 原文 café")).toBeInTheDocument();
  expect(sheet.getByText("checkpoint-sha")).toBeInTheDocument();
  expect(
    sheet.getByRole("heading", { name: "完整提示词" }).closest("section")?.querySelector("pre")
      ?.textContent,
  ).toBe(brief.prompt);
  await user.click(sheet.getByRole("button", { name: "复制提示词" }));
  expect(await navigator.clipboard.readText()).toBe(brief.prompt);
  await user.click(sheet.getByRole("button", { name: "开始" }));
  expect(fetch).toHaveBeenCalledWith(
    "/api/stints",
    expect.objectContaining({
      body: JSON.stringify({
        workItem: item.slug,
        ticket: 1,
        agent: "codex",
        permissionLevel: "edit-freely",
      }),
    }),
  );
  expect(screen.queryByRole("dialog", { name: "简报预览" })).not.toBeInTheDocument();
});

test("Chinese history formats dates with Intl and replays original non-ASCII output", async () => {
  const user = userEvent.setup();
  const recorded: Stint = {
    ...finished,
    events: [
      { type: "message", id: "message", text: "Agent output 原文 café 🚀" },
      { type: "thought", id: "thought", text: "Agent thought 原文" },
      {
        type: "plan",
        id: "plan",
        entries: [{ content: "Agent plan 原文", priority: "high", status: "completed" }],
      },
      {
        type: "tool_call",
        toolCallId: "tool",
        title: "printf 原文",
        kind: "execute",
        status: "completed",
        content: [
          { type: "text", text: "Tool output 原文 café" },
          { type: "diff", path: "/worktree/中文.ts", oldText: "Old 原文", newText: "New 原文" },
        ],
      },
      {
        type: "file_edit",
        toolCallId: "tool",
        path: "/worktree/中文.ts",
        oldText: "Old 原文",
        newText: "New 原文",
      },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ stint: recorded }))),
  );
  render(
    <LanguageProvider>
      <StintHistory stints={[summarizeStint(recorded)]} />
    </LanguageProvider>,
  );
  const history = screen.getByRole("list", { name: "Stint 历史" });
  const dates = history.querySelectorAll("time");
  const date = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" });
  expect(dates[0]).toHaveAttribute("datetime", recorded.startedAt);
  expect(dates[0]).toHaveTextContent(date.format(new Date(recorded.startedAt)));
  expect(dates[1]).toHaveTextContent(date.format(new Date(recorded.endedAt as string)));
  expect(history).toHaveTextContent("codex · 工单 1 · 已结束");
  expect(within(history).getByRole("article", { name: "交接" })).toHaveTextContent(
    "Handoff 原文 café",
  );
  await user.click(screen.getByRole("button", { name: "打开 Stint stint-中文" }));
  const log = within(await screen.findByRole("log", { name: "Stint 消息" }));
  expect(log.getByText("Agent output 原文 café 🚀")).toBeInTheDocument();
  expect(log.getByText("Agent thought 原文")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Stint 计划" })).toHaveTextContent(
    "Agent plan 原文已完成",
  );
  expect(log.getByText("printf 原文")).toBeInTheDocument();
  await user.click(log.getByText("工具输出", { selector: "summary" }));
  expect(
    log.getByText("Tool output 原文 café", { exact: false, selector: "pre" }),
  ).toHaveTextContent("原文件内容： Old 原文 新文件内容： New 原文");
  expect(log.getByText("文件编辑")).toBeInTheDocument();
  expect(screen.getByText("Stint 已结束")).toBeInTheDocument();
});

test.each(["finished", "stopped", "failed", "interrupted"] as const)(
  "Chinese stream labels a %s stint without translating its error",
  (status) => {
    render(
      <LanguageProvider>
        <StintStream stint={{ ...finished, status, error: "Agent error 原文" }} />
      </LanguageProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Agent error 原文");
    expect(screen.getByRole("status")).toHaveTextContent(
      {
        finished: "Stint 已结束",
        stopped: "Stint 已停止",
        failed: "Stint 失败",
        interrupted: "Stint 已中断",
      }[status],
    );
  },
);

test("Chinese gate approval keeps ticket titles, warning paths and warning messages verbatim", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ stage: "review" }))),
  );
  render(
    <LanguageProvider>
      <GateView
        item={{ ...item, tickets: item.tickets.map((ticket) => ({ ...ticket, resolved: true })) }}
        warnings={[{ path: ".scratch/中文/spec.md", message: "Core warning 原文" }]}
      />
    </LanguageProvider>,
  );
  const gate = within(screen.getByRole("region", { name: "实现关卡" }));
  expect(gate.getByText("Core warning 原文", { exact: false })).toHaveTextContent(
    ".scratch/中文/spec.md",
  );
  expect(gate.getByText("1 · Ticket title 原文 · 已解决")).toBeInTheDocument();
  await user.click(gate.getByRole("button", { name: "批准实现" }));
  expect(await gate.findByText("关卡已批准。阶段推进至审查。")).toBeInTheDocument();
});

test("Chinese rail localizes chrome while custom workflow and stage names remain verbatim", async () => {
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".stintwork/workflows/team.yaml": JSON.stringify({
        id: "team",
        name: "Team workflow 自定义",
        defaultAgent: "codex",
        stages: [
          { id: "design", name: "Design 自定义", column: "spec", skill: "/design", gate: "manual" },
          { id: "ship", name: "Deliver 自定义", column: "ship", skill: null, gate: "merge" },
        ],
      }),
      ".scratch/custom/workflow.yaml": "workflow: team\nstage: design",
      ".scratch/custom/spec.md": "# Custom title 原文",
    }),
    { name: "Project 中文" },
  );
  render(
    <LanguageProvider>
      <WorkItemDrawer
        item={snapshot.workItems[0]}
        workflows={snapshot.workflows}
        onClose={() => {}}
      />
    </LanguageProvider>,
  );
  expect(screen.getByRole("list", { name: "Team workflow 自定义工作流阶段" })).toHaveTextContent(
    "Design 自定义",
  );
  expect(await screen.findByRole("combobox", { name: "Design 自定义 Agent" })).toHaveValue("codex");
  expect(screen.getByRole("button", { name: "批准Design 自定义" })).toBeInTheDocument();
});
