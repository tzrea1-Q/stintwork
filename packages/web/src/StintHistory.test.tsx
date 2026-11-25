// SPDX-License-Identifier: Apache-2.0
import {
  createMemoryRepoFiles,
  foldStintLog,
  indexProject,
  type Stint,
  type StintLogEntry,
  type StintStatus,
  summarizeStint,
} from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { LanguageProvider } from "./i18n/language";
import { en } from "./i18n/en";
import { zhCN } from "./i18n/zh-CN";
import { fullTime } from "./time";
import { HandoffCard } from "./HandoffCard";
import { StintHistory } from "./StintHistory";
import { WorkItemDrawer } from "./WorkItemDrawer";

test("GitHub history labels tickets with a hash", () => {
  render(<StintHistory stints={[summarizeStint(stint("github"))]} github />);
  expect(screen.getByRole("list", { name: "Stint history" })).toHaveTextContent("Ticket #1");
});

function stint(id: string, status: StintStatus = "finished", ticket: number | null = 1): Stint {
  const entries: StintLogEntry[] = [
    {
      type: "started",
      at: "2026-10-09T10:00:00Z",
      stint: {
        id,
        workItem: "first",
        stage: "implement",
        ticket,
        agent: "codex",
        worktree: { path: "/worktree", branch: "stintwork/first" },
        baseCommit: "base",
        brief: { skill: null, pointers: [], lastHandoff: null, changedPaths: [], prompt: "Brief" },
      },
    },
    {
      type: "event",
      at: "2026-10-09T10:00:01Z",
      event: { type: "message_delta", id: "message", text: "Full " },
    },
    {
      type: "event",
      at: "2026-10-09T10:00:02Z",
      event: { type: "message_delta", id: "message", text: "recorded stream" },
    },
    {
      type: "event",
      at: "2026-10-09T10:00:03Z",
      event: { type: "thought_delta", id: "thought", text: "Consider the change" },
    },
    {
      type: "event",
      at: "2026-10-09T10:00:04Z",
      event: {
        type: "plan",
        id: "plan",
        entries: [{ content: "Edit file", priority: "high", status: "completed" }],
      },
    },
    {
      type: "event",
      at: "2026-10-09T10:00:05Z",
      event: {
        type: "tool_call",
        toolCallId: "edit",
        title: "Write file",
        kind: "edit",
        status: "completed",
        content: [{ type: "text", text: "Recorded tool output" }],
      },
    },
    {
      type: "event",
      at: "2026-10-09T10:00:06Z",
      event: {
        type: "file_edit",
        toolCallId: "edit",
        path: "/worktree/hello.txt",
        oldText: null,
        newText: "Hello",
      },
    },
    {
      type: "event",
      at: "2026-10-09T10:00:07Z",
      event: {
        type: "permission_request",
        requestId: "permission",
        toolCallId: "git",
        title: "git add",
        kind: "execute",
        automatic: false,
        options: [{ optionId: "allow", name: "Proceed", kind: "allow_once" }],
      },
    },
  ];
  if (status !== "running")
    entries.push({
      type: "ended",
      at: "2026-10-09T10:01:00Z",
      status,
      checkpointCommit: `checkpoint-${id}`,
      handoff:
        status === "interrupted"
          ? null
          : {
              stint: id,
              agent: "codex",
              stoppedAt: "Recorded **handoff**",
              unresolved: "Check the result",
              nextStep: "Continue from the checkpoint",
            },
    });
  return foldStintLog(entries) as Stint;
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

test("the drawer lists every stint in snapshot order with agent, ticket, status, times and checkpoint", async () => {
  const item = indexProject(createMemoryRepoFiles({ ".scratch/first/spec.md": "# First" }), {
    name: "Project",
  }).workItems[0];
  const stints = [
    stint("interrupted", "interrupted"),
    stint("failed", "failed"),
    stint("stopped", "stopped"),
    stint("finished"),
    stint("active", "running", null),
  ];
  render(
    <WorkItemDrawer item={{ ...item, stints: stints.map(summarizeStint) }} onClose={() => {}} />,
  );
  await userEvent.click(screen.getByRole("tab", { name: "Stints" }));
  const rows = within(screen.getByRole("list", { name: "Stint history" })).getAllByRole("listitem");
  expect(rows).toHaveLength(stints.length);
  for (const [index, recorded] of stints.entries()) {
    expect(rows[index]).toHaveTextContent(
      `Codex · ${recorded.ticket === null ? "No ticket" : "Ticket 01"} · ${recorded.status}`,
    );
    expect(rows[index].querySelector("time")?.getAttribute("dateTime")).toBe(recorded.startedAt);
    if (recorded.endedAt) {
      expect(rows[index].querySelectorAll("time")[1].getAttribute("dateTime")).toBe(
        recorded.endedAt,
      );
      expect(rows[index]).toHaveTextContent(
        `Checkpoint commit: ${recorded.checkpointCommit?.slice(0, 7)}`,
      );
    } else expect(rows[index]).toHaveTextContent("No checkpoint recorded.");
  }
});

test("opening a past stint replays its full log stream and the log's handoff, without Stop or permission actions", async () => {
  const user = userEvent.setup();
  const recorded = stint("past");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ stint: recorded }))),
  );
  render(<StintHistory stints={[{ ...summarizeStint(recorded), handoff: null }]} />);
  expect(screen.queryByRole("log")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Open stint past" }));
  const stream = await screen.findByRole("log", { name: "Stint messages" });
  expect(fetch).toHaveBeenCalledWith("/api/stints/past", { signal: expect.any(AbortSignal) });
  expect(stream).toHaveTextContent("Full recorded stream");
  expect(stream).toHaveTextContent("Consider the change");
  expect(stream).toHaveTextContent("Write file");
  expect(stream).toHaveTextContent("/worktree/hello.txt");
  expect(screen.getByRole("region", { name: "Stint plan" })).toHaveTextContent("Edit file");
  expect(screen.getByRole("article", { name: "Handoff" })).toHaveTextContent("Recorded handoff");
  expect(screen.getByRole("article", { name: "Handoff" })).toHaveTextContent("Check the result");
  expect(screen.getByRole("article", { name: "Handoff" })).toHaveTextContent(
    "Continue from the checkpoint",
  );
  expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Allow once/ })).not.toBeInTheDocument();
  const output = within(stream).getByRole("button", { name: "Tool output" });
  expect(output).toHaveAttribute("aria-expanded", "false");
  await user.click(output);
  expect(output).toHaveAttribute("aria-expanded", "true");
  expect(stream).toHaveTextContent("Recorded tool output");
  await user.click(output);
  expect(output).toHaveAttribute("aria-expanded", "false");
  await user.click(screen.getByRole("button", { name: "Close stint past" }));
  expect(screen.queryByRole("log")).not.toBeInTheDocument();
});

