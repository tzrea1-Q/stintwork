// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { gateReadiness } from "./gates.js";
import { deriveAttentionItems } from "./attention.js";
import { indexProject } from "./project.js";
import { evidenceStale } from "./review-evidence.js";
import { createMemoryRepoFiles } from "./work-items.js";
import type { StintSummary } from "./stints.js";
import type { CheckResult } from "./checks.js";
import type { ReviewDecision } from "./review-decisions.js";

const commit = "a".repeat(40);
const head = "b".repeat(40);
const command = { name: "Test", command: "node test.cjs" };
const finding = {
  id: "review:1",
  axis: "Spec" as const,
  severity: "major" as const,
  path: "src/example.ts",
  line: 1,
  title: "Missing limit",
  body: "Bound the input.",
};

test("GitHub workflow bookkeeping preserves checks, while code changes invalidate them", () => {
  const context = {
    slug: "github-1",
    github: { repository: "Example/Project", number: 1 },
    headCommit: head,
    evidenceChangedPaths: { [commit]: [".stintwork/github/example/project/1/workflow.yaml"] },
  };
  expect(evidenceStale(context, commit)).toBe(false);
  context.evidenceChangedPaths[commit].push("src/code.ts");
  expect(evidenceStale(context, commit)).toBe(true);
});
const review: StintSummary = {
  id: "review",
  workItem: "first",
  stage: "review",
  ticket: null,
  agent: "codex",
  status: "finished",
  startedAt: "2026-10-10T10:00:00Z",
  endedAt: "2026-10-10T10:01:00Z",
  handoff: null,
  checkpointCommit: commit,
  findings: { commit, findings: [finding] },
};
function item() {
  const result = indexProject(
    createMemoryRepoFiles({ ".scratch/first/workflow.yaml": "workflow: feature\nstage: review" }),
    { name: "Project" },
  ).workItems[0];
  return {
    ...result,
    headCommit: head,
    riskyPaths: [] as import("./stints.js").RiskyPath[],
    evidenceChangedPaths: {
      [commit]: [".scratch/first/workflow.yaml", ".scratch/first/review.yaml"],
    },
    stints: [review],
    checkCommands: [command],
    checks: [
      { ...command, commit, status: "passed", durationMs: 1, outputExcerpt: "OK" },
    ] as CheckResult[],
    reviewDecisions: [
      {
        id: finding.id,
        kind: "finding" as const,
        status: "accepted" as const,
        reason: "Intentional",
        by: "Developer",
        at: "2026-10-10T10:02:00Z",
      },
    ] as ReviewDecision[],
  };
}

test("risky branch paths block Review until each current blob has an explicit acceptance", () => {
  const workItem = item();
  const risks = [
    { path: ".env", reasons: ["likely-secret"] as const, blob: "c".repeat(40) },
    { path: "dist/bundle.js", reasons: ["generated-directory"] as const, blob: "d".repeat(40) },
  ].map((risk) => ({ ...risk, reasons: [...risk.reasons] }));
  workItem.riskyPaths = risks;
  expect(gateReadiness(workItem).ready).toBe(false);
  expect(gateReadiness(workItem).conditions.find(({ id }) => id === "risky-paths")).toMatchObject({
    label: { text: "No risky files on the branch", code: "gate.riskyPathsHandled" },
    ready: false,
    action: expect.objectContaining({ text: expect.stringContaining("follow-up commit") }),
  });
  for (const risk of risks) {
    workItem.reviewDecisions.push({
      id: risk.path,
      kind: "risky-path",
      status: "accepted",
      reason: "Deliberate dummy fixture",
      blob: risk.blob,
      by: "Developer",
      at: "2026-10-10T10:03:00Z",
    });
  }
  expect(gateReadiness(workItem).ready).toBe(true);
  workItem.riskyPaths[0] = { ...risks[0], blob: "e".repeat(40) };
  expect(gateReadiness(workItem).ready).toBe(false);
  workItem.riskyPaths = [];
  expect(gateReadiness(workItem).ready).toBe(true);
  const unknown = { ...workItem, riskyPaths: undefined };
  expect(gateReadiness(unknown).ready).toBe(false);
  expect(gateReadiness({ ...workItem, reviewEvidenceError: "Cannot scan" }).ready).toBe(false);
});

test.each([
  [[], false],
  [[".scratch/first/review.yaml"], false],
  [[".scratch/first/workflow.yaml"], false],
  [[".scratch/first/review.yaml", "src/example.ts"], true],
  [[".scratch/other/review.yaml"], true],
  [[".scratch/first/spec.md"], true],
  [[".scratch/first/issues/01-example.md"], true],
  [["GLOSSARY.md"], true],
  [[".gitignore"], true],
  [[".scratch/first/review.yaml/extra"], true],
] as const)("freshness derives from changed paths %j", (paths, stale) => {
  expect(
    evidenceStale(
      { slug: "first", headCommit: head, evidenceChangedPaths: { [commit]: [...paths] } },
      commit,
    ),
  ).toBe(stale);
});

