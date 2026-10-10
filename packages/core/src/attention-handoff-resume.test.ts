import { expect, test } from "vitest";
import { deriveAttentionItems } from "./attention.js";
import type { BriefHandoff } from "./brief.js";
import { indexProject } from "./project.js";
import { summarizeStint, type StintLogEntry, type StintStatus } from "./stints.js";
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

test.each([
  { ticket: 11, stage: "implement", laterStage: "implement" },
  { ticket: 11, stage: "implement", laterStage: "review" },
  { ticket: null, stage: "clarify", laterStage: "clarify" },
])(
  "a started brief supersedes its source handoff for $ticket / $stage → $laterStage",
  ({ ticket, stage, laterStage }) => {
    const earlier = started("earlier", ticket, stage);
    const later = started("later", ticket, laterStage, handoff);
    const snapshot = project(earlier, [later]);
    expect(snapshot.warnings).toEqual([]);
    expect(snapshot.attentionItems).toEqual([]);
    expect(snapshot.workItems[0].stints[0].lastHandoffStintId).toBe(handoff.stint);
    expect(
      deriveAttentionItems({
        workItems: snapshot.workItems.map((item) => ({
          ...item,
          stints: [...item.stints].reverse(),
        })),
      }),
    ).toEqual([]);
    expect(project(earlier, [later]).attentionItems).toEqual([]);
  },
);

test.each<StintStatus>(["running", "finished", "stopped", "failed", "interrupted"])(
  "consumption survives a later stint being %s, and its own unresolved handoff still needs attention",
  (status) => {
    const later = started("later", 11, "implement", handoff);
    const entries: StintLogEntry[] = [later];
    if (status !== "running")
      entries.push({
        type: "ended",
        at: "2026-10-09T10:40:00Z",
        status,
        handoff: { ...handoff, stint: "later", unresolved: "A new question." },
      });
    const snapshot = project(started("earlier"), entries);
    expect(snapshot.attentionItems.map((item) => item.stintId)).toEqual(
      status === "running" ? [] : ["later"],
    );
    expect(project(started("earlier"), entries).attentionItems).toEqual(snapshot.attentionItems);
    if (status === "running") {
      const active = snapshot.workItems[0].activeStint;
      if (!active) throw new Error("Expected an active stint.");
      expect(summarizeStint(active).lastHandoffStintId).toBe("earlier");
    }
  },
);

test.each([
  { name: "no later stint", later: [] },
  { name: "no handoff in the started brief", later: [started("later")] },
  {
    name: "another source handoff",
    later: [started("later", 11, "implement", { ...handoff, stint: "other" })],
  },
  { name: "a different ticket", later: [started("later", 12, "implement", handoff)] },
  {
    name: "a stage-level successor to a ticket",
    later: [started("later", null, "implement", handoff)],
  },
  {
    name: "a different work item",
    later: [
      {
        ...started("later", 11, "implement", handoff),
        stint: { ...started("later", 11, "implement", handoff).stint, workItem: "other" },
      },
    ],
  },
  {
    name: "a start before the source handoff",
    later: [{ ...started("later", 11, "implement", handoff), at: "2026-10-09T10:10:00Z" }],
  },
])("$name does not supersede an unresolved handoff", ({ later }) => {
  expect(project(started("earlier"), later).attentionItems.map((item) => item.stintId)).toEqual([
    "earlier",
  ]);
});

test.each([
  { ticket: null, stage: "spec" },
  { ticket: 11, stage: "clarify" },
])(
  "stage-level handoffs require another stage-level stint on the same stage ($ticket / $stage)",
  ({ ticket, stage }) => {
    expect(
      project(started("earlier", null, "clarify"), [
        started("later", ticket, stage, handoff),
      ]).attentionItems.map((item) => item.stintId),
    ).toEqual(["earlier"]);
  },
);

test("a start at the handoff's timestamp consumes it, including equivalent timezone offsets", () => {
  expect(
    project(started("earlier"), [
      { ...started("later", 11, "implement", handoff), at: "2026-10-09T03:20:00-07:00" },
    ]).attentionItems,
  ).toEqual([]);
});

test("a stint cannot consume its own handoff", () => {
  expect(
    project({ ...started("earlier", 11, "implement", handoff), at: ended.at }).attentionItems.map(
      (item) => item.stintId,
    ),
  ).toEqual(["earlier"]);
});

test("finishing the ticket from the handoff leaves no stale attention after rebuilding the logs", () => {
  const entries: StintLogEntry[] = [
    started("later", 11, "implement", handoff),
    {
      type: "ended",
      at: "2026-10-09T10:40:00Z",
      status: "finished",
      handoff: { ...handoff, stint: "later", unresolved: "None" },
    },
  ];
  expect(project(started("earlier"), entries).attentionItems).toEqual([]);
  expect(project(started("earlier"), entries).attentionItems).toEqual([]);
});
