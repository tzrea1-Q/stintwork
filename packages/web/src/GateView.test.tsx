import {
  createMemoryRepoFiles,
  indexProject,
  type ProjectSnapshot,
  type StintSummary,
} from "@stintwork/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Board } from "./Board";
import { GateView } from "./GateView";
import { WorkItemDrawer } from "./WorkItemDrawer";

function project(stage = "implement", approved = false): ProjectSnapshot {
  return indexProject(
    createMemoryRepoFiles({
      ".scratch/first/workflow.yaml": `workflow: feature\nstage: ${stage}\n${approved ? "stages:\n  implement:\n    approved: {by: You, at: '2026-10-09T10:00:00Z', commit: checkpoint}\n" : ""}`,
      ".scratch/first/spec.md": "# First work item",
      ".scratch/first/issues/01-first.md": "# First ticket\nStatus: resolved\nBlocked by: none",
    }),
    { name: "Test" },
  );
}
const stint: StintSummary = {
  id: "finished-stint",
  workItem: "first",
  stage: "implement",
  ticket: 1,
  agent: "codex",
  status: "finished",
  startedAt: "2026-10-09T09:00:00Z",
  endedAt: "2026-10-09T09:30:00Z",
  checkpointCommit: "evidence-checkpoint",
  handoff: {
    stint: "finished-stint",
    agent: "codex",
    stoppedAt: "All edits checkpointed",
    unresolved: "Confirm the output",
    nextStep: "Approve Implement",
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

test("gate evidence shows tickets, last checkpoint, handoff and open warnings in the drawer", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"agents":[]}')));
  const item = project().workItems[0];
  item.stints = [stint];
  render(
    <WorkItemDrawer
      item={item}
      warnings={[{ path: ".scratch/first/spec.md", message: "Spec needs attention" }]}
      onClose={() => {}}
    />,
  );
  const gate = within(screen.getByRole("region", { name: "Implement gate" }));
  expect(gate.getByText("1/1 tickets resolved")).toBeInTheDocument();
  expect(gate.getByText("1 · First ticket · Resolved")).toBeInTheDocument();
  expect(gate.getAllByText("evidence-checkpoint").length).toBeGreaterThan(0);
  expect(gate.getByText("All edits checkpointed")).toBeInTheDocument();
  expect(gate.getByText("Confirm the output")).toBeInTheDocument();
  expect(gate.getByText("Spec needs attention")).toBeInTheDocument();
  expect(gate.getByRole("button", { name: "Approve Implement" })).toBeEnabled();
});

test("approving sends the action once and waits for acknowledgement", async () => {
  const user = userEvent.setup();
  let complete: (response: Response) => void = () => {};
  const fetchAction = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchAction);
  render(<GateView item={project().workItems[0]} />);
  await user.click(screen.getByRole("button", { name: "Approve Implement" }));
  expect(fetchAction).toHaveBeenCalledWith(
    "/api/work-items/first/gates/implement/approve",
    expect.objectContaining({ method: "POST", body: "{}" }),
  );
  expect(screen.getByRole("button", { name: "Approve Implement" })).toBeDisabled();
  expect(screen.queryByText(/Gate approved/)).not.toBeInTheDocument();
  complete(new Response('{"stage":"review"}'));
  expect(await screen.findByText("Gate approved. Stage advances to Review.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Approve Implement" }));
  expect(fetchAction).toHaveBeenCalledTimes(1);
});

test("reopen sends the approved earlier stage and shows confirmation", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"stage":"implement"}')));
  render(<GateView item={project("review", true).workItems[0]} />);
  await user.click(screen.getByRole("button", { name: "Reopen Implement" }));
  expect(fetch).toHaveBeenCalledWith(
    "/api/work-items/first/gates/implement/reopen",
    expect.objectContaining({ method: "POST", body: "{}" }),
  );
  expect(await screen.findByText("Implement reopened.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reopen Spec" })).not.toBeInTheDocument();
});

test.each(["approve", "reopen"])(
  "%s refusal is shown and the action can be retried",
  async (action) => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ reason: "A stint is running on this work item." }), {
          status: 409,
        }),
      ),
    );
    render(
      <GateView
        item={
          project(action === "approve" ? "implement" : "review", action === "reopen").workItems[0]
        }
      />,
    );
    const button = screen.getByRole("button", {
      name: action === "approve" ? "Approve Implement" : "Reopen Implement",
    });
    await user.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A stint is running on this work item.",
    );
    expect(button).toBeEnabled();
  },
);

test("in-progress evidence disables approval and explains the refusal", () => {
  const item = project().workItems[0];
  item.stints = [{ ...stint, status: "running", handoff: null, checkpointCommit: null }];
  render(<GateView item={item} />);
  expect(screen.getByText(/stint is running/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve Implement" })).toBeDisabled();
  expect(screen.getByText("No handoff recorded.")).toBeInTheDocument();
  expect(screen.getByText("No open warnings.")).toBeInTheDocument();
});

test("the Needs-you gate item contains evidence and an approval action", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"stage":"review"}')));
  render(<Board snapshot={project()} />);
  await user.click(screen.getByRole("button", { name: "Needs you 1" }));
  const queue = within(screen.getByRole("dialog", { name: "Needs you 1" }));
  expect(queue.getByText("Implement ready to approve")).toBeInTheDocument();
  expect(queue.getByText("1/1 tickets resolved")).toBeInTheDocument();
  expect(queue.getByText("No readiness time recorded")).toBeInTheDocument();
  await user.click(queue.getByRole("button", { name: "Approve Implement" }));
  expect(await queue.findByText("Gate approved. Stage advances to Review.")).toBeInTheDocument();
});

test("approval and reopen snapshots move the board card between Implement and Review", () => {
  const snapshot = project();
  const { rerender } = render(<Board snapshot={snapshot} />);
  const card = () => screen.getByRole("article", { name: "first: First work item" });
  expect(card().closest("[data-card-column]")).toHaveAttribute("data-card-column", "implement");
  rerender(<Board snapshot={project("review", true)} />);
  expect(card().closest("[data-card-column]")).toHaveAttribute("data-card-column", "review");
  rerender(<Board snapshot={snapshot} />);
  expect(card().closest("[data-card-column]")).toHaveAttribute("data-card-column", "implement");
});
