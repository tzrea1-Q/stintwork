import { expect, test } from "vitest";
import { deriveAttentionItems } from "./attention.js";
import { indexProject } from "./project.js";
import type { StintLogEntry, StintLogEvent } from "./stints.js";
import { createMemoryRepoFiles } from "./work-items.js";

const started: StintLogEntry = {
  type: "started",
  at: "2026-10-09T10:00:00Z",
  stint: {
    id: "stint",
    workItem: "first",
    stage: "implement",
    ticket: 1,
    agent: "codex",
    worktree: { path: "/worktree", branch: "stintwork/first" },
    baseCommit: "base",
    brief: { prompt: "Work", skill: null, pointers: [], changedPaths: [], lastHandoff: null },
  },
};
const permission: Extract<StintLogEvent, { type: "permission_request" }> = {
  type: "permission_request",
  requestId: "request",
  toolCallId: "tool",
  title: "Check project",
  kind: "execute",
  automatic: false,
  details: "pnpm test --filter /full/path/to/project",
  options: [
    { optionId: "allow", name: "Yes", kind: "allow_once" },
    { optionId: "reject", name: "No", kind: "reject_once" },
  ],
};
const request: StintLogEntry = { type: "event", at: "2026-10-09T10:15:00Z", event: permission };

function project(entries: StintLogEntry[] = [started, request]) {
  return indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First",
      ".stintwork/local/stints/stint.jsonl": entries
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
    }),
    { name: "Project" },
  );
}

test("automatic permission requests stay in the durable stream without raising Needs-you attention", () => {
  const snapshot = project([started, { ...request, event: { ...permission, automatic: true } }]);
  expect(snapshot.warnings).toEqual([]);
  expect(snapshot.workItems[0].activeStint?.events).toContainEqual(
    expect.objectContaining({
      type: "permission_request",
      automatic: true,
      options: permission.options,
    }),
  );
  expect(snapshot.attentionItems).toEqual([]);
});

test("pending permissions carry source identity, actual options, full details and the log's request time", () => {
  const snapshot = project();
  expect(snapshot.attentionItems).toEqual([
    {
      kind: "permission",
      id: 'permission:["stint","request"]',
      workItem: "first",
      ticket: 1,
      stintId: "stint",
      agent: "codex",
      requestId: "request",
      title: permission.title,
      details: permission.details,
      raisedAt: request.at,
      options: permission.options,
    },
  ]);
  expect(deriveAttentionItems(snapshot)).toEqual(snapshot.attentionItems);
  expect(project().attentionItems).toEqual(snapshot.attentionItems);
  const extra: StintLogEntry = {
    type: "event",
    at: "2026-10-09T10:16:00Z",
    event: { type: "message", id: "text", text: "Waiting" },
  };
  expect(project([started, request, extra]).attentionItems).toEqual(snapshot.attentionItems);
});

test.each([
  { outcome: "selected" as const, optionId: "allow", kind: "allow_once" },
  { outcome: "cancelled" as const },
  { outcome: "failed" as const, reason: "Agent unavailable" },
])("a $outcome permission no longer needs the developer", (decision) => {
  expect(
    project([
      started,
      request,
      {
        type: "event",
        at: "2026-10-09T10:16:00Z",
        event: {
          type: "permission",
          requestId: permission.requestId,
          toolCallId: permission.toolCallId,
          title: permission.title,
          kind: permission.kind,
          automatic: false,
          decision,
        },
      },
    ]).attentionItems,
  ).toEqual([]);
});

test.each(["finished", "stopped", "failed", "interrupted"] as const)(
  "a %s stint cannot leave a permission in the rebuilt queue",
  (status) => {
    expect(
      project([started, request, { type: "ended", at: "2026-10-09T10:16:00Z", status }])
        .attentionItems,
    ).toEqual([]);
  },
);

test("legacy logs, repeated requests and stage-level stints preserve one stable item per source", () => {
  const legacy = { ...permission, title: null, details: undefined };
  const snapshot = project([
    { ...started, stint: { ...started.stint, ticket: null } },
    { ...request, event: legacy },
    { ...request, event: legacy },
  ]);
  expect(snapshot.attentionItems).toHaveLength(1);
  expect(snapshot.attentionItems[0]).toMatchObject({
    title: "Permission requested",
    details: "tool",
    ticket: null,
    raisedAt: request.at,
  });
});

test("multiple work items use distinct ids even for the same request id and are oldest first", () => {
  const first = project();
  const second = project([
    { ...started, stint: { ...started.stint, id: "second" } },
    { ...request, at: "2026-10-09T10:14:00Z" },
  ]);
  const items = deriveAttentionItems({
    workItems: [...first.workItems, { ...second.workItems[0], slug: "second" }],
  });
  expect(items.map((item) => item.stintId)).toEqual(["second", "stint"]);
  expect(new Set(items.map((item) => item.id)).size).toBe(2);
});

