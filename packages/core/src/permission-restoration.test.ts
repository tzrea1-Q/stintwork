// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import {
  applyStintLogEntry,
  foldStintLog,
  isStintLogEntry,
  type StintLogEntry,
  type Stint,
} from "./stints.js";
import { pendingStintPermissions } from "./stint-permissions.js";

const start: StintLogEntry = {
  type: "started",
  at: "2026-01-01T00:00:00Z",
  stint: {
    id: "stint",
    workItem: "first",
    stage: "implement",
    ticket: 1,
    agent: "codex",
    worktree: { path: "/worktree", branch: "stintwork/first" },
    baseCommit: "base",
    brief: { skill: null, pointers: [], lastHandoff: null, changedPaths: [], prompt: "Work" },
  },
};
const request = {
  type: "permission_request" as const,
  requestId: "old",
  attemptId: "before",
  binding: "live" as const,
  toolCallId: "before:tool",
  title: "Edit",
  kind: "edit",
  automatic: false,
  details: '{"toolCallId":"tool","rawInput":{"path":"a"}}',
  options: [{ optionId: "yes", name: "Yes", kind: "allow_once" }],
};
const event = (event: unknown): StintLogEntry =>
  ({ type: "event", at: "2026-01-01T00:01:00Z", event }) as StintLogEntry;

test("restart keeps original manual details and age, disables the binding and collapses a fresh reissue", () => {
  let stint = foldStintLog([
    start,
    event(request),
    { type: "recovery", version: 1, at: "2026-01-02T00:00:00Z", kind: "resume", state: "resuming" },
  ]) as Stint;
  expect(pendingStintPermissions(stint)).toEqual([
    expect.objectContaining({
      ...request,
      binding: "reconnecting",
      raisedAt: "2026-01-01T00:01:00Z",
    }),
  ]);
  stint = applyStintLogEntry(
    stint,
    event({
      ...request,
      requestId: "new",
      attemptId: "after",
      logicalRequestId: "old",
      raisedAt: "2026-01-01T00:01:00Z",
    }),
  ) as Stint;
  expect(pendingStintPermissions(stint)).toEqual([
    expect.objectContaining({
      requestId: "new",
      logicalRequestId: "old",
      binding: "live",
      attemptId: "after",
    }),
  ]);
});

test("selection waits for transport proof; crash ambiguity asks again; written/failed/retired and endings clear attention", () => {
  const selected = event({
    type: "permission",
    requestId: "old",
    attemptId: "before",
    toolCallId: "tool",
    title: "Edit",
    kind: "edit",
    automatic: false,
    decision: { outcome: "selected", optionId: "yes", kind: "allow_once" },
  });
  const stint = foldStintLog([start, event(request), selected]) as Stint;
  expect(pendingStintPermissions(stint)).toHaveLength(1);
  for (const outcome of ["written", "failed", "retired"]) {
    const delivery = event({
      type: "permission_delivery",
      requestId: "old",
      attemptId: "before",
      outcome,
    });
    expect(isStintLogEntry(delivery)).toBe(true);
    expect(pendingStintPermissions(applyStintLogEntry(stint, delivery) as Stint)).toEqual([]);
  }
  expect(
    isStintLogEntry(event({ type: "permission_delivery", requestId: "old", outcome: "written" })),
  ).toBe(false);
  expect(
    pendingStintPermissions(
      applyStintLogEntry(stint, { type: "ended", at: start.at, status: "interrupted" }) as Stint,
    ),
  ).toEqual([]);
  for (const state of ["suspending", "suspended", "fallback"] as const) {
    const updated = applyStintLogEntry(stint, {
      type: "recovery",
      version: 1,
      at: start.at,
      kind: "resume",
      state,
    }) as Stint;
    expect(pendingStintPermissions(updated)).toEqual([]);
  }
});

test("a pre-receipt-format selection is uncertain on restart, while cancelled and automatic history stays unavailable", () => {
  const legacy = { ...request, attemptId: undefined, binding: undefined };
  const selected = {
    type: "permission",
    requestId: "old",
    toolCallId: "tool",
    title: "Edit",
    kind: "edit",
    automatic: false,
    decision: { outcome: "selected", optionId: "yes", kind: "allow_once" },
  };
  const stint = foldStintLog([start, event(legacy), event(selected)]) as Stint;
  expect(pendingStintPermissions(stint)).toEqual([]);
  const resumed = applyStintLogEntry(stint, {
    type: "recovery",
    version: 1,
    at: start.at,
    kind: "resume",
    state: "resuming",
  }) as Stint;
  expect(pendingStintPermissions(resumed)).toEqual([
    expect.objectContaining({ requestId: "old", binding: "reconnecting" }),
  ]);
  expect(
    pendingStintPermissions(
      applyStintLogEntry(
        resumed,
        event({ ...selected, decision: { outcome: "cancelled" } }),
      ) as Stint,
    ),
  ).toEqual([]);
  expect(
    pendingStintPermissions(
      foldStintLog([start, event({ ...legacy, automatic: true }), event(selected)]) as Stint,
    ),
  ).toEqual([]);
});

test("an old attempt's late receipt cannot retire a reused ID's current request", () => {
  const stint = foldStintLog([
    start,
    event(request),
    event({ ...request, attemptId: "new" }),
    event({
      type: "permission_delivery",
      requestId: "old",
      attemptId: "before",
      outcome: "written",
    }),
  ]) as Stint;
  expect(pendingStintPermissions(stint)).toEqual([expect.objectContaining({ attemptId: "new" })]);
});

test("durable Stop immediately disables preceding bindings while a later handoff can ask for fresh permission", () => {
  const stint = foldStintLog([
    start,
    event(request),
    { type: "recovery", version: 1, at: start.at, kind: "stop_requested" },
  ]) as Stint;
  expect(pendingStintPermissions(stint)).toEqual([]);
  const handoff = applyStintLogEntry(stint, event({ ...request, requestId: "handoff" })) as Stint;
  expect(pendingStintPermissions(handoff)).toEqual([
    expect.objectContaining({ requestId: "handoff", binding: "live" }),
  ]);
});
