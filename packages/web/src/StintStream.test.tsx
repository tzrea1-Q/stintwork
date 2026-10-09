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
afterEach(() => vi.unstubAllGlobals());

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
    const { rerender } = render(<StintStream stint={stint([request])} />);
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