const handoff = {
  stint: "stint",
  agent: "codex",
  stoppedAt: "Implementation written.",
  unresolved: "Which format should the export use?",
  nextStep: "Ask the developer.",
};
const ended: StintLogEntry = {
  type: "ended",
  at: "2026-10-09T10:20:00Z",
  status: "finished",
  handoff,
};

test.each(["finished", "stopped", "failed", "interrupted"] as const)(
  "a %s stint's unresolved handoff needs the developer with a stable source identity",
  (status) => {
    const snapshot = project([started, request, { ...ended, status }]);
    expect(snapshot.attentionItems).toEqual([
      {
        kind: "handoff-unresolved",
        id: "handoff-unresolved:stint",
        workItem: "first",
        ticket: 1,
        stintId: "stint",
        agent: "codex",
        title: "Unresolved handoff",
        details: handoff.unresolved,
        raisedAt: ended.at,
      },
    ]);
    expect(project([started, request, { ...ended, status }]).attentionItems).toEqual(
      snapshot.attentionItems,
    );
  },
);

test.each([
  "",
  " ",
  "\r\n\t",
  "None",
  " none ",
  "NONE.",
  "**None**",
  "- None.",
  "_None_",
  "`None`",
])("an empty or None handoff (%j) does not need the developer", (unresolved) => {
  expect(
    project([started, { ...ended, handoff: { ...handoff, unresolved } }]).attentionItems,
  ).toEqual([]);
});

test.each([null, "Use CSV."])("an answered handoff (%s) is not rebuilt after restart", (note) => {
  const entries: StintLogEntry[] = [
    started,
    ended,
    { type: "handoff_answered", at: ended.at, note },
  ];
  expect(project(entries).attentionItems).toEqual([]);
  expect(project(entries).workItems[0].stints[0].handoffAnswer).toEqual({ at: ended.at, note });
});

test.each(["None, except format choice.", "- Which format?", "None.\nWhich format?"])(
  "unresolved content containing or following None (%j) still needs the developer",
  (unresolved) => {
    expect(
      project([started, { ...ended, handoff: { ...handoff, unresolved } }]).attentionItems,
    ).toMatchObject([{ kind: "handoff-unresolved", details: unresolved }]);
  },
);

test("an old unresolved handoff and an active permission coexist in oldest-first order", () => {
  const old = project([started, ended]);
  const current = project();
  expect(
    deriveAttentionItems({
      workItems: [{ ...old.workItems[0], activeStint: current.workItems[0].activeStint }],
    }).map((item) => item.kind),
  ).toEqual(["permission", "handoff-unresolved"]);
});

test("all four attention kinds keep stable ids and timestamp/id ordering", () => {
  const completed = project([started, ended]).workItems[0];
  completed.stage = "implement";
  const current = project([
    { ...started, stint: { ...started.stint, id: "current" } },
    { ...request, at: ended.at },
  ]).workItems[0];
  const snapshot = {
    workItems: [completed, { ...current, slug: "second" }],
    agents: [
      {
        id: "other-agent",
        displayName: "Other Agent",
        installationHint: "Install Other Agent",
        capabilities: {
          modes: [],
          defaultMode: null,
          additionalDirectories: false,
          permissionOptions: null,
          declineEndsTurn: null,
          authenticationRequired: {
            message: "Authentication required",
            loginCommand: "other login",
          },
          configOptions: [],
        },
        availability: { available: false, kind: "login-required" as const, checkedAt: ended.at },
      },
    ],
  };
  const items = deriveAttentionItems(snapshot);
  expect(items.map(({ id }) => id)).toEqual([
    'gate-ready:["first","implement"]',
    "handoff-unresolved:stint",
    'login-required:"other-agent"',
    'permission:["current","request"]',
  ]);
  expect(
    deriveAttentionItems({ ...snapshot, workItems: [...snapshot.workItems].reverse() }),
  ).toEqual(items);
  if (!current.activeStint) throw new Error("Expected an active stint");
  current.activeStint.events[0] = { ...permission, raisedAt: request.at };
  expect(deriveAttentionItems(snapshot).map(({ kind }) => kind)).toEqual([
    "permission",
    "gate-ready",
    "handoff-unresolved",
    "login-required",
  ]);
  completed.stints[0].handoffAnswer = { at: ended.at, note: null };
  expect(deriveAttentionItems(snapshot).map(({ id }) => id)).toEqual([
    'permission:["current","request"]',
    'gate-ready:["first","implement"]',
    'login-required:"other-agent"',
  ]);
});
