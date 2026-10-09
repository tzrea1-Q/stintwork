import { expect, test } from "vitest";
import { createMemoryRepoFiles } from "./work-items.js";
import { indexProject } from "./project.js";
import {
  applyStintLogEntry,
  foldStintLog,
  isStintEvent,
  isStintLogEntry,
  type StintLogEntry,
} from "./stints.js";

const started: StintLogEntry = {
  type: "started",
  at: "2026-10-09T10:00:00Z",
  stint: {
    id: "first",
    workItem: "board",
    stage: "implement",
    ticket: 1,
    agent: "codex",
    worktree: { path: "/project-worktrees/board", branch: "stintwork/board" },
    baseCommit: "base",
    brief: {
      skill: null,
      pointers: [],
      lastHandoff: null,
      changedPaths: [],
      prompt: "Read the ticket",
    },
  },
};
const events: StintLogEntry[] = [
  {
    type: "event",
    at: "2026-10-09T10:00:01Z",
    event: { type: "message_delta", id: "1", text: "Hello " },
  },
  {
    type: "event",
    at: "2026-10-09T10:00:02Z",
    event: { type: "message_delta", id: "1", text: "world" },
  },
  {
    type: "event",
    at: "2026-10-09T10:00:03Z",
    event: { type: "other", kind: "plan", update: { entries: [] } },
  },
];

test.each(["message", "thought"] as const)(
  "N %s chunks occupy N small log entries and fold to full text",
  (type) => {
    const count = 200;
    const entries: StintLogEntry[] = Array.from({ length: count }, () => ({
      type: "event",
      at: started.at,
      event: {
        type: type === "message" ? "message_delta" : "thought_delta",
        id: "1",
        text: "chunk ",
      },
    }));
    expect(entries).toHaveLength(count);
    expect(
      entries.every((entry) => isStintLogEntry(entry) && JSON.stringify(entry).length < 130),
    ).toBe(true);
    expect(foldStintLog([started, ...entries])?.events).toEqual([
      { type, id: "1", text: "chunk ".repeat(count) },
    ]);
    expect(isStintEvent(entries[0].type === "event" && entries[0].event)).toBe(false);
  },
);

test("existing cumulative logs remain readable without doubling text", () => {
  expect(
    foldStintLog([
      started,
      ...["Hello ", "Hello world"].map(
        (text): StintLogEntry => ({
          type: "event",
          at: started.at,
          event: { type: "message", id: "1", text },
        }),
      ),
    ])?.events,
  ).toEqual([{ type: "message", id: "1", text: "Hello world" }]);
});

test("deltas concatenate by kind and ID, retaining the original event order", () => {
  const entries: StintLogEntry[] = [
    { type: "event", at: started.at, event: { type: "message_delta", id: "1", text: "Hello " } },
    { type: "event", at: started.at, event: { type: "thought_delta", id: "1", text: "Thinking" } },
    { type: "event", at: started.at, event: { type: "message_delta", id: "2", text: "Other" } },
    { type: "event", at: started.at, event: { type: "message_delta", id: "1", text: "world" } },
    { type: "event", at: started.at, event: { type: "thought_delta", id: "1", text: " more" } },
  ];
  expect(foldStintLog([started, ...entries])?.events).toEqual([
    { type: "message", id: "1", text: "Hello world" },
    { type: "thought", id: "1", text: "Thinking more" },
    { type: "message", id: "2", text: "Other" },
  ]);
});

test("permission decisions validate and fold as distinct events", () => {
  const event = {
    type: "permission" as const,
    toolCallId: "git",
    title: "git add",
    kind: "execute",
    automatic: true,
    decision: { outcome: "selected" as const, optionId: "reject", kind: "reject_once" },
  };
  const entry: StintLogEntry = { type: "event", at: started.at, event };
  expect(isStintEvent(event)).toBe(true);
  expect(isStintLogEntry(entry)).toBe(true);
  expect(
    isStintLogEntry({ ...entry, event: { ...event, decision: { outcome: "selected" } } }),
  ).toBe(false);
  expect(isStintLogEntry({ ...entry, event: { type: "message_delta", id: "1", text: 1 } })).toBe(
    false,
  );
  expect(foldStintLog([started, entry, entry])?.events).toEqual([event, event]);
});

