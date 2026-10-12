// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { parse } from "yaml";
import { deriveAttentionItems } from "./attention.js";
import { gateReadiness, workflowGate } from "./gates.js";
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
  expect(gateReadiness(workItem).reason).toContain("stint is running");
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
      reason: "The stage stint must finish before approving.",
    });
    workItem.stints = [stint(stage)];
    expect(gateReadiness(workItem)).toMatchObject({
      ready: true,
      nextStage: "review",
      conditions: [
        { id: "output", ready: true, label: "Developer approval; no file output required" },
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
    expect(gateReadiness(workItem).reason).toContain("stint is running");
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
  expect(gateReadiness(review).conditions[0].action).toContain("Start a new Review stint");
  review.stages.review = { reopened: { at: "2026-10-09T10:06:00Z" } };
  expect(gateReadiness(review).conditions[0].action).toContain("Start a new Review stint");
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
