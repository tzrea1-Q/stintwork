// SPDX-License-Identifier: Apache-2.0
import {
  createMemoryRepoFiles,
  foldStintLog,
  indexProject,
  type Stint,
  type StintLogEvent,
} from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { attentionProfile } from "./attention-test-fixtures";
import { LanguageProvider, languageStorageKey } from "./i18n/language";
import { StintStream } from "./StintStream";
import { WorkItemCard } from "./WorkItemCard";
import { WorkItemDrawer } from "./WorkItemDrawer";

const request: Extract<StintLogEvent, { type: "permission_request" }> = {
  type: "permission_request",
  requestId: "request",
  toolCallId: "git",
  title: "git add",
  kind: "execute",
  automatic: false,
  options: [
    { optionId: "allow", name: "Yes, proceed", kind: "allow_once" },
    { optionId: "cancel", name: "No, and tell Codex what to do differently", kind: "reject_once" },
  ],
};
const item = indexProject(
  createMemoryRepoFiles({
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/01-first.md":
      "# First ticket\nStatus: ready-for-agent\nBlocked by: none",
  }),
  { name: "Project" },
).workItems[0];
function stint(events: StintLogEvent[] = []): Stint {
  return foldStintLog([
    {
      type: "started",
      at: "2026-10-09T10:00:00Z",
      stint: {
        id: "stint",
        workItem: "first",
        stage: "implement",
        ticket: 1,
        agent: "codex",
        worktree: { path: "/worktree", branch: "stintwork/first" },
        baseCommit: "base",
        brief: { skill: null, pointers: [], lastHandoff: null, changedPaths: [], prompt: "Work" },
      },
    },
    ...events.map((event) => ({ type: "event" as const, at: "2026-10-09T10:00:01Z", event })),
  ]) as Stint;
}

test("Chinese stint replay translates authored diagnostics while old diagnostics remain verbatim", () => {
  localStorage.setItem(languageStorageKey, "zh-CN");
  const recorded = stint();
  recorded.status = "failed";
  recorded.error = "Agent ended the stint with stop reason: max_tokens.";
  recorded.errorMessage = { code: "stint.stopReason", params: { reason: "max_tokens" } };
  const { rerender } = render(
    <LanguageProvider>
      <StintStream stint={recorded} replay />
    </LanguageProvider>,
  );
  expect(screen.getByRole("alert").textContent).toBe(
    "Agent 结束了此 Stint，停止原因：max_tokens。",
  );
  rerender(
    <LanguageProvider>
      <StintStream stint={{ ...recorded, errorMessage: undefined }} replay />
    </LanguageProvider>,
  );
  expect(screen.getByRole("alert").textContent).toBe(recorded.error);
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem(languageStorageKey);
});

test.each([false, true])(
  "Chinese stream translates structured notes, not old logs or unknown codes (replay=%s)",
  (replay) => {
    localStorage.setItem(languageStorageKey, "zh-CN");
    const english =
      "Wrote workflow.yaml with the workflow, stage and Claude Code for this stage.\n";
    const current = stint(
      JSON.parse(
        JSON.stringify([
          {
            type: "message",
            id: "setup",
            text: english,
            message: { code: "stream.wroteWorkflow", params: { agent: "Claude Code" } },
          },
          { type: "message", id: "old", text: english },
          {
            type: "message",
            id: "future",
            text: "Future English note",
            message: { code: "stream.future" },
          },
          {
            type: "message",
            id: "invalid",
            text: "Malformed message stays English",
            message: { code: "stream.wroteWorkflow", params: { agent: 42 } },
          },
          { type: "thought", id: "thought", text: "Agent thought 原文" },
        ]),
      ),
    );
    render(
      <LanguageProvider>
        <StintStream stint={current} replay={replay} />
      </LanguageProvider>,
    );
    expect(
      screen.getByText("已写入 workflow.yaml，包含此阶段的工作流、阶段和 Claude Code。"),
    ).toBeInTheDocument();
    expect(screen.getByText(english.trim())).toBeInTheDocument();
    expect(screen.getByText("Future English note")).toBeInTheDocument();
    expect(screen.getByText("Malformed message stays English")).toBeInTheDocument();
    expect(screen.getByText("Agent thought 原文")).toBeInTheDocument();
  },
);