test("a started log folds to a running stint with the exact brief and base", () => {
  expect(foldStintLog([])).toBeNull();
  expect(foldStintLog(events)).toBeNull();
  expect(foldStintLog([started])).toMatchObject({
    ...started.stint,
    startedAt: started.at,
    endedAt: null,
    status: "running",
    events: [],
  });
});

test.each(["finished", "stopped", "failed", "interrupted"] as const)(
  "folds %s with times and merged messages without mutating input",
  (status) => {
    const input: StintLogEntry[] = [
      started,
      ...events,
      {
        type: "ended",
        at: "2026-10-09T10:01:00Z",
        status,
        error: status === "failed" ? "Agent crashed" : undefined,
      },
    ];
    const original = structuredClone(input);
    const stint = foldStintLog(input);
    expect(stint).toMatchObject({
      status,
      startedAt: started.at,
      endedAt: "2026-10-09T10:01:00Z",
      events: [
        { type: "message", id: "1", text: "Hello world" },
        { type: "other", kind: "plan", update: { entries: [] } },
      ],
    });
    expect(input).toEqual(original);
    expect(applyStintLogEntry(stint, events[0])).toEqual(stint);
  },
);

test("project history and active stint come only from local logs; malformed lines warn", () => {
  const files = createMemoryRepoFiles({
    ".scratch/board/spec.md": "# Board",
    ".stintwork/local/stints/first.jsonl": `${[started, ...events].map((entry) => JSON.stringify(entry)).join("\n")}\n{partial`,
    ".stintwork/local/stints/older.jsonl": [
      { ...started, at: "2026-10-08T10:00:00Z", stint: { ...started.stint, id: "older" } },
      { type: "ended", at: "2026-10-08T10:01:00Z", status: "finished" },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n"),
  });
  const snapshot = indexProject(files, { name: "Board" });
  expect(snapshot.workItems[0].stints.map(({ id, status }) => ({ id, status }))).toEqual([
    { id: "first", status: "running" },
    { id: "older", status: "finished" },
  ]);
  expect(snapshot.workItems[0].activeStint?.events).toHaveLength(2);
  expect(snapshot.workItems[0].stints[0]).not.toHaveProperty("brief");
  expect(snapshot.warnings).toEqual([
    { path: ".stintwork/local/stints/first.jsonl", message: "Invalid stint log entry; skipped" },
  ]);
});

test.each([
  null,
  {
    stint: "first",
    agent: "codex",
    stoppedAt: "Code written",
    unresolved: "Checks",
    nextStep: "Review",
  },
])("ended entries preserve checkpoint and handoff in folded history (%j)", (handoff) => {
  const ended: StintLogEntry = {
    type: "ended",
    at: "2026-10-09T10:01:00Z",
    status: "finished",
    checkpointCommit: "checkpoint",
    handoff,
  };
  expect(isStintLogEntry(ended)).toBe(true);
  const log = [started, ended];
  expect(foldStintLog(log)).toMatchObject({ checkpointCommit: "checkpoint", handoff });
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".scratch/board/spec.md": "# Board",
      ".stintwork/local/stints/first.jsonl": log.map((entry) => JSON.stringify(entry)).join("\n"),
    }),
    { name: "Board" },
  );
  expect(snapshot.workItems[0].stints[0]).toMatchObject({
    checkpointCommit: "checkpoint",
    handoff,
  });
  expect(isStintLogEntry({ ...ended, handoff: { stoppedAt: "Incomplete" } })).toBe(false);
  expect(isStintLogEntry({ ...ended, checkpointCommit: 42 })).toBe(false);
});