test("replaying an unfinished log is read-only even if it contains an unanswered permission request", async () => {
  const user = userEvent.setup();
  const recorded = stint("active", "running");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ stint: recorded }))),
  );
  render(<StintHistory stints={[summarizeStint(recorded)]} />);
  await user.click(screen.getByRole("button", { name: "Open stint active" }));
  expect(await screen.findByRole("log")).toHaveTextContent("No answer recorded.");
  expect(screen.queryByRole("button", { name: /Allow once/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Streaming live/)).not.toBeInTheDocument();
});

test("history loading failures are visible and can be retried; interrupted replay has no invented handoff", async () => {
  const user = userEvent.setup();
  const recorded = stint("interrupted", "interrupted");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reason: "Cannot read stint log." }), { status: 503 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ stint: recorded }))),
  );
  render(<StintHistory stints={[summarizeStint(recorded)]} />);
  await user.click(screen.getByRole("button", { name: "Open stint interrup" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Cannot read stint log.");
  await user.click(screen.getByRole("button", { name: "Open stint interrup" }));
  expect(await screen.findByRole("log")).toHaveTextContent("Full recorded stream");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Handoff" })).toHaveTextContent(
    "No handoff was given.",
  );
});

test("an empty history says no stints yet", () => {
  render(<StintHistory stints={[]} />);
  expect(screen.getByText("No stints yet.")).toBeInTheDocument();
});

test("the handoff card shows the recorded failure reason as text", () => {
  const summary = {
    ...summarizeStint(stint("stopped", "stopped")),
    handoff: null,
    handoffError: "Agent was still settling <script>the cancelled patch</script>.",
  };
  render(<HandoffCard stint={summary} />);
  expect(screen.getByRole("article", { name: "Handoff" })).toHaveTextContent(
    `No handoff was given: ${summary.handoffError}`,
  );
  expect(document.querySelector("script")).toBeNull();
});

test("a stale replay cannot show a finished stint as still running, and retry reads the ending", async () => {
  const user = userEvent.setup();
  const finished = stint("stale");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ stint: stint("stale", "running") })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stint: finished }))),
  );
  render(<StintHistory stints={[summarizeStint(finished)]} />);
  await user.click(screen.getByRole("button", { name: "Open stint stale" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Stint history is not up to date. Try again.",
  );
  expect(screen.queryByRole("log")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Open stint stale" }));
  expect(await screen.findByRole("log")).toHaveTextContent("Full recorded stream");
  expect(screen.getByRole("status", { name: "Stint" })).toHaveTextContent("Stint finished");
});

test("an open replay refreshes its stream, status and checkpoint when the snapshot records the stint ending", async () => {
  const user = userEvent.setup();
  const active = stint("changing", "running");
  const interrupted = stint("changing", "interrupted");
  interrupted.events.push({
    type: "message",
    id: "final",
    text: "Last message before interruption",
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ stint: active })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stint: interrupted }))),
  );
  const { rerender } = render(<StintHistory stints={[summarizeStint(active)]} />);
  await user.click(screen.getByRole("button", { name: "Open stint changing" }));
  expect(await screen.findByRole("log")).toHaveTextContent("Full recorded stream");
  rerender(<StintHistory stints={[summarizeStint(interrupted)]} />);
  expect(await screen.findByText("Last message before interruption")).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Stint history" })).toHaveTextContent(
    "Codex · Ticket 01 · interrupted",
  );
  expect(screen.getByRole("article", { name: "Handoff" })).toHaveTextContent(
    "Checkpoint commit: checkpo",
  );
  expect(screen.getByRole("status", { name: "Stint" })).toHaveTextContent("Stint interrupted");
});