test("an automatic request awaiting its receipt does not ask the developer for an answer", () => {
  const current = stint([{ ...request, automatic: true }]);
  const { rerender } = render(<StintStream stint={current} />);
  expect(screen.getByText("Stintwork is answering automatically.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Allow/ })).not.toBeInTheDocument();
  expect(screen.queryByText("Waiting for your permission answer")).not.toBeInTheDocument();
  rerender(<StintStream stint={current} replay />);
  expect(screen.getByText("No automatic answer recorded.")).toBeInTheDocument();
});

test.each([false, true])(
  "tool output decodes Grok UTF-8 byte arrays in live/replay=%s",
  async (replay) => {
    const text = "Hello from Grok · 你好\n";
    const output = JSON.stringify({ output: [...new TextEncoder().encode(text)] });
    render(
      <StintStream
        stint={stint([
          {
            type: "tool_call",
            toolCallId: "grok",
            output,
            content: [{ type: "text", text: output }],
          },
        ])}
        replay={replay}
      />,
    );
    await userEvent.setup().click(screen.getByText("Tool output"));
    expect(screen.getAllByText("Hello from Grok · 你好", { selector: "pre" })).toHaveLength(2);
    expect(screen.queryByText(output)).not.toBeInTheDocument();
  },
);

test.each([false, true])(
  "permission details and automatic answers remain readable in live/replay=%s",
  async (replay) => {
    const details = JSON.stringify(
      {
        toolCallId: "command",
        rawInput: { name: "Bash", command: "printf 'hello' > greeting.txt", cwd: "/worktree" },
        locations: [{ path: "/worktree/greeting.txt" }],
      },
      null,
      2,
    );
    render(
      <StintStream
        stint={stint([
          { ...request, details },
          {
            type: "permission",
            requestId: request.requestId,
            toolCallId: request.toolCallId,
            title: request.title,
            kind: request.kind,
            automatic: true,
            decision: { outcome: "selected", optionId: "allow", kind: "allow_once" },
          },
        ])}
        replay={replay}
      />,
    );
    expect(
      screen.getByText("printf 'hello' > greeting.txt", { selector: "pre" }),
    ).toBeInTheDocument();
    expect(screen.getByText("/worktree", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByText("/worktree/greeting.txt", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByText("Automatic · Yes, proceed")).toBeInTheDocument();
    const disclosure = screen.getByText("Full permission JSON").closest("details");
    expect(disclosure).not.toHaveAttribute("open");
    await userEvent.setup().click(screen.getByText("Full permission JSON"));
    expect(disclosure).toHaveAttribute("open");
    expect(
      within(disclosure as HTMLElement).getByText(details, {
        selector: "pre",
        normalizer: (text) => text,
      }),
    ).toBeInTheDocument();
  },
);

test("the drawer renders plan progress, messages, thoughts, tool status, file paths and other events; output expands natively", async () => {
  const user = userEvent.setup();
  const events: StintLogEvent[] = [
    {
      type: "plan",
      id: "plan",
      entries: [
        { content: "Read ticket", priority: "high", status: "completed" },
        { content: "Edit file", priority: "medium", status: "in_progress" },
      ],
    },
    { type: "message_delta", id: "message", text: "**Working now**" },
    { type: "thought_delta", id: "thought", text: "Thinking about the change" },
    {
      type: "tool_call",
      toolCallId: "edit",
      title: "Write greeting",
      kind: "edit",
      status: "in_progress",
      locations: [{ path: "/worktree/hello.ts", line: 2 }],
    },
    {
      type: "tool_call_update",
      toolCallId: "edit",
      status: "completed",
      content: [
        { type: "text", text: "Long output\n".repeat(30) },
        { type: "diff", path: "/worktree/hello.ts", oldText: "old", newText: "new" },
      ],
    },
    { type: "file_edit", toolCallId: "edit", path: "/worktree/hello.ts" },
    { type: "other", kind: "usage_update", update: { used: 10 } },
  ];
  const { rerender } = render(
    <WorkItemDrawer item={{ ...item, activeStint: stint(events) }} onClose={() => {}} />,
  );
  const plan = screen.getByRole("region", { name: "Stint plan" });
  expect(plan).toHaveTextContent("1/2");
  expect(within(plan).getByText("completed")).toBeInTheDocument();
  const log = screen.getByRole("log", { name: "Stint messages" });
  expect(log).toHaveTextContent("Working now");
  expect(log).toHaveTextContent("Agent thought");
  expect(log).toHaveTextContent("Thinking about the change");
  expect(log).toHaveTextContent("edit · completed");
  expect(log).toHaveTextContent("/worktree/hello.ts:2");
  expect(log).toHaveTextContent("File edit");
  expect(log).toHaveTextContent("usage update");
  const output = screen.getByText("Tool output").closest("details");
  expect(output).not.toHaveAttribute("open");
  await user.click(screen.getByText("Tool output"));
  expect(output).toHaveAttribute("open");
  expect(within(output as HTMLElement).getByText(/Long output/)).toBeVisible();
  expect(output).toHaveTextContent("Previous file content: old");
  expect(output).toHaveTextContent("New file content: new");
  const latest = stint([
    ...events,
    {
      type: "plan",
      id: "plan",
      entries: [
        { content: "Read ticket", priority: "high", status: "completed" },
        { content: "Edit file", priority: "medium", status: "completed" },
      ],
    },
  ]);
  rerender(<WorkItemDrawer item={{ ...item, activeStint: latest }} onClose={() => {}} />);
  expect(screen.getByRole("region", { name: "Stint plan" })).toHaveTextContent("2/2");
  expect(screen.getAllByText("Write greeting")).toHaveLength(1);
  expect(screen.getByText("Tool output").closest("details")).toHaveAttribute("open");
  await user.click(screen.getByText("Tool output"));
  expect(output).not.toHaveAttribute("open");
});

test.each(["allow", "cancel"])(
  "permission %s uses the offered name and optionId, not a fabricated rejection",
  async (optionId) => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    const { rerender } = render(
      <StintStream
        stint={stint([request])}
        profile={{ ...attentionProfile, id: "codex", displayName: "Codex" }}
      />,
    );
    expect(screen.getByText("Declining ends Codex’s turn.")).toBeInTheDocument();
    expect(screen.getByText(/even when this drawer is closed/)).toBeInTheDocument();
    const option = request.options.find((entry) => entry.optionId === optionId);
    await user.click(
      screen.getByRole("button", {
        name: `${optionId === "allow" ? "Allow once" : "Deny"} ${option?.name}`,
      }),
    );
    expect(fetch).toHaveBeenCalledWith("/api/stints/stint/permissions/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    });
    expect(await screen.findByText("Answer sent.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Allow once/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Deny/ })).toBeDisabled();
    rerender(
      <StintStream
        stint={stint([
          request,
          {
            type: "permission",
            requestId: request.requestId,
            toolCallId: "git",
            title: "git add",
            kind: "execute",
            automatic: false,
            decision: {
              outcome: "selected",
              optionId,
              kind: optionId === "allow" ? "allow_once" : "reject_once",
            },
          },
        ])}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(option?.name ?? "")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

test("a failed permission answer stays pending with the server reason and can be retried", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reason: "This permission request is no longer pending." }), {
          status: 409,
        }),
      )
      .mockResolvedValueOnce(new Response("{}")),
  );
  render(<StintStream stint={stint([request])} />);
  await user.click(screen.getByRole("button", { name: /Allow once/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("no longer pending");
  expect(screen.getByRole("button", { name: /Allow once/ })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: /Allow once/ }));
  expect(await screen.findByText("Answer sent.")).toBeInTheDocument();
});

test("ended stints cannot offer stale permission actions", () => {
  render(<StintStream stint={{ ...stint([request]), status: "interrupted" }} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText("This request is no longer pending.")).toBeInTheDocument();
});

test("the board card shows and removes the active stint indicator", () => {
  const { rerender } = render(
    <WorkItemCard item={{ ...item, activeStint: stint() }} onOpen={() => {}} />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Stint running");
  rerender(<WorkItemCard item={item} onOpen={() => {}} />);
  expect(screen.queryByText("Stint running")).not.toBeInTheDocument();
});

test("a restored selection stays disabled through transport delivery and replay/ending never offers controls", () => {
  const bound = { ...request, attemptId: "new", binding: "live" as const };
  const selected: StintLogEvent = {
    type: "permission",
    requestId: "request",
    attemptId: "new",
    toolCallId: "git",
    title: request.title,
    kind: request.kind,
    automatic: false,
    decision: { outcome: "selected", optionId: "allow", kind: "allow_once" },
  };
  const current = stint([bound, selected]);
  const view = render(<StintStream stint={current} />);
  expect(screen.getByRole("button", { name: /Allow once/ })).toBeDisabled();
  view.rerender(<StintStream stint={current} replay />);
  expect(screen.queryByRole("button", { name: /Allow once/ })).not.toBeInTheDocument();
  view.rerender(<StintStream stint={{ ...current, status: "interrupted" }} />);
  expect(screen.queryByRole("button", { name: /Allow once/ })).not.toBeInTheDocument();
  view.rerender(
    <StintStream
      stint={stint([
        bound,
        selected,
        { type: "permission_delivery", requestId: "request", attemptId: "new", outcome: "failed" },
      ])}
    />,
  );
  expect(screen.queryByRole("button", { name: /Allow once/ })).not.toBeInTheDocument();
  expect(screen.getByText("Could not answer permission request.")).toHaveAttribute(
    "role",
    "status",
  );
});
