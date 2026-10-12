// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { createMemoryRepoFiles } from "./work-items.js";
import { indexProject } from "./project.js";
import {
  applyStintLogEntry,
  foldStintLog,
  isStintEvent,
  isStintLogEntry,
  isCheckpointWarnings,
  summarizeStint,
  type StintLogEntry,
  type StintLogEvent,
} from "./stints.js";

test("checkpoint warnings validate as metadata and survive folding and summaries", () => {
  const warnings = [{ path: ".env", reasons: ["likely-secret"], excluded: true }];
  expect(isCheckpointWarnings(warnings)).toBe(true);
  const ended: StintLogEntry = {
    type: "ended",
    at: "2026-10-09T10:10:00Z",
    status: "finished",
    checkpointWarnings: [{ path: ".env", reasons: ["likely-secret"], excluded: true }],
  };
  expect(isStintLogEntry(ended)).toBe(true);
  const stint = foldStintLog([started, ended]);
  expect(stint?.checkpointWarnings).toEqual(warnings);
  expect(stint && summarizeStint(stint).checkpointWarnings).toEqual(warnings);
  for (const warning of [
    { ...warnings[0], path: "../outside" },
    { ...warnings[0], path: "/outside" },
    { ...warnings[0], reasons: ["unknown"] },
    { ...warnings[0], reasons: [["likely-secret"]] },
    { ...warnings[0], reasons: [] },
    { ...warnings[0], excluded: false },
    { ...warnings[0], contents: "Must not be logged" },
  ])
    expect(isStintLogEntry({ ...ended, checkpointWarnings: [warning] })).toBe(false);
});

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

test.each([
  { commit: "reviewed", findings: [] },
  {
    commit: "reviewed",
    findings: [
      {
        id: "first:1",
        axis: "Standards",
        severity: "major",
        path: "src/file.ts",
        line: 2,
        title: "Input",
        body: "Validate input.",
      },
    ],
  },
  { commit: "reviewed", findings: null, error: "Malformed reply", rawReply: "Raw text" },
])("findings survive log folding, summaries and snapshot indexing: %j", (findings) => {
  const entries = [started, { type: "ended", at: started.at, status: "finished", findings }];
  expect(entries.every(isStintLogEntry)).toBe(true);
  const stint = foldStintLog(entries as StintLogEntry[]);
  expect(stint?.findings).toEqual(findings);
  expect(summarizeStint(stint as NonNullable<typeof stint>).findings).toEqual(findings);
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".scratch/board/spec.md": "# Board",
      ".stintwork/local/stints/first.jsonl": entries
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
    }),
    { name: "Test" },
  );
  expect(snapshot.warnings).toEqual([]);
  expect(snapshot.workItems[0].stints[0].findings).toEqual(findings);
});

test.each([
  { commit: "reviewed", findings: null },
  { commit: "reviewed", findings: [], error: "Contradictory" },
  { commit: "", findings: [] },
  { commit: "reviewed", findings: null, error: "Malformed", rawReply: 12 },
  {
    commit: "reviewed",
    findings: [
      {
        id: "bad",
        axis: "Standards",
        severity: ["major"],
        path: "file",
        line: 1,
        title: "Input",
        body: "Input",
      },
    ],
  },
  {
    commit: "reviewed",
    findings: [
      {
        id: "bad",
        axis: "Standards",
        severity: "major",
        path: "file",
        line: -1,
        title: "Input",
        body: "Input",
      },
    ],
  },
])("invalid finding evidence is rejected at the log boundary: %j", (findings) => {
  expect(isStintLogEntry({ type: "ended", at: started.at, status: "finished", findings })).toBe(
    false,
  );
});

