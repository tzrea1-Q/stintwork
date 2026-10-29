// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { parse } from "yaml";
import { deriveAttentionItems } from "./attention.js";
import { gateReadiness, workflowGate, type GateRecord } from "./gates.js";
import { indexProject } from "./project.js";
import type { StintSummary } from "./stints.js";
import { createMemoryRepoFiles } from "./work-items.js";
import type { StageId, WorkflowId } from "./workflows.js";

function item(stage: StageId, workflow: WorkflowId = "feature") {
  const workItem = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/workflow.yaml": `workflow: ${workflow}\nstage: ${stage}`,
      ".scratch/first/spec.md": "# First",
      ".scratch/first/issues/01-first.md": "# First\nStatus: resolved\nBlocked by: none",
    }),
    { name: "Test" },
  ).workItems[0];
  workItem.headCommit = "checkpoint";
  workItem.checkCommands = [];
  workItem.riskyPaths = [];
  return workItem;
}
function stint(stage: StageId, overrides: Partial<StintSummary> = {}): StintSummary {
  return {
    id: "stint",
    workItem: "first",
    stage,
    ticket: null,
    agent: "codex",
    status: "finished",
    startedAt: "2026-10-09T10:00:00Z",
    endedAt: "2026-10-09T10:05:00Z",
    checkpointCommit: "checkpoint",
    handoff: {
      stint: "stint",
      agent: "codex",
      stoppedAt: "Finished",
      unresolved: "None",
      nextStep: "Approve",
    },
    ...(stage === "review" ? { findings: { commit: "checkpoint", findings: [] } } : {}),
    ...overrides,
  };
}

test("GitHub readiness requires fresh complete detail and current preceding approvals", () => {
  const workItem = item("implement");
  workItem.github = {
    repository: "a/b",
    repositoryId: "R",
    issueId: "I",
    number: 1,
    url: "https://github.com/a/b/issues/1",
    complete: true,
    reviewDigest: "digest",
  };
  const preceding = ["clarify", "spec", "tickets"];
  for (const stage of preceding) workItem.stages[stage] = { approved: { remoteState: "current" } };
  expect(gateReadiness(workItem).ready).toBe(true);
  for (const state of ["stale", "unknown"]) {
    workItem.stages.spec = { approved: { remoteState: state } };
    expect(gateReadiness(workItem).ready).toBe(false);
  }
  workItem.stages.spec = { approved: { remoteState: "current" } };
  workItem.github.complete = false;
  expect(gateReadiness(workItem).ready).toBe(false);
  workItem.github.complete = true;
  delete workItem.github.reviewDigest;
  expect(gateReadiness(workItem).ready).toBe(false);
});

test("GitHub reopen and re-approval preserve the reopened record", () => {
  const remote = { version: 1 as const, parentId: "I", digest: "sha256:test" };
  const original = { by: "Developer", at: "2026-01-01T00:00:00Z", commit: "a", remote };
  const reopened = { by: "Developer", at: "2026-01-02T00:00:00Z", commit: "b", remote };
  const approved = { by: "Developer", at: "2026-01-03T00:00:00Z", commit: "c", remote };
  const initial = workflowGate(
    undefined,
    { workflow: "feature", stage: "clarify" },
    "clarify",
    "approve",
    original,
  );
  const afterReopen = workflowGate(
    initial,
    { workflow: "feature", stage: "spec" },
    "clarify",
    "reopen",
    reopened,
  );
  expect(parse(afterReopen).stages.clarify).toEqual({ approved: original, reopened });
  const afterApproval = workflowGate(
    afterReopen,
    { workflow: "feature", stage: "clarify" },
    "clarify",
    "approve",
    approved,
  );
  expect(parse(afterApproval).stages.clarify).toEqual({ approved, reopened });
});

test("gate refusal carries a stable message without changing its English reason", () => {
  const workItem = item("implement");
  workItem.tickets[0].resolved = false;
  const gate = gateReadiness(workItem);
  expect(gate.reason).toEqual({
    text: "Every ticket must be resolved before approving.",
    code: "gate.ticketsUnresolved",
  });
});

