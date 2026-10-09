import {
  applyStintLogEntry,
  createMemoryRepoFiles,
  indexProject,
  summarizeStint,
  type Stint,
  type StintLogEntry,
} from "@stintwork/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { WorkItemDrawer } from "./WorkItemDrawer";

const item = indexProject(
  createMemoryRepoFiles({
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/01-first.md":
      "# First ticket\nStatus: ready-for-agent\nBlocked by: none",
  }),
  { name: "Project" },
).workItems[0];
const brief = {
  skill: null,
  pointers: [],
  lastHandoff: null,
  changedPaths: [],
  prompt: "Exact brief",
};
const started: StintLogEntry = {
  type: "started",
  at: "2026-10-09T10:00:00Z",
  stint: {
    id: "first",
    workItem: "first",
    stage: "implement",
    ticket: 1,
    agent: "codex",
    worktree: { path: "/worktree", branch: "stintwork/first" },
    baseCommit: "base",
    brief,
  },
};
afterEach(() => vi.unstubAllGlobals());

test("Start posts ticket selection, closes the preview, and the drawer streams cumulative messages then finished history", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(brief)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ stint: applyStintLogEntry(null, started) }), { status: 201 }),
      ),
  );
  const { rerender } = render(<WorkItemDrawer item={item} onClose={() => {}} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  await screen.findByRole("button", { name: "Copy prompt" });
  expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Start" }));
  expect(fetch).toHaveBeenLastCalledWith("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  expect(screen.queryByRole("dialog", { name: "Brief preview" })).not.toBeInTheDocument();
  let stint = applyStintLogEntry(null, started) as Stint;
  let message = "";
  for (const text of ["Hello ", "world"]) {
    message += text;
    stint = applyStintLogEntry(stint, {
      type: "event",
      at: started.at,
      event: { type: "message_delta", id: "1", text },
    }) as Stint;
    rerender(
      <WorkItemDrawer
        item={{ ...item, stints: [summarizeStint(stint)], activeStint: stint }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("log", { name: "Stint messages" }).textContent).toBe(message.trim());
    expect(screen.getByRole("button", { name: "Start stint" })).toBeDisabled();
  }
  stint = applyStintLogEntry(stint, {
    type: "ended",
    at: "2026-10-09T10:01:00Z",
    status: "finished",
    checkpointCommit: "0123456789abcdef",
    handoff: {
      stint: stint.id,
      agent: stint.agent,
      stoppedAt: "Implemented **code**",
      unresolved: "Review the tests",
      nextStep: "Resume here",
    },
  }) as Stint;
  rerender(
    <WorkItemDrawer
      item={{ ...item, stints: [summarizeStint(stint)], activeStint: null }}
      onClose={() => {}}
    />,
  );
  const history = screen.getByRole("list", { name: "Stint history" });
  expect(history).toHaveTextContent("codex · Ticket 1 · finished");
  expect(history).toHaveTextContent("Started 2026-10-09T10:00:00Z · Ended 2026-10-09T10:01:00Z");
  const handoff = within(history).getByRole("article", { name: "Handoff" });
  expect(handoff).toHaveTextContent("Where I stoppedImplemented code");
  expect(handoff).toHaveTextContent("UnresolvedReview the tests");
  expect(handoff).toHaveTextContent("Suggested nextResume here");
  expect(handoff).toHaveTextContent("Checkpoint commit: 0123456789abcdef");
  expect(handoff.querySelector("strong")).toHaveTextContent("code");
  expect(screen.getByRole("button", { name: "Start stint" })).toBeEnabled();
});

test("history renders an explicit no-handoff card when the stint has none", () => {
  const stint = applyStintLogEntry(applyStintLogEntry(null, started), {
    type: "ended",
    at: "2026-10-09T10:01:00Z",
    status: "failed",
    handoff: null,
  }) as Stint;
  render(<WorkItemDrawer item={{ ...item, stints: [summarizeStint(stint)] }} onClose={() => {}} />);
  const card = screen.getByRole("article", { name: "Handoff" });
  expect(card).toHaveTextContent("No handoff was given.");
  expect(card).toHaveTextContent("No checkpoint recorded.");
});

test("a rejected start retains the copyable brief and displays the reason", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(brief)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reason: "A stint is already active for this work item." }), {
          status: 409,
        }),
      ),
  );
  render(<WorkItemDrawer item={item} onClose={() => {}} />);
  await user.click(screen.getByRole("button", { name: "Start stint" }));
  await screen.findByRole("button", { name: "Copy prompt" });
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "A stint is already active for this work item.",
  );
  expect(
    within(screen.getByRole("dialog", { name: "Brief preview" })).getByText("Exact brief"),
  ).toBeInTheDocument();
});
