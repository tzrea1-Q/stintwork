// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { createMemoryRepoFiles } from "./work-items.js";
import { indexProject } from "./project.js";
import {
  applyStintLogEntry,
  foldStintLog,
  isStintEvent,
  isStintLogEntry,
  indexStints,
  isCheckpointWarnings,
  isRiskyPaths,
  summarizeStint,
  type StintLogEntry,
  type StintLogEvent,
} from "./stints.js";

test("stint log folding retains structured notes, old English and future message codes", () => {
  const entries = [
    {
      type: "event",
      at: "now",
      event: {
        type: "message",
        id: "setup",
        text: "Wrote workflow.yaml with the workflow, stage and Claude Code for this stage.\n",
        message: { code: "stream.wroteWorkflow", params: { agent: "Claude Code" } },
      },
    },
    { type: "event", at: "now", event: { type: "message", id: "old", text: "Old English note\n" } },
    {
      type: "event",
      at: "now",
      event: {
        type: "message",
        id: "future",
        text: "Future English note",
        message: { code: "stream.future" },
      },
    },
  ];
  const recorded = JSON.parse(JSON.stringify([started, ...entries]));
  expect(recorded.every(isStintLogEntry)).toBe(true);
  expect(foldStintLog(recorded)?.events).toEqual(entries.map(({ event }) => event));
});

test("ended stint diagnostics retain message metadata in replay and summaries without annotating old logs", () => {
  const ended = {
    type: "ended",
    at: "now",
    status: "failed",
    error: "Agent ended the stint with stop reason: max_tokens.",
    errorMessage: { code: "stint.stopReason", params: { reason: "max_tokens" } },
    handoffError: "Handoff timed out.",
    handoffErrorMessage: { code: "stint.handoffTimeout" },
  };
  const entries = JSON.parse(JSON.stringify([started, ended]));
  expect(entries.every(isStintLogEntry)).toBe(true);
  const stint = foldStintLog(entries);
  expect(stint?.errorMessage).toEqual({
    code: "stint.stopReason",
    params: { reason: "max_tokens" },
  });
  expect(stint && summarizeStint(stint).handoffErrorMessage).toEqual({
    code: "stint.handoffTimeout",
  });
  expect(
    foldStintLog([
      started,
      { type: "ended", at: "now", status: "failed", error: "Handoff timed out." },
    ])?.errorMessage,
  ).toBeUndefined();
});

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