test.each([
  ["shipped", "This work item is shipped.", "workItem.shipped"],
  ["ship", "This stage has no approval gate.", "gate.noApproval"],
  [
    "running",
    "A stint is running on this work item. Finish or stop it before approving.",
    "gate.running",
  ],
  ["unfinished", "The stage stint must finish before approving.", "gate.stintUnfinished"],
  ["handoff", "The finished stage stint needs a handoff before approving.", "gate.handoffMissing"],
  [
    "reopened",
    "Start a new Review stint after reopening or entering Review.",
    "gate.reviewRestart",
  ],
])("%s gate refusal keeps English and supplies its code", (state, reason, code) => {
  const workItem = item(state === "ship" ? "ship" : state === "reopened" ? "review" : "clarify");
  if (state === "shipped") workItem.merged = { at: "now", commit: "head" };
  if (state === "running") workItem.stints = [stint("clarify", { status: "running" })];
  if (state === "handoff") workItem.stints = [stint("clarify", { handoff: null })];
  if (state === "reopened") {
    workItem.stints = [stint("review")];
    workItem.stages.review = {
      reopened: { at: "2026-10-09T10:06:00Z", by: "You", commit: "head" },
    };
  }
  const gate = gateReadiness(workItem);
  expect(gate.reason).toEqual({
    text: reason,
    code,
  });
});

test.each([
  ["implement", "feature"],
  ["fix", "bug"],
  ["do", "quick"],
] as const)("%s needs every ticket resolved and no active stint", (stage, workflow) => {
  const workItem = item(stage, workflow);
  expect(gateReadiness(workItem)).toMatchObject({ ready: true, nextStage: "review" });
  workItem.tickets[0].resolved = false;
  expect(gateReadiness(workItem).ready).toBe(false);
  workItem.tickets[0].resolved = true;
  workItem.stints = [stint(stage, { ticket: 1, status: "running" })];
  expect(gateReadiness(workItem).reason?.text).toContain("stint is running");
});

test.each([
  ["implement", "feature"],
  ["fix", "bug"],
  ["do", "quick"],
] as const)(
  "%s without tickets needs its latest stage stint finished with a handoff",
  (stage, workflow) => {
    const workItem = item(stage, workflow);
    workItem.spec = null;
    workItem.tickets = [];
    expect(gateReadiness(workItem)).toMatchObject({
      ready: false,
      reason: {
        text: "The stage stint must finish before approving.",
        code: "gate.stintUnfinished",
      },
    });
    workItem.stints = [stint(stage)];
    expect(gateReadiness(workItem)).toMatchObject({
      ready: true,
      nextStage: "review",
      conditions: [
        {
          id: "output",
          ready: true,
          label: {
            text: "Developer approval; no file output required",
            code: "gate.manualApproval",
          },
        },
      ],
    });
    for (const overrides of [
      { status: "stopped" },
      { status: "failed" },
      { status: "interrupted" },
      { handoff: null },
      { stage: "review" },
    ] as Partial<StintSummary>[]) {
      workItem.stints = [stint(stage, overrides)];
      expect(gateReadiness(workItem).ready).toBe(false);
    }
    workItem.stints = [stint(stage, { status: "failed" }), stint(stage)];
    expect(gateReadiness(workItem).ready).toBe(false);
    workItem.stints = [stint(stage)];
    workItem.stages[stage] = {
      reopened: { by: "Developer", at: "2026-10-09T10:06:00Z", commit: "checkpoint" },
    };
    expect(gateReadiness(workItem).ready).toBe(false);
    workItem.stints = [stint(stage, { endedAt: "2026-10-09T10:07:00Z" })];
    expect(gateReadiness(workItem).ready).toBe(true);
    workItem.stints = [stint(stage, { status: "running" })];
    expect(gateReadiness(workItem).reason?.text).toContain("stint is running");
  },
);

