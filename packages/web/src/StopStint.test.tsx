// SPDX-License-Identifier: Apache-2.0
import {
  applyStintLogEntry,
  createMemoryRepoFiles,
  indexProject,
  summarizeStint,
  type Stint,
} from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { StintStream } from "./StintStream";
import { StopStint } from "./StopStint";
import { WorkItemDrawer } from "./WorkItemDrawer";

const item = indexProject(
  createMemoryRepoFiles({
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/05-stop.md": "# Stop\nStatus: ready-for-agent\nBlocked by: none",
  }),
  { name: "Project" },
).workItems[0];
const stint = applyStintLogEntry(null, {
  type: "started",
  at: "2026-10-09T10:00:00Z",
  stint: {
    id: "first",
    workItem: "first",
    stage: "implement",
    ticket: 5,
    agent: "codex",
    worktree: { path: "/worktree", branch: "stintwork/first" },
    baseCommit: "base",
    brief: { skill: null, pointers: [], lastHandoff: null, changedPaths: [], prompt: "Brief" },
  },
}) as Stint;

afterEach(() => vi.unstubAllGlobals());

test("the drawer's Stop posts the stint id, prevents duplicate clicks, and shows stopped history with its checkpoint and handoff", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(url === "/api/agents" ? { agents: [] } : { stintId: stint.id }),
          { status: url === "/api/agents" ? 200 : 202 },
        ),
    ),
  );
  const { rerender } = render(
    <WorkItemDrawer
      item={{ ...item, activeStint: stint, stints: [summarizeStint(stint)] }}
      onClose={() => {}}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Stop" }));
  expect(fetch).toHaveBeenCalledWith("/api/stints/first/stop", { method: "POST" });
  expect(screen.getByRole("button", { name: "Stopping stint…" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Stopping stint…" }));
  expect(fetch).toHaveBeenCalledTimes(2);
  const stopped = applyStintLogEntry(stint, {
    type: "ended",
    at: "2026-10-09T10:01:00Z",
    status: "stopped",
    checkpointCommit: "checkpoint",
    handoff: {
      stint: stint.id,
      agent: "codex",
      stoppedAt: "Partial work",
      unresolved: "Checks",
      nextStep: "Continue",
    },
  }) as Stint;
  rerender(
    <WorkItemDrawer
      item={{ ...item, activeStint: null, stints: [summarizeStint(stopped)] }}
      onClose={() => {}}
    />,
  );
  expect(screen.queryByRole("button", { name: /Stop/ })).not.toBeInTheDocument();
  const history = screen.getByRole("list", { name: "Stint history" });
  expect(history).toHaveTextContent("codex · Ticket 05 · stopped");
  expect(within(history).getByRole("article", { name: "Handoff" })).toHaveTextContent(
    "Partial work",
  );
  expect(history).toHaveTextContent("Checkpoint commit: checkpoint");
});

test("a failed Stop displays its error and lets the developer retry", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reason: "Could not cancel stint." }), { status: 503 }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 202 })),
  );
  render(<StopStint stintId="first/second" />);
  await user.click(screen.getByRole("button", { name: "Stop" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not cancel stint.");
  await user.click(screen.getByRole("button", { name: "Stop" }));
  expect(fetch).toHaveBeenLastCalledWith("/api/stints/first%2Fsecond/stop", { method: "POST" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a failed stint shows its error in history and in the stream, with its checkpoint and no handoff", () => {
  const failed = applyStintLogEntry(stint, {
    type: "ended",
    at: "2026-10-09T10:01:00Z",
    status: "failed",
    error: "Codex ACP transport closed before the stint ended.",
    checkpointCommit: "checkpoint",
    handoff: null,
  }) as Stint;
  render(
    <WorkItemDrawer item={{ ...item, stints: [summarizeStint(failed)] }} onClose={() => {}} />,
  );
  const history = screen.getByRole("list", { name: "Stint history" });
  expect(history).toHaveTextContent("codex · Ticket 05 · failed");
  expect(within(history).getByRole("alert")).toHaveTextContent(failed.error as string);
  expect(history).toHaveTextContent("No handoff was given.");
  expect(history).toHaveTextContent("Checkpoint commit: checkpoint");
  expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  render(<StintStream stint={failed} />);
  expect(
    within(screen.getByRole("log", { name: "Stint messages" })).getByRole("alert"),
  ).toHaveTextContent(failed.error as string);
  expect(screen.getByRole("status", { name: "Stint" })).toHaveTextContent("Stint failed");
});
