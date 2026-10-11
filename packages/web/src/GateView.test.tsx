// SPDX-License-Identifier: Apache-2.0
import {
  createMemoryRepoFiles,
  deriveAttentionItems,
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

function reviewItem() {
  const item = project("review").workItems[0];
  item.headCommit = "head";
  item.evidenceChangedPaths = { reviewed: [".scratch/first/review.yaml"] };
  item.stints = [{ ...stint, stage: "review", findings: { commit: "reviewed", findings: [] } }];
  item.checkCommands = [{ name: "Test", command: "node test.cjs" }];
  item.checks = [
    {
      ...item.checkCommands[0],
      status: "passed",
      commit: "reviewed",
      durationMs: 1,
      outputExcerpt: "OK",
    },
  ];
  return item;
}

test("Review lists every evidence condition with state and an actionable remedy", () => {
  const item = reviewItem();
  item.stints[0].findings = {
    commit: "reviewed",
    findings: [
      {
        id: "finding",
        axis: "Spec",
        severity: "major",
        path: "src/file.ts",
        line: 1,
        title: "Fix input",
        body: "Bound input.",
      },
    ],
  };
  item.checks = [];
  item.memoryProposals = [
    {
      kind: "memory-proposal",
      id: "proposal",
      workItem: "first",
      ticket: null,
      stintId: stint.id,
      agent: "codex",
      title: "Memory proposal",
      details: "Decide",
      raisedAt: stint.endedAt as string,
      path: "GLOSSARY.md",
      diff: "diff",
      baseCommit: "base",
      checkpointCommit: "head",
    },
  ];
  render(<GateView item={item} />);
  const conditions = within(screen.getByRole("list", { name: "Review gate conditions" }));
  expect(conditions.getAllByRole("listitem")).toHaveLength(5);
  expect(conditions.getByText("Latest Review stint finished").closest("li")).toHaveTextContent(
    "Ready",
  );
  expect(
    conditions.getByText("Every finding resolved or accepted").closest("li"),
  ).toHaveTextContent("Blocked");
  expect(conditions.getByText("Every configured check passing").closest("li")).toHaveTextContent(
    "Blocked",
  );
  expect(conditions.getByText("No stale evidence").closest("li")).toHaveTextContent("Blocked");
  expect(conditions.getByText("No open memory proposals").closest("li")).toHaveTextContent(
    "Blocked",
  );
  expect(conditions.getByText(/Resolve or accept each current finding/)).toBeInTheDocument();
  expect(conditions.getByText(/Run all configured checks/)).toBeInTheDocument();
  expect(conditions.getByText(/Start a new Review stint and rerun checks/)).toBeInTheDocument();
  expect(conditions.getByText(/Accept or reject every open memory proposal/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve Review" })).toBeDisabled();
});

test("fresh bookkeeping evidence enables Review approval, but the server's refusal is shown", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response('{"reason":"Review evidence became stale"}', { status: 409 }),
      ),
  );
  render(<GateView item={reviewItem()} />);
  const conditions = within(screen.getByRole("list", { name: "Review gate conditions" }));
  expect(conditions.getAllByText("No action needed.")).toHaveLength(5);
  const approve = screen.getByRole("button", { name: "Approve Review" });
  expect(approve).toBeEnabled();
  await user.click(approve);
  expect(fetch).toHaveBeenCalledWith(
    "/api/work-items/first/gates/review/approve",
    expect.objectContaining({ method: "POST" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Review evidence became stale");
  expect(screen.queryByText(/Gate approved/)).not.toBeInTheDocument();
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

test.each([
  ["spec", "Spec", "spec.md exists and parses", ".scratch/first/spec.md"],
  [
    "tickets",
    "Tickets",
    "At least one ticket, no ticket warnings, valid dependency order",
    ".scratch/first/issues/",
  ],
])(
  "%s lists its output condition, state and action alongside the stage evidence",
  (stage, name, label, path) => {
    const snapshot = project(stage);
    const item = snapshot.workItems[0];
    item.stints = [{ ...stint, stage, ticket: null }];
    const valid = { ...item };
    if (stage === "spec") item.spec = null;
    else item.tickets = [];
    const { rerender } = render(<GateView item={item} />);
    const conditions = within(screen.getByRole("list", { name: `${name} gate conditions` }));
    expect(conditions.getByText(label).closest("li")).toHaveTextContent("Blocked");
    expect(
      conditions.getByText(new RegExp(`Write or ${stage === "spec" ? "edit" : "fix"}`)),
    ).toHaveTextContent(path);
    expect(screen.getByRole("button", { name: `Approve ${name}` })).toBeDisabled();
    rerender(<GateView item={valid} />);
    expect(conditions.getByText(label).closest("li")).toHaveTextContent("Ready");
    expect(conditions.getByText("No action needed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Approve ${name}` })).toBeEnabled();
  },
);

test("the Needs-you gate uses the workflow's customised gate kind", async () => {
  const snapshot = project("implement");
  const definition = snapshot.workflows.feature;
  snapshot.workflows = {
    ...snapshot.workflows,
    feature: {
      ...definition,
      stages: definition.stages.map((stage) =>
        stage.id === "implement" ? { ...stage, gate: "spec" as const } : stage,
      ),
    },
  };
  snapshot.workItems[0].stints = [
    { ...stint, handoff: stint.handoff ? { ...stint.handoff, unresolved: "None" } : null },
  ];
  snapshot.workItems[0].tickets[0].resolved = false;
  snapshot.attentionItems = deriveAttentionItems(snapshot);
  render(<Board snapshot={snapshot} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Needs you 1" }));
  const queue = within(screen.getByRole("dialog", { name: "Needs you 1" }));
  expect(queue.getByText("spec.md exists and parses").closest("li")).toHaveTextContent("Ready");
  expect(queue.getByRole("button", { name: "Approve Implement" })).toBeEnabled();
});

test.each([
  ["spec", "Spec", ".scratch/first/spec.md"],
  ["tickets", "Tickets", ".scratch/first/issues/"],
])("%s output in another folder leaves the gate naming the expected path", (stage, name, path) => {
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/workflow.yaml": `workflow: feature\nstage: ${stage}\n`,
      ".scratch/wrong/spec.md": "# Wrong folder",
      ".scratch/wrong/issues/01-first.md": "# First\nStatus: ready-for-agent\nBlocked by: none",
    }),
    { name: "Test" },
  );
  const item = snapshot.workItems.find(({ slug }) => slug === "first");
  expect(item).toBeDefined();
  if (!item) throw new Error("Fixture work item is missing.");
  item.stints = [{ ...stint, stage, ticket: null }];
  render(<GateView item={item} />);
  expect(screen.getByRole("status")).toHaveTextContent(path);
  expect(screen.getByRole("list", { name: `${name} gate conditions` })).toHaveTextContent(path);
  expect(screen.getByRole("button", { name: `Approve ${name}` })).toBeDisabled();
});
