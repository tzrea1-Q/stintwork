// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { deriveAttentionItems } from "./attention.js";
import type { BriefHandoff } from "./brief.js";
import { indexProject } from "./project.js";
import { type StintLogEntry } from "./stints.js";
import { createMemoryRepoFiles } from "./work-items.js";

const handoff: BriefHandoff = {
  stint: "earlier",
  agent: "codex",
  stoppedAt: "Implementation written.",
  unresolved: "Checks unverified; ticket not updated.",
  nextStep: "Verify checks and update the ticket.",
};

function started(
  id: string,
  ticket: number | null = 11,
  stage = "implement",
  lastHandoff: BriefHandoff | null = null,
): Extract<StintLogEntry, { type: "started" }> {
  return {
    type: "started",
    at: id === "earlier" ? "2026-10-09T10:00:00Z" : "2026-10-09T10:30:00Z",
    stint: {
      id,
      workItem: "first",
      ticket,
      stage,
      agent: "codex",
      baseCommit: "base",
      worktree: { path: "/worktree", branch: "stintwork/first" },
      brief: { prompt: "Work", skill: null, pointers: [], changedPaths: [], lastHandoff },
    },
  };
}

const ended: StintLogEntry = {
  type: "ended",
  at: "2026-10-09T10:20:00Z",
  status: "stopped",
  handoff,
};

function project(earlier = started("earlier"), later: StintLogEntry[] = []) {
  return indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First",
      ".scratch/other/spec.md": "# Other",
      ".stintwork/local/stints/earlier.jsonl": [earlier, ended]
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
      ...(later.length
        ? {
            ".stintwork/local/stints/later.jsonl": later
              .map((entry) => JSON.stringify(entry))
              .join("\n"),
          }
        : {}),
    }),
    { name: "Project" },
  );
}

test("handoffs remain until a current later approval of their own stage", () => {
  const snapshot = project(started("earlier", 11, "tickets"), [
    started("later", 11, "tickets", handoff),
    {
      ...ended,
      at: "2026-10-09T10:40:00Z",
      status: "finished",
      handoff: { ...handoff, unresolved: "None" },
    },
  ]);
  const item = snapshot.workItems[0];
  const open = () =>
    deriveAttentionItems(snapshot).filter((entry) => entry.kind === "handoff-unresolved");
  expect(open()).toHaveLength(1);
  const approval = { by: "Developer", at: "2026-10-09T10:25:00Z", commit: "head" };
  item.stages.spec = { approved: approval };
  expect(open()).toHaveLength(1);
  item.stages.tickets = { approved: { ...approval, at: "2026-10-09T10:19:00Z" } };
  expect(open()).toHaveLength(1);
  item.stages.tickets = { approved: { ...approval, state: "stale" } };
  expect(open()).toHaveLength(1);
  item.stages.tickets = { approved: { ...approval, remoteState: "unknown" } };
  expect(open()).toHaveLength(1);
  item.stages.tickets = { approved: approval };
  expect(open()).toHaveLength(0);
  item.stages.tickets.reopened = { at: "2026-10-09T10:26:00Z" };
  expect(open()).toHaveLength(1);
  item.reviewDecisions = [
    {
      id: "earlier",
      kind: "handoff-unresolved",
      status: "resolved",
      at: approval.at,
      by: "Developer",
      reason: "",
    },
  ];
  expect(open()).toHaveLength(0);
});
