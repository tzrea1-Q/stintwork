// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { stringify } from "yaml";
import { deriveAttentionItems } from "./attention.js";
import { gateReadiness } from "./gates.js";
import { indexProject } from "./project.js";
import type { StintSummary } from "./stints.js";
import { createMemoryRepoFiles } from "./work-items.js";
import { builtInWorkflows, type GateKind } from "./workflows.js";

const specPath = ".scratch/first/spec.md";
const ticketPath = ".scratch/first/issues/01-first.md";
const ticket = "# First\nStatus: ready-for-agent\nBlocked by: none";

function project(stage: string, output: Record<string, string> = {}, workflow = "feature") {
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/workflow.yaml": `workflow: ${workflow}\nstage: ${stage}`,
      ...output,
    }),
    { name: "Fixture" },
  );
  const item = snapshot.workItems[0];
  const stint: StintSummary = {
    id: "stint",
    workItem: "first",
    stage,
    ticket: null,
    agent: "codex",
    status: "finished",
    startedAt: "2026-10-10T10:00:00Z",
    endedAt: "2026-10-10T10:05:00Z",
    checkpointCommit: "head",
    handoff: {
      stint: "stint",
      agent: "codex",
      stoppedAt: "Stage finished",
      unresolved: "None",
      nextStep: "Approve",
    },
  };
  item.stints = [stint];
  return { snapshot, item };
}

test.each([
  ["clarify", "feature"],
  ["diagnose", "bug"],
  ["do", "quick"],
] as const)("manual %s has no file output requirement", (stage, workflow) => {
  const outputs: Record<string, string>[] = [{}, { [specPath]: "", [ticketPath]: "Broken" }];
  for (const output of outputs) {
    const { item } = project(stage, output, workflow);
    expect(gateReadiness(item)).toMatchObject({
      ready: true,
      conditions: expect.arrayContaining([
        {
          id: "output",
          ready: true,
          label: expect.any(String),
          action: expect.any(String),
          labelMessage: { code: "gate.manualApproval" },
          actionMessage: { code: "gate.approve" },
        },
      ]),
    });
  }
});

test.each([undefined, "", "No heading", "#   ", "# Spec\n\u0000", "# Spec\n\uFFFD"])(
  "Spec refuses missing or invalid output (%s)",
  (text) => {
    const { item, snapshot } = project("spec", text === undefined ? {} : { [specPath]: text });
    expect(gateReadiness(item)).toMatchObject({
      ready: false,
      reason: expect.stringContaining(specPath),
      conditions: [expect.objectContaining({ id: "output", ready: false })],
    });
    expect(deriveAttentionItems(snapshot).some(({ kind }) => kind === "gate-ready")).toBe(false);
  },
);

test("gate output carries typed paths and leaves parser warnings verbatim", () => {
  const { item } = project("spec", { [specPath]: "No heading" });
  const gate = gateReadiness(item);
  expect(gate.conditions[0]).toEqual({
    id: "output",
    label: "spec.md exists and parses",
    labelMessage: { code: "gate.specOutput" },
    ready: false,
    action: `Write or edit ${specPath} with a nonempty # heading. Spec has no nonempty # heading`,
    actionMessage: {
      code: "gate.writeSpec",
      params: { path: specPath, warning: "Spec has no nonempty # heading" },
    },
  });
  expect(gate.reasonMessage).toEqual(gate.conditions[0].actionMessage);
});

test("manual, Tickets and Review gate conditions carry messages alongside English", () => {
  const manual = gateReadiness(project("clarify").item).conditions[0];
  expect(manual).toEqual({
    id: "output",
    ready: true,
    label: "Developer approval; no file output required",
    labelMessage: { code: "gate.manualApproval" },
    action: "Review the stage and approve when satisfied.",
    actionMessage: { code: "gate.approve" },
  });
  const tickets = gateReadiness(project("tickets").item).conditions[0];
  expect(tickets).toEqual({
    id: "output",
    ready: false,
    label: "At least one ticket, no ticket warnings, valid dependency order",
    labelMessage: { code: "gate.ticketsOutput" },
    action:
      "Write or fix .scratch/first/issues/NN-<slug>.md tickets with Status and Blocked by lines and valid dependencies.",
    actionMessage: {
      code: "gate.writeTickets",
      params: { path: ".scratch/first/issues/NN-<slug>.md", warning: "" },
    },
  });
  const review = gateReadiness(project("review").item).conditions;
  expect(
    review.map(({ labelMessage, actionMessage }) => ({ labelMessage, actionMessage })),
  ).toEqual([
    {
      labelMessage: { code: "gate.reviewFinished" },
      actionMessage: { code: "gate.recordFindings" },
    },
    {
      labelMessage: { code: "gate.findingsDecided" },
      actionMessage: { code: "gate.decideFindings" },
    },
    { labelMessage: { code: "gate.checksPassing" }, actionMessage: { code: "gate.runChecks" } },
    {
      labelMessage: { code: "gate.evidenceFresh" },
      actionMessage: { code: "gate.refreshEvidence" },
    },
    { labelMessage: { code: "gate.memoryDecided" }, actionMessage: { code: "gate.decideMemory" } },
    {
      labelMessage: { code: "gate.riskyPathsHandled" },
      actionMessage: { code: "gate.handleRiskyPaths" },
    },
  ]);
});