test.each(["clarify", "spec", "tickets", "diagnose"] as const)(
  "%s needs its latest stage stint finished with a handoff",
  (stage) => {
    const workItem = item(stage, stage === "diagnose" ? "bug" : "feature");
    expect(gateReadiness(workItem).ready).toBe(false);
    workItem.stints = [stint(stage)];
    expect(gateReadiness(workItem).ready).toBe(true);
    for (const overrides of [
      { status: "stopped" },
      { status: "failed" },
      { status: "interrupted" },
      { handoff: null },
      { stage: "review" },
    ] as Partial<StintSummary>[]) {
      workItem.stints = [stint(stage, overrides)];
      expect(gateReadiness(workItem).ready).toBe(false);
    }
    workItem.stints = [stint(stage, { status: "failed" }), stint(stage)];
    expect(gateReadiness(workItem).ready).toBe(false);
  },
);

test("Review requires a finished stage stint, but not a handoff; Ship has no M3 approval", () => {
  const workItem = item("review");
  expect(gateReadiness(workItem).ready).toBe(false);
  workItem.stints = [stint("review", { handoff: null })];
  expect(gateReadiness(workItem)).toMatchObject({ ready: true, nextStage: "ship" });
  workItem.stints = [stint("review", { handoff: null, ticket: 1 })];
  expect(gateReadiness(workItem).ready).toBe(true);
  for (const status of ["stopped", "failed", "interrupted", "running"] as const) {
    workItem.stints = [stint("review", { status })];
    expect(gateReadiness(workItem).ready).toBe(false);
  }
  expect(gateReadiness(item("ship")).ready).toBe(false);
  const unstaged = item("clarify");
  unstaged.stage = undefined;
  expect(gateReadiness(unstaged).ready).toBe(false);
});

test("a reopened stage needs fresh stint evidence; build gates stay ticket-derived", () => {
  const workItem = item("spec");
  workItem.stages.spec = { reopened: { by: "You", at: "2026-10-09T10:06:00Z", commit: "head" } };
  workItem.stints = [stint("spec")];
  expect(gateReadiness(workItem).ready).toBe(false);
  workItem.stints = [stint("spec", { endedAt: "2026-10-09T10:07:00Z" })];
  expect(gateReadiness(workItem).ready).toBe(true);
  const review = item("review");
  review.stages.implement = { approved: { by: "You", at: "2026-10-09T10:06:00Z", commit: "head" } };
  review.stints = [stint("review")];
  expect(gateReadiness(review).ready).toBe(false);
  expect(gateReadiness(review).conditions[0].action.text).toContain("Start a new Review stint");
  review.stages.review = { reopened: { at: "2026-10-09T10:06:00Z" } };
  expect(gateReadiness(review).conditions[0].action.text).toContain("Start a new Review stint");
  review.stints = [stint("review", { endedAt: "2026-10-09T10:07:00Z" })];
  expect(gateReadiness(review).ready).toBe(true);
});

test("ready gates are stable source-derived attention items and disappear when not ready", () => {
  const workItem = item("implement");
  workItem.stints = [stint("implement", { ticket: 1 })];
  const snapshot = { workItems: [workItem] };
  const [attention] = deriveAttentionItems(snapshot);
  expect(attention).toMatchObject({
    kind: "gate-ready",
    stage: "implement",
    workItem: "first",
    ticket: null,
    stintId: "stint",
    agent: "codex",
    raisedAt: "2026-10-09T10:05:00Z",
  });
  expect(deriveAttentionItems(snapshot)[0].id).toBe(attention.id);
  workItem.tickets[0].resolved = false;
  expect(deriveAttentionItems(snapshot)).toEqual([]);
});

