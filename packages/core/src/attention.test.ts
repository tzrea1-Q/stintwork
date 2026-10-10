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