test("equal heads are fresh; unknown heads and missing Git comparisons fail closed", () => {
  expect(evidenceStale({ slug: "first", headCommit: commit }, commit)).toBe(false);
  expect(evidenceStale({ slug: "first" }, commit)).toBe(true);
  expect(evidenceStale({ slug: "first", headCommit: head }, commit)).toBe(true);
  expect(
    evidenceStale(
      { slug: "first", headCommit: head, evidenceChangedPaths: { [commit]: null } },
      commit,
    ),
  ).toBe(true);
});

test.each(Array.from({ length: 32 }, (_, mask) => mask))(
  "Review readiness accounts for every missing-condition combination %i",
  (mask) => {
    const workItem = item();
    if (mask & 1) workItem.reviewDecisions = [];
    if (mask & 2) workItem.checks = [];
    if (mask & 4) workItem.evidenceChangedPaths[commit] = ["src/example.ts"];
    if (mask & 8)
      workItem.memoryProposals = [
        {
          kind: "memory-proposal",
          id: "proposal",
          workItem: "first",
          ticket: null,
          stintId: "review",
          agent: "codex",
          title: "Memory proposal",
          details: "Decide",
          raisedAt: review.endedAt as string,
          path: "GLOSSARY.md",
          diff: "diff",
          baseCommit: commit,
          checkpointCommit: head,
        },
      ];
    if (mask & 16) workItem.stints = [{ ...review, status: "stopped" }];
    const gate = gateReadiness(workItem);
    expect(gate.ready).toBe(mask === 0);
    expect(gate.conditions.map(({ id }) => id)).toEqual([
      "review",
      "findings",
      "checks",
      "freshness",
      "memory",
      "risky-paths",
    ]);
    expect(gate.conditions.find(({ id }) => id === "review")?.ready).toBe(!(mask & 16));
    expect(gate.conditions.find(({ id }) => id === "findings")?.ready).toBe(!(mask & 1));
    expect(gate.conditions.find(({ id }) => id === "checks")?.ready).toBe(!(mask & 2));
    expect(gate.conditions.find(({ id }) => id === "freshness")?.ready).toBe(!(mask & 6));
    expect(gate.conditions.find(({ id }) => id === "memory")?.ready).toBe(!(mask & 8));
    expect(
      deriveAttentionItems({ workItems: [workItem] }).some(({ kind }) => kind === "gate-ready"),
    ).toBe(mask === 0);
    for (const condition of gate.conditions)
      expect(condition.action.text.length).toBeGreaterThan(0);
  },
);

test.each(["open", "sent-back", "resolved", "accepted"] as const)(
  "only resolved or accepted findings satisfy Review: %s",
  (status) => {
    const workItem = item();
    workItem.reviewDecisions = [{ ...workItem.reviewDecisions[0], status }];
    expect(gateReadiness(workItem).ready).toBe(status === "resolved" || status === "accepted");
  },
);

test.each(["pending", "running", "failed", "cancelled"] as const)(
  "a %s configured check blocks Review",
  (status) => {
    const workItem = item();
    workItem.checks = [{ ...workItem.checks[0], status }];
    expect(gateReadiness(workItem).ready).toBe(false);
  },
);

test("checks must match the configured command and all commits must be fresh", () => {
  const workItem = item();
  workItem.checks[0].command = "old command";
  expect(gateReadiness(workItem).ready).toBe(false);
  workItem.checks[0].command = command.command;
  workItem.checks[0].commit = "c".repeat(40);
  expect(gateReadiness(workItem).ready).toBe(false);
  workItem.checks[0].commit = commit;
  workItem.checkCommands.push({ name: "Lint", command: "node lint.cjs" });
  expect(gateReadiness(workItem).ready).toBe(false);
  workItem.checkCommands = [];
  expect(gateReadiness(workItem).ready).toBe(true);
});

test("the latest Review replaces older sent-back, stale and failed reports, including no findings", () => {
  const workItem = item();
  workItem.stints = [
    { ...review, id: "latest", findings: { commit: head, findings: [] } },
    { ...review, findings: { commit: "old", findings: [finding] } },
  ];
  workItem.reviewDecisions = [];
  expect(gateReadiness(workItem)).toMatchObject({ ready: true, nextStage: "ship" });
  workItem.stints[0].findings = { commit: head, findings: null, error: "Invalid reply" };
  expect(gateReadiness(workItem).ready).toBe(false);
  delete workItem.stints[0].findings;
  expect(gateReadiness(workItem).ready).toBe(false);
  workItem.stints[0].status = "stopped";
  expect(gateReadiness(workItem).ready).toBe(false);
});

test("unavailable evidence never enables approval", () => {
  const workItem = item();
  expect(
    gateReadiness({ ...workItem, reviewEvidenceError: "Cannot read Review evidence" }).ready,
  ).toBe(false);
  expect(gateReadiness({ ...workItem, checkCommands: undefined }).ready).toBe(false);
  expect(gateReadiness({ ...workItem, memoryProposals: undefined }).ready).toBe(false);
  expect(gateReadiness({ ...workItem, stints: [] }).ready).toBe(false);
});