test.each([
  ["en", en, "2 hours ago"],
  ["zh-CN", zhCN, "2小时前"],
] as const)("stint details are formatted in %s", (language, t, relative) => {
  localStorage.setItem("stintwork.language", language);
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-09T12:00:00Z"));
  const recorded = stint("12345678-1234-1234-1234-123456789abc");
  recorded.checkpointCommit = "0123456789abcdef0123456789abcdef01234567";
  render(
    <LanguageProvider>
      <StintHistory
        stints={[summarizeStint(recorded)]}
        agents={[{ id: "codex", displayName: "My Agent" } as never]}
      />
    </LanguageProvider>,
  );
  const row = screen.getByRole("listitem");
  expect(row).toHaveTextContent("My Agent");
  expect(row).toHaveTextContent(relative);
  expect(row).toHaveTextContent(language === "en" ? "1 min" : "1 分钟");
  expect(row.querySelectorAll("time")[0]).toHaveAttribute(
    "title",
    fullTime(recorded.startedAt, language),
  );
  expect(row.querySelectorAll("time")[1]).toHaveAttribute(
    "title",
    fullTime(recorded.endedAt as string, language),
  );
  expect(screen.getByRole("button", { name: t.stints.openStint("12345678") })).toBeInTheDocument();
  expect(screen.getByText("0123456")).toHaveAttribute("title", recorded.checkpointCommit);
  expect(
    screen.getByRole("button", { name: t.review.diff.copyHash(t.stints.checkpointCommit) }),
  ).toBeInTheDocument();
  const grid = screen.getByRole("article").querySelector("dl") as HTMLElement;
  expect(grid).toHaveClass("grid");
  expect(Array.from(grid.children).map((element) => element.tagName)).toEqual([
    "DT",
    "DD",
    "DT",
    "DD",
    "DT",
    "DD",
  ]);
  localStorage.removeItem("stintwork.language");
  vi.restoreAllMocks();
});

test("empty stint history uses Empty", () => {
  const { container } = render(<StintHistory stints={[]} />);
  expect(container.querySelector('[data-slot="empty"]')).toHaveTextContent("No stints yet.");
});

test.each([
  ["en", en],
  ["zh-CN", zhCN],
] as const)("ticket statuses use the catalog in %s", async (language, t) => {
  localStorage.setItem("stintwork.language", language);
  const item = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First",
      ".scratch/first/issues/01-test.md": "# Test\n\nStatus: ready-for-agent\nBlocked by: none\n",
    }),
    { name: "Project" },
  ).workItems[0];
  const template = item.tickets[0];
  item.tickets = [...Object.keys(t.stints.ticketStatuses), "unrecognized-status"].map(
    (status, index) => ({
      ...template,
      path: `ticket-${index}`,
      number: index + 1,
      title: `Ticket ${index}`,
      status,
      resolved: false,
    }),
  );
  render(
    <LanguageProvider>
      <WorkItemDrawer item={item} onClose={() => {}} />
    </LanguageProvider>,
  );
  await userEvent.click(screen.getByRole("tab", { name: t.detailTabs.tickets }));
  for (const [index, [status, label]] of Object.entries(t.stints.ticketStatuses).entries()) {
    const row = screen.getByRole("button", { name: new RegExp(`Ticket ${index}\\b`) });
    expect(row).toHaveTextContent(label);
    expect(row).not.toHaveTextContent(status === label ? "impossible-raw-status" : status);
  }
  expect(screen.getByTitle("unrecognized-status")).toHaveTextContent(t.stints.otherTicketStatus);
  localStorage.removeItem("stintwork.language");
});

test("spec contents disclosure toggles", async () => {
  const item = indexProject(
    createMemoryRepoFiles({ ".scratch/first/spec.md": "# First\n\n## Details\nText" }),
    { name: "Project" },
  ).workItems[0];
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  await userEvent.click(screen.getByRole("tab", { name: "Spec" }));
  const button = screen.getByRole("button", { name: "Contents" });
  expect(button).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
});