test("committed warnings preserve commit identities, with no arbitrary content fields", () => {
  const warning = {
    path: ".env",
    reasons: ["likely-secret"],
    excluded: false,
    committed: true,
    commits: ["a".repeat(40)],
  };
  expect(isCheckpointWarnings([warning])).toBe(true);
  expect(
    isRiskyPaths([{ path: warning.path, reasons: warning.reasons, blob: "b".repeat(40) }]),
  ).toBe(true);
  for (const invalid of [
    { ...warning, committed: false },
    { ...warning, commits: [] },
    { ...warning, commits: ["not-a-commit"] },
    { ...warning, contents: "Never disclose" },
    { ...warning, path: "/outside" },
    { ...warning, excluded: true },
  ])
    expect(isCheckpointWarnings([invalid])).toBe(false);
  expect(
    isRiskyPaths([
      {
        path: warning.path,
        reasons: warning.reasons,
        blob: "b".repeat(40),
        contents: "Never disclose",
      },
    ]),
  ).toBe(false);
  const entry = {
    type: "ended",
    at: "2026-10-09T10:10:00Z",
    status: "finished",
    checkpointWarnings: [warning],
  };
  expect(isStintLogEntry(entry)).toBe(true);
  const stint = foldStintLog([started, entry as StintLogEntry]);
  expect(stint && summarizeStint(stint).checkpointWarnings).toEqual([warning]);
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

test("versioned recovery records validate, fold and summarize without changing the original start", () => {
  const at = "2026-10-26T12:00:00Z";
  const entries: StintLogEntry[] = [
    {
      type: "recovery",
      version: 1,
      at,
      kind: "launch",
      launch: {
        agent: "codex",
        source: "installed",
        reason: "compatible",
        executable: { path: "/bin/codex", version: "0.163.0", identity: "file-identity" },
        adapterEntry: "/cache/adapter.js",
        adapterVersion: "2.1.1",
        cacheKey: "a".repeat(64),
        lockDigest: "b".repeat(64),
        host: { os: "darwin", arch: "arm64", libc: "none", node: "22", abi: "127" },
        permissionLevel: "ask",
      },
    },
    {
      type: "recovery",
      version: 1,
      at,
      kind: "attempt",
      attempt: {
        id: "unique-attempt",
        pid: 42,
        marker: "stintwork-unique-attempt",
        owner: { pid: 41, startedAt: at },
      },
    },
    {
      type: "recovery",
      version: 1,
      at,
      kind: "session",
      attemptId: "unique-attempt",
      sessionId: "actual-acp-id",
    },
    {
      type: "recovery",
      version: 1,
      at,
      kind: "phase",
      attemptId: "unique-attempt",
      progress: {
        phase: "findings",
        stopReason: "end_turn",
        handoff: {
          stint: "first",
          agent: "codex",
          stoppedAt: "Work saved",
          unresolved: "None",
          nextStep: "Review",
        },
      },
    },
    {
      type: "recovery",
      version: 1,
      at,
      kind: "phase",
      attemptId: "unique-attempt",
      progress: {
        phase: "finalization",
        stopReason: "end_turn",
        findings: { commit: "original-reviewed-commit", findings: [] },
      },
    },
    { type: "recovery", version: 1, at, kind: "stop_requested" },
  ];
  const selected = entries[0];
  if (selected.type !== "recovery" || selected.kind !== "launch")
    throw new Error("Expected launch fixture");
  for (const launch of [
    { ...selected.launch, source: "pending" },
    { ...selected.launch, reason: "unknown" },
    { ...selected.launch, executable: { ...selected.launch.executable, path: "relative" } },
    { ...selected.launch, executable: { ...selected.launch.executable, identity: "" } },
    { ...selected.launch, executable: { ...selected.launch.executable, env: {} } },
    { ...selected.launch, host: { ...selected.launch.host, abi: "" } },
    { ...selected.launch, host: { ...selected.launch.host, credentials: "no" } },
    { ...selected.launch, lockDigest: "not-a-digest" },
    { ...selected.launch, permissionLevel: "root" },
  ])
    expect(isStintLogEntry({ ...selected, launch })).toBe(false);
  expect(
    isStintLogEntry({
      type: "recovery",
      version: 1,
      at,
      kind: "attempt",
      attempt: {
        id: "unique",
        pid: 42,
        owner: { pid: 41, startedAt: at },
        marker: "stintwork-unrelated",
      },
    }),
  ).toBe(false);
  expect(entries.every(isStintLogEntry)).toBe(true);
  const stint = foldStintLog([started, ...JSON.parse(JSON.stringify(entries))]);
  expect(stint).toMatchObject({
    ...started.stint,
    status: "running",
    handoff: { stoppedAt: "Work saved" },
    findings: { commit: "original-reviewed-commit" },
    recovery: {
      version: 1,
      launch: { source: "installed", permissionLevel: "ask" },
      sessionId: "actual-acp-id",
      attempt: { id: "unique-attempt", pid: 42 },
      stopRequestedAt: at,
      progress: { phase: "finalization" },
    },
  });
  expect(stint && summarizeStint(stint).recovery).toEqual(stint?.recovery);
  const terminal = foldStintLog([started, ...entries, { type: "ended", at, status: "finished" }]);
  expect(applyStintLogEntry(terminal, entries[2])).toBe(terminal);
  expect(foldStintLog([started])?.recovery).toBeUndefined();
  expect(foldStintLog([entries[2]])).toBeNull();
});

test("invalid recovery metadata is warned and skipped while legacy history stays readable", () => {
  const base = {
    type: "recovery",
    version: 1,
    at: "2026-10-26T12:00:00Z",
    kind: "session",
    attemptId: "attempt",
    sessionId: "session",
  };
  for (const entry of [
    { ...base, version: 2 },
    { ...base, at: "bad-date" },
    { ...base, sessionId: "" },
    { ...base, attemptId: null },
    { ...base, env: { TOKEN: "must not persist" } },
    { ...base, kind: "attempt", attempt: { id: "attempt", pid: 42 } },
    { ...base, kind: "phase", progress: { phase: "unknown" } },
    { ...base, kind: "launch", launch: { agent: "codex" } },
  ])
    expect(isStintLogEntry(entry)).toBe(false);
  const result = indexProject(
    createMemoryRepoFiles({
      ".scratch/board/spec.md": "# Board",
      ".stintwork/local/stints/first.jsonl": [
        started,
        { ...base, version: 999 },
        { type: "ended", at: base.at, status: "interrupted" },
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
    }),
    { name: "Board" },
  );
  expect(result.workItems[0].stints[0]).toMatchObject({ status: "interrupted" });
  expect(result.workItems[0].stints[0]).not.toHaveProperty("recovery");
  expect(result.warnings).toContainEqual(
    expect.objectContaining({ message: "Invalid stint log entry; skipped" }),
  );
});

test("recovery setup/outcome state validates and reaches summaries without reopening terminal history", () => {
  const entries = (["resuming", "resumed", "fallback"] as const).map((state) => ({
    type: "recovery" as const,
    version: 1 as const,
    at: "2026-10-26T12:00:00Z",
    kind: "resume" as const,
    state,
    ...(state === "fallback" ? { reason: "Session not found" } : {}),
  }));
  for (const entry of entries) expect(isStintLogEntry(entry)).toBe(true);
  expect(isStintLogEntry({ ...entries[0], state: "retrying" })).toBe(false);
  expect(isStintLogEntry({ ...entries[2], reason: "" })).toBe(false);
  const stint = foldStintLog([started, ...entries]);
  expect(stint?.recovery).toEqual({ version: 1, state: "fallback", reason: "Session not found" });
  expect(stint && summarizeStint(stint).recovery).toEqual(stint?.recovery);
  const ended = {
    type: "ended" as const,
    at: entries[0].at,
    status: "interrupted" as const,
    handoff: null,
  };
  expect(foldStintLog([started, ...entries, ended, entries[0]])).toEqual(
    foldStintLog([started, ...entries, ended]),
  );
});

test("logs without a usable start remain warnings rather than invented stints", () => {
  const path = ".stintwork/local/stints/missing-start.jsonl";
  const result = indexStints(
    createMemoryRepoFiles({
      [path]: JSON.stringify({
        type: "event",
        at: "now",
        event: { type: "message", id: "1", text: "Readable orphan output" },
      }),
    }),
  );
  expect(result).toEqual({
    stints: [],
    warnings: [{ path, message: "Stint log has no usable start; skipped" }],
  });
});
