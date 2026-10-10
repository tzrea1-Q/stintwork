import { expect, test } from "vitest";
import { deriveMemoryProposals, isProjectMemoryPath } from "./memory-proposals.js";
import type { ReviewDecision } from "./review-decisions.js";

const stint = {
  id: "first-stint",
  workItem: "first",
  ticket: 6,
  agent: "codex",
  status: "finished" as const,
  startedAt: "2026-10-10T10:00:00Z",
  endedAt: "2026-10-10T10:01:00Z",
  baseCommit: "base",
  checkpointCommit: "checkpoint",
};

test("derives one proposal per project memory file and stint with its exact diff range", () => {
  const paths = [
    "GLOSSARY.md",
    "AGENTS.md",
    "CLAUDE.md",
    "docs/adr/0001.md",
    "docs/adr/nested/0002.md",
    "docs/agents/guide.md",
  ];
  const changes = [
    ...paths,
    "GLOSSARY.md",
    "src/main.ts",
    ".scratch/first/spec.md",
    "docs/brief.md",
    "nested/AGENTS.md",
  ].map((path) => ({ path, diff: `diff for ${path}` }));
  const proposals = deriveMemoryProposals(stint, changes);
  expect(proposals.map(({ path }) => path)).toEqual(paths);
  expect(new Set(proposals.map(({ id }) => id)).size).toBe(paths.length);
  expect(proposals[0]).toMatchObject({
    kind: "memory-proposal",
    workItem: "first",
    ticket: 6,
    agent: "codex",
    stintId: "first-stint",
    path: "GLOSSARY.md",
    diff: "diff for GLOSSARY.md",
    baseCommit: "base",
    checkpointCommit: "checkpoint",
    raisedAt: stint.endedAt,
  });
  const later = deriveMemoryProposals({ ...stint, id: "later-stint" }, changes);
  expect(later[0].id).not.toBe(proposals[0].id);
  expect(deriveMemoryProposals(stint, changes)).toEqual(proposals);
});

test("only completed checkpoints produce proposals, including stopped and failed stints", () => {
  const changes = [{ path: "GLOSSARY.md", diff: "+term" }];
  expect(deriveMemoryProposals({ ...stint, status: "running" }, changes)).toEqual([]);
  expect(deriveMemoryProposals({ ...stint, checkpointCommit: null }, changes)).toEqual([]);
  for (const status of ["stopped", "failed", "interrupted"] as const)
    expect(deriveMemoryProposals({ ...stint, status }, changes)).toHaveLength(1);
});

test("accepted and rejected decisions hide only the exact proposal; finding ids cannot hide memory", () => {
  const changes = [{ path: "GLOSSARY.md", diff: "+term" }];
  const [proposal] = deriveMemoryProposals(stint, changes);
  const decision: ReviewDecision = {
    id: proposal.id,
    kind: "memory-proposal",
    status: "accepted",
    reason: "Agreed",
    by: "Developer",
    at: stint.endedAt,
  };
  expect(deriveMemoryProposals(stint, changes, [decision])).toEqual([]);
  expect(deriveMemoryProposals(stint, changes, [{ ...decision, status: "rejected" }])).toEqual([]);
  expect(deriveMemoryProposals(stint, changes, [{ ...decision, status: "open" }])).toHaveLength(1);
  expect(deriveMemoryProposals(stint, changes, [{ ...decision, kind: "finding" }])).toHaveLength(1);
  expect(deriveMemoryProposals({ ...stint, id: "later-stint" }, changes, [decision])).toHaveLength(
    1,
  );
});

test.each([
  "docs/adr",
  "docs/agents",
  "docs/adr/../secret",
  "docs/agents//x",
  "docs/adr/./x",
  "docs/adr/a\0b",
  "docs/adr/a\\b",
  "/GLOSSARY.md",
])("rejects unsafe or non-file memory path %s", (path) => {
  expect(isProjectMemoryPath(path)).toBe(false);
});