test("gate writes preserve YAML preferences, record evidence and create inferred workflows", () => {
  const workItem = item("implement");
  const record = { by: "You", at: "2026-10-09T11:00:00Z", commit: "head" };
  const text =
    "# Preference\nworkflow: feature\nstage: implement\nmilestone: M3\nstages:\n  implement:\n    agent: claude\n  custom:\n    note: retained\n";
  const approved = workflowGate(text, workItem, "implement", "approve", record);
  expect(approved).toContain("# Preference");
  expect(parse(approved)).toMatchObject({
    stage: "review",
    milestone: "M3",
    stages: { implement: { agent: "claude", approved: record }, custom: { note: "retained" } },
  });
  expect(
    parse(workflowGate(approved, { ...workItem, stage: "review" }, "implement", "reopen", record)),
  ).toMatchObject({
    stage: "implement",
    stages: { implement: { approved: record, reopened: record } },
  });
  expect(parse(workflowGate(undefined, workItem, "implement", "approve", record))).toMatchObject({
    workflow: "feature",
    stage: "review",
  });
  expect(() => workflowGate("workflow: [", workItem, "implement", "approve", record)).toThrow(
    "valid",
  );
  expect(() => workflowGate(text, workItem, "review", "approve", record)).toThrow("current");
});

test("gate records preserve versioned GitHub evidence in YAML", () => {
  const record: GateRecord = {
    by: "Developer",
    at: "2026-10-28T12:00:00.000Z",
    commit: "a".repeat(40),
    remote: { version: 1, parentId: "I_1", digest: `sha256:${"b".repeat(64)}` },
  };
  const text = "workflow: feature\nstage: implement\ngithub:\n  issueId: I_1\n";
  expect(parse(workflowGate(text, item("implement"), "implement", "approve", record))).toEqual({
    workflow: "feature",
    stage: "review",
    github: { issueId: "I_1" },
    stages: { implement: { approved: record } },
  });
});

test("only stale local approvals before the current stage need attention", () => {
  const workItem = item("tickets");
  const approval = {
    by: "Developer",
    at: "2026-10-29T12:00:00Z",
    commit: "abc",
    state: "stale",
    stateReason: "head-changed",
  };
  workItem.stages.spec = { approved: approval };
  const stale = () =>
    deriveAttentionItems({ workItems: [workItem] }).filter(({ kind }) => kind === "approval-stale");
  expect(stale()).toEqual([
    {
      kind: "approval-stale",
      workItem: "first",
      stage: "spec",
      ticket: null,
      stintId: null,
      agent: null,
      id: 'approval-stale:["first","spec","2026-10-29T12:00:00Z","abc"]',
      title: "Spec approval is stale",
      details:
        "HEAD changed while the approval was recorded. Reopen Spec to review the newer commits.",
      raisedAt: approval.at,
    },
  ]);
  workItem.stage = "spec";
  expect(stale()).toEqual([]);
  workItem.stage = "tickets";
  workItem.stages.spec = {
    approved: { by: approval.by, at: approval.at, commit: approval.commit },
  };
  expect(stale()).toEqual([]);
  workItem.stages.spec = { approved: approval };
  workItem.merged = { at: approval.at, commit: "abc" };
  expect(stale()).toEqual([]);
  delete workItem.merged;
  workItem.github = {
    repository: "a/b",
    repositoryId: "R",
    issueId: "I",
    number: 1,
    url: "https://github.com/a/b/issues/1",
    complete: true,
  };
  expect(stale()).toEqual([]);
});

test("stale approval identity changes with the recorded approval and invalid dates fall back", () => {
  const workItem = item("tickets");
  const approved = {
    by: "Developer",
    at: "2026-10-29T12:00:00Z",
    commit: "abc",
    state: "stale",
    stateReason: "head-changed",
  };
  workItem.stages.spec = { approved };
  const stale = () =>
    deriveAttentionItems({ workItems: [workItem] }).find(({ kind }) => kind === "approval-stale");
  const first = stale();
  approved.at = "2026-10-29T12:01:00Z";
  expect(stale()?.id).not.toBe(first?.id);
  const second = stale();
  approved.commit = "def";
  expect(stale()?.id).not.toBe(second?.id);
  approved.at = "not a date";
  expect(stale()?.raisedAt).toBe("1970-01-01T00:00:00.000Z");
});