test("Spec uses existing parsing rules and scopes warnings to its own spec", () => {
  const { item } = project("spec", {
    [specPath]: "\uFEFF# First\r\n## Outcome\r\nAgreed",
    [ticketPath]: "Broken ticket",
    ".scratch/other/spec.md": "Broken spec",
  });
  expect(item.outputWarnings?.length).toBeGreaterThan(0);
  expect(gateReadiness(item).ready).toBe(true);
  item.spec = null;
  expect(gateReadiness(item).ready).toBe(false);
});

const invalidTicketOutputs: Record<string, string>[] = [
  {},
  { [ticketPath]: "# First\nBlocked by: none" },
  { [ticketPath]: "# First\nStatus: ready-for-agent" },
  { [ticketPath]: "No heading" },
  { [ticketPath]: "# First\n\u0000" },
  { [ticketPath]: ticket, ".scratch/first/issues/bad-name.md": ticket },
  { [ticketPath]: ticket, ".scratch/first/issues/01-duplicate.md": ticket },
  { [ticketPath]: ticket.replace("none", "99") },
  { [ticketPath]: ticket.replace("none", "invalid") },
  { [ticketPath]: ticket.replace("none", "01") },
  {
    [ticketPath]: ticket.replace("none", "02"),
    ".scratch/first/issues/02-second.md": ticket.replace("none", "01"),
  },
];
test.each(invalidTicketOutputs)(
  "Tickets refuses absent output, parser warnings and invalid dependencies (%j)",
  (output) => {
    const { item } = project("tickets", output);
    expect(gateReadiness(item)).toMatchObject({
      ready: false,
      reason: expect.stringContaining(".scratch/first/issues/"),
      conditions: [expect.objectContaining({ id: "output", ready: false })],
    });
  },
);

test("Tickets accepts unresolved tickets in dependency order, ignoring other output warnings", () => {
  const { item } = project("tickets", {
    [specPath]: "Broken spec",
    [ticketPath]: ticket,
    ".scratch/first/issues/02-second.md": ticket.replace("none", "01"),
    ".scratch/other/issues/01-broken.md": "Broken ticket",
  });
  expect(item.tickets.every(({ resolved }) => !resolved)).toBe(true);
  expect(gateReadiness(item).ready).toBe(true);
  item.tickets.reverse();
  expect(gateReadiness(item).ready).toBe(false);
});

test("Clarify blocks on open, unknown or unreadable memory proposals", () => {
  const { item } = project("clarify");
  expect(gateReadiness(item).ready).toBe(true);
  item.memoryProposals = [
    {
      kind: "memory-proposal",
      id: "proposal",
      workItem: item.slug,
      ticket: null,
      stintId: "stint",
      agent: "codex",
      title: "Memory proposal",
      details: "Decide",
      raisedAt: "2026-10-10T10:05:00Z",
      path: "GLOSSARY.md",
      diff: "diff",
      baseCommit: "base",
      checkpointCommit: "head",
    },
  ];
  expect(gateReadiness(item)).toMatchObject({
    ready: false,
    reason: expect.stringContaining("Accept or reject"),
  });
  item.memoryProposals = undefined;
  expect(gateReadiness(item).ready).toBe(false);
  item.memoryProposals = [];
  item.memoryProposalError = "Cannot derive memory proposals";
  expect(gateReadiness(item).reason).toBe(item.memoryProposalError);
});

test.each(["manual", "spec", "tickets", "evidence", "merge"] as const)(
  "a custom stage's %s gate kind drives its output condition, not its name or column",
  (kind: GateKind) => {
    const workflow = {
      ...builtInWorkflows.feature,
      id: "custom",
      stages: [
        {
          id: "prepare",
          name: "Prepare",
          column: kind === "manual" ? "spec" : "implement",
          skill: null,
          gate: kind,
        },
        { id: "deliver", name: "Deliver", column: "ship", skill: null, gate: "merge" },
      ],
    };
    for (const withOutput of [false, true]) {
      const { item, snapshot } = project(
        "prepare",
        {
          ".stintwork/workflows/custom.yaml": stringify(workflow),
          ...(withOutput ? { [specPath]: "# Spec", [ticketPath]: ticket } : {}),
        },
        "custom",
      );
      if (withOutput && kind === "evidence") {
        item.stints[0].findings = { commit: "head", findings: [] };
        item.headCommit = "head";
        item.riskyPaths = [];
        item.checkCommands = [];
      }
      expect(gateReadiness(item, snapshot.workflows).ready).toBe(
        kind === "manual" || (kind !== "merge" && withOutput),
      );
    }
  },
);