test("plans, partial tool updates and file edits fold to latest state without losing fields or mutating the log", () => {
  const rich: StintLogEvent[] = [
    {
      type: "plan",
      id: "plan",
      entries: [{ content: "Read", priority: "high", status: "pending" }],
    },
    {
      type: "tool_call",
      toolCallId: "read",
      title: "Read ticket",
      kind: "read",
      status: "in_progress",
      content: [{ type: "text", text: "old output" }],
      locations: [{ path: "/ticket", line: 1 }],
    },
    { type: "file_edit", toolCallId: "edit", path: "/file", oldText: "old", newText: "draft" },
    {
      type: "plan",
      id: "plan",
      entries: [{ content: "Read", priority: "high", status: "completed" }],
    },
    {
      type: "tool_call_update",
      toolCallId: "read",
      status: "completed",
      content: [{ type: "text", text: "new output" }],
      output: "Done",
    },
    { type: "file_edit", toolCallId: "edit", path: "/file", newText: "final" },
    { type: "tool_call_update", toolCallId: "early", status: "in_progress" },
    { type: "tool_call", toolCallId: "early", title: "Started after update", kind: "search" },
    { type: "tool_call_update", toolCallId: "read", locations: [], content: [] },
    { type: "plan", id: "second-plan", entries: [] },
  ];
  const entries: StintLogEntry[] = rich.map((event) => ({ type: "event", at: started.at, event }));
  const original = structuredClone(entries);
  expect(entries.every(isStintLogEntry)).toBe(true);
  expect(isStintEvent(rich[4])).toBe(false);
  const stint = foldStintLog([started, ...entries]);
  expect(stint?.events).toEqual([
    {
      type: "plan",
      id: "plan",
      entries: [{ content: "Read", priority: "high", status: "completed" }],
    },
    {
      type: "tool_call",
      toolCallId: "read",
      title: "Read ticket",
      kind: "read",
      status: "completed",
      content: [],
      locations: [],
      output: "Done",
    },
    { type: "file_edit", toolCallId: "edit", path: "/file", oldText: "old", newText: "final" },
    {
      type: "tool_call",
      toolCallId: "early",
      status: "in_progress",
      title: "Started after update",
      kind: "search",
    },
    { type: "plan", id: "second-plan", entries: [] },
  ]);
  expect(stint?.events.every(isStintEvent)).toBe(true);
  expect(entries).toEqual(original);
});

test.each([
  {
    type: "plan",
    id: "plan",
    entries: [{ content: "Read", priority: "high", status: "invented" }],
  },
  { type: "tool_call_update", toolCallId: "tool", title: null },
  { type: "tool_call", toolCallId: "tool", content: [{ type: "text", text: 1 }] },
  { type: "tool_call", toolCallId: "tool", locations: [{ path: "/file", line: -1 }] },
  { type: "file_edit", toolCallId: "tool", path: 1 },
  {
    type: "permission_request",
    requestId: "request",
    toolCallId: "tool",
    title: null,
    kind: null,
    automatic: false,
    options: [{ optionId: "allow", name: 1, kind: "allow_once" }],
  },
])("invalid rich log entries are rejected: $type", (event) => {
  expect(isStintLogEntry({ type: "event", at: started.at, event })).toBe(false);
});

test("permission requests retain real options and decisions correlate by request ID", () => {
  const request: StintLogEvent = {
    type: "permission_request",
    requestId: "one",
    toolCallId: "git",
    title: "git add",
    kind: "execute",
    automatic: false,
    options: [
      {
        optionId: "cancel",
        name: "No, and tell Codex what to do differently",
        kind: "reject_once",
      },
    ],
  };
  const decision: StintLogEvent = {
    type: "permission",
    requestId: "one",
    toolCallId: "git",
    title: "git add",
    kind: "execute",
    automatic: false,
    decision: { outcome: "selected", optionId: "cancel", kind: "reject_once" },
  };
  const entries: StintLogEntry[] = [request, decision].map((event) => ({
    type: "event",
    at: started.at,
    event,
  }));
  expect(entries.every(isStintLogEntry)).toBe(true);
  expect(foldStintLog([started, ...entries])?.events).toEqual([
    { ...request, raisedAt: started.at },
    decision,
  ]);
});

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

test("optional handoff errors survive log indexing and summaries; older logs still work", () => {
  const ended: StintLogEntry = {
    type: "ended",
    at: "2026-10-09T10:01:00Z",
    status: "stopped",
    handoff: null,
    handoffError: "Agent was still settling the cancelled patch.",
  };
  expect(isStintLogEntry(ended)).toBe(true);
  expect(isStintLogEntry({ ...ended, handoffError: 42 })).toBe(false);
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".scratch/board/spec.md": "# Board",
      ".stintwork/local/stints/first.jsonl": [started, ended]
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
    }),
    { name: "Board" },
  );
  expect(snapshot.warnings).toEqual([]);
  expect(snapshot.workItems[0].stints[0]).toMatchObject({ handoffError: ended.handoffError });
  const legacy = foldStintLog([started, { type: "ended", at: ended.at, status: "stopped" }]);
  expect(legacy).not.toBeNull();
  if (!legacy) throw new Error("Legacy stint log was not folded.");
  expect(summarizeStint(legacy)).not.toHaveProperty("handoffError");
});
