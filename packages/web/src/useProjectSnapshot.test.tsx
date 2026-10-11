// SPDX-License-Identifier: Apache-2.0
import {
  createMemoryRepoFiles,
  foldStintLog,
  indexProject,
  summarizeStint,
  deriveAttentionItems,
  type ProjectSnapshot,
  type StintLogEntry,
  type StintLogEvent,
  type ReviewFindings,
  type CheckExecution,
} from "@stintwork/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useProjectSnapshot } from "./useProjectSnapshot";
import {
  attentionProfile,
  attentionSnapshot,
  loginAttentionProfile,
  mixedAttentionSnapshot,
} from "./attention-test-fixtures";

const snapshot = indexProject(createMemoryRepoFiles({ ".scratch/board/spec.md": "# Pipeline" }), {
  name: "Stintwork",
});

test("Review evidence and open memory proposals survive HTTP and live snapshots, blocking the gate", async () => {
  const next = structuredClone(snapshot);
  const item = next.workItems[0];
  item.stage = "review";
  item.column = "review";
  item.headCommit = "head";
  item.checkCommands = [];
  item.evidenceChangedPaths = { reviewed: [".scratch/board/review.yaml"] };
  item.stints = [
    {
      id: "review",
      workItem: "board",
      stage: "review",
      ticket: null,
      agent: "codex",
      status: "finished",
      startedAt: "2026-10-10T10:00:00Z",
      endedAt: "2026-10-10T10:01:00Z",
      checkpointCommit: "head",
      handoff: null,
      findings: { commit: "reviewed", findings: [] },
    },
  ];
  const proposal = {
    kind: "memory-proposal" as const,
    id: "proposal",
    workItem: "board",
    ticket: null,
    stintId: "review",
    agent: "codex",
    title: "Memory proposal",
    details: "Decide",
    raisedAt: "2026-10-10T10:01:00Z",
    path: "GLOSSARY.md",
    diff: "diff",
    baseCommit: "base",
    checkpointCommit: "head",
  };
  item.memoryProposals = [proposal];
  next.attentionItems = deriveAttentionItems(next);
  vi.mocked(fetch).mockImplementation(async () => response(next));
  const { result } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot).toEqual(next));
  expect(result.current.snapshot?.attentionItems).toEqual([proposal]);
  const accepted = structuredClone(next);
  accepted.workItems[0].memoryProposals = [];
  accepted.attentionItems = deriveAttentionItems(accepted);
  act(() => TestSocket.instances[0].sendSnapshot(accepted));
  expect(result.current.snapshot).toEqual(accepted);
  expect(result.current.snapshot?.attentionItems).toContainEqual(
    expect.objectContaining({ kind: "gate-ready", stage: "review" }),
  );
});

test.each([
  { evidenceChangedPaths: { reviewed: "not paths" } },
  { evidenceChangedPaths: { reviewed: [1] } },
  { evidenceChangedPaths: [] },
  { checkCommands: [{ name: "Test", command: 1 }] },
  { reviewEvidenceError: 1 },
])(
  "rejects malformed Review evidence fields without replacing the snapshot: %j",
  async (fields) => {
    const { result } = renderHook(useProjectSnapshot);
    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
    act(() =>
      TestSocket.instances[0].onmessage?.({
        data: JSON.stringify({ ...snapshot, workItems: [{ ...snapshot.workItems[0], ...fields }] }),
      }),
    );
    expect(result.current.snapshot).toEqual(snapshot);
    expect(result.current.connection).toBe("reconnecting");
  },
);

test.each<ReviewFindings>([
  { commit: "reviewed", findings: [] },
  {
    commit: "reviewed",
    findings: [
      {
        id: "stint:1",
        axis: "Spec",
        severity: "major",
        path: "file.ts",
        line: 1,
        title: "Limit",
        body: "Missing limit.",
      },
    ],
  },
  { commit: "reviewed", findings: null, error: "Malformed reply", rawReply: "Raw text" },
])(
  "live Review evidence is retained, reloaded over HTTP, and malformed evidence is rejected: %j",
  async (findings) => {
    const next = mixedAttentionSnapshot(loginAttentionProfile);
    vi.mocked(fetch).mockImplementation(async () => response(next));
    const { result, unmount } = renderHook(useProjectSnapshot);
    await waitFor(() => expect(result.current.snapshot).toEqual(next));
    act(() => TestSocket.instances[0].sendSnapshot(next));
    act(() =>
      TestSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "stint",
          stintId: "stint",
          workItem: "first",
          sequence: 1,
          entry: { type: "ended", at: "2026-10-10T10:00:00Z", status: "finished", findings },
        }),
      }),
    );
    expect(result.current.snapshot?.workItems[0].stints[0].findings).toEqual(findings);
    expect(result.current.connection).toBe("live");
    const ended = result.current.snapshot as ProjectSnapshot;
    unmount();
    vi.mocked(fetch).mockImplementation(async () => response(ended));
    const reloaded = renderHook(useProjectSnapshot);
    await waitFor(() => expect(reloaded.result.current.snapshot).toEqual(ended));
    const malformed = structuredClone(ended);
    malformed.workItems[0].stints[0].findings = { commit: "reviewed", findings: null };
    act(() => TestSocket.instances.at(-1)?.sendSnapshot(malformed));
    expect(reloaded.result.current.snapshot).toEqual(ended);
    expect(reloaded.result.current.connection).toBe("reconnecting");
  },
);

class TestSocket {
  static instances: TestSocket[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: URL) {
    TestSocket.instances.push(this);
  }
  sendSnapshot(next: ProjectSnapshot) {
    this.onmessage?.({ data: JSON.stringify(next) });
  }
}

function response(next = snapshot) {
  return new Response(JSON.stringify(next));
}

beforeEach(() => {
  TestSocket.instances = [];
  vi.stubGlobal("WebSocket", TestSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => response()),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("reads the initial project and replaces it with live snapshots", async () => {
  const { result } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
  expect(fetch).toHaveBeenCalledWith(
    "/api/project",
    expect.objectContaining({ cache: "no-store" }),
  );
  expect(TestSocket.instances[0].url.pathname).toBe("/api/live");
  expect(TestSocket.instances[0].url.protocol).toBe("ws:");
  act(() => TestSocket.instances[0].sendSnapshot({ ...snapshot, branch: "changed" }));
  expect(result.current.snapshot?.branch).toBe("changed");
  expect(result.current.connection).toBe("live");
});

test("check frames update commit-scoped evidence without reconnecting or discarding the project", async () => {
  const { result } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
  act(() => TestSocket.instances[0].sendSnapshot(snapshot));
  const execution: CheckExecution = {
    id: "12345678-1234-1234-1234-123456789abc",
    workItem: "board",
    commit: "a".repeat(40),
    startedAt: "2026-10-10T00:00:00Z",
    endedAt: null,
    results: [
      {
        name: "test",
        command: "npm run test",
        commit: "a".repeat(40),
        status: "running",
        durationMs: 0,
        outputExcerpt: "streamed",
      },
    ],
  };
  act(() =>
    TestSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: "checks", execution }) }),
  );
  expect(result.current.snapshot?.workItems[0].checks).toEqual(execution.results);
  expect(result.current.snapshot?.workItems[0].checkExecution).toEqual(execution);
  expect(result.current.connection).toBe("live");
  expect(TestSocket.instances[0].close).not.toHaveBeenCalled();
});

test.each([attentionProfile, loginAttentionProfile])(
  "mixed attention kinds load over HTTP and live snapshots with availability $availability",
  async (profile) => {
    const next = mixedAttentionSnapshot(profile);
    vi.mocked(fetch).mockImplementation(async () => response(next));
    const { result } = renderHook(useProjectSnapshot);
    await waitFor(() => expect(result.current.snapshot).toEqual(next));
    act(() => TestSocket.instances[0].sendSnapshot(next));
    expect(result.current.connection).toBe("live");
    const answered = structuredClone(next);
    answered.workItems[1].stints[0].handoffAnswer = { at: "2026-10-09T12:00:00Z", note: null };
    answered.attentionItems = deriveAttentionItems(answered);
    act(() => TestSocket.instances[0].sendSnapshot(answered));
    expect(result.current.snapshot?.attentionItems.map(({ kind }) => kind)).toEqual([
      "permission",
      "gate-ready",
      ...(profile.availability?.kind === "login-required" ? ["login-required"] : []),
    ]);
    expect(result.current.connection).toBe("live");
    expect(TestSocket.instances[0].close).not.toHaveBeenCalled();
  },
);

test.each([
  { workItem: "first" },
  { ticket: 1 },
  { stintId: "stint" },
  { agent: null },
  { loginCommand: undefined },
  { loginCommand: 42 },
  { loginCommand: " " },
  { kind: "unknown" },
])("malformed login attention (%j) cannot replace the last valid snapshot", async (fields) => {
  const next = mixedAttentionSnapshot(loginAttentionProfile);
  vi.mocked(fetch).mockImplementation(async () => response(next));
  const { result } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot).toEqual(next));
  const login = next.attentionItems.find(({ kind }) => kind === "login-required");
  act(() =>
    TestSocket.instances[0].onmessage?.({
      data: JSON.stringify({ ...next, attentionItems: [{ ...login, ...fields }] }),
    }),
  );
  expect(result.current.snapshot).toEqual(next);
  expect(result.current.connection).toBe("reconnecting");
});

test("a live stint ending preserves gate, handoff and agent-wide login attention while replacing its permission", async () => {
  const next = mixedAttentionSnapshot(loginAttentionProfile);
  vi.mocked(fetch).mockImplementation(async () => response(next));
  const { result } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot).toEqual(next));
  act(() => TestSocket.instances[0].sendSnapshot(next));
  act(() =>
    TestSocket.instances[0].onmessage?.({
      data: JSON.stringify({
        type: "stint",
        stintId: "stint",
        workItem: "first",
        sequence: 1,
        entry: {
          type: "ended",
          at: "2026-10-09T12:00:00Z",
          status: "finished",
          handoff: {
            stint: "stint",
            agent: loginAttentionProfile.id,
            stoppedAt: "Export written.",
            unresolved: "Which separator?",
            nextStep: "Choose the separator.",
          },
        },
      }),
    }),
  );
  const items = result.current.snapshot?.attentionItems;
  expect(items?.slice(0, 3)).toEqual(
    next.attentionItems.filter(({ kind }) => kind !== "permission"),
  );
  expect(items?.[3]).toMatchObject({ kind: "handoff-unresolved", id: "handoff-unresolved:stint" });
  expect(result.current.connection).toBe("live");
  expect(TestSocket.instances[0].close).not.toHaveBeenCalled();
});

test("gates without stint evidence accept nullable sources over HTTP and live snapshots", async () => {
  const next = mixedAttentionSnapshot();
  next.workItems[1].stints = [];
  next.attentionItems = deriveAttentionItems(next);
  expect(next.attentionItems[0]).toMatchObject({
    kind: "gate-ready",
    stintId: null,
    agent: null,
    raisedAt: "1970-01-01T00:00:00.000Z",
  });
  vi.mocked(fetch).mockImplementation(async () => response(next));
  const { result } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot).toEqual(next));
  act(() => TestSocket.instances[0].sendSnapshot(next));
  expect(result.current.connection).toBe("live");
});

test.each([{ stage: "unknown" }, { agent: 42 }, { stintId: 42 }, { ticket: 1 }])(
  "malformed gate attention (%j) cannot replace the last valid snapshot",
  async (fields) => {
    const { result } = renderHook(useProjectSnapshot);
    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
    const malformed = mixedAttentionSnapshot();
    const gate = malformed.attentionItems.find(({ kind }) => kind === "gate-ready");
    act(() =>
      TestSocket.instances[0].onmessage?.({
        data: JSON.stringify({ ...malformed, attentionItems: [{ ...gate, ...fields }] }),
      }),
    );
    expect(result.current.snapshot).toEqual(snapshot);
    expect(result.current.connection).toBe("reconnecting");
  },
);

test.each([null, "Use CSV."])(
  "unresolved handoffs load from HTTP and live snapshots, and a persisted answer (%s) removes them",
  async (note) => {
    const next = attentionSnapshot([]);
    const item = next.workItems[0];
    item.activeStint = null;
    item.stints[0] = {
      ...item.stints[0],
      status: "finished",
      endedAt: "2026-10-09T11:00:00Z",
      handoff: {
        stint: "stint",
        agent: "custom-agent",
        stoppedAt: "Export written.",
        unresolved: "Which format?",
        nextStep: "Choose the format.",
      },
    };
    next.attentionItems = deriveAttentionItems(next);
    vi.mocked(fetch).mockImplementation(async () => response(next));
    const { result } = renderHook(useProjectSnapshot);
    await waitFor(() => expect(result.current.snapshot).toEqual(next));
    act(() => TestSocket.instances[0].sendSnapshot(next));
    expect(result.current.connection).toBe("live");
    const answered = structuredClone(next);
    answered.workItems[0].stints[0].handoffAnswer = { at: "2026-10-09T12:00:00Z", note };
    answered.attentionItems = deriveAttentionItems(answered);
    act(() => TestSocket.instances[0].sendSnapshot(answered));
    expect(result.current.snapshot?.attentionItems).toEqual([]);
    expect(result.current.connection).toBe("live");
    expect(TestSocket.instances[0].close).not.toHaveBeenCalled();
  },
);

test("malformed handoff answer data cannot replace the last valid snapshot", async () => {
  const { result } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
  const malformed = attentionSnapshot([]);
  malformed.workItems[0].stints[0].handoffAnswer = { at: "not a time", note: "Use CSV." };
  act(() => TestSocket.instances[0].sendSnapshot(malformed));
  expect(result.current.snapshot).toEqual(snapshot);
  expect(result.current.connection).toBe("reconnecting");
});

test.each([{ details: 42 }, { raisedAt: "not a time" }, { kind: "unknown" }])(
  "malformed handoff attention (%j) cannot replace the last valid snapshot",
  async (fields) => {
    const { result } = renderHook(useProjectSnapshot);
    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
    const original = attentionSnapshot();
    act(() =>
      TestSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          ...original,
          attentionItems: [
            { ...original.attentionItems[0], kind: "handoff-unresolved", ...fields },
          ],
        }),
      }),
    );
    expect(result.current.snapshot).toEqual(snapshot);
    expect(result.current.connection).toBe("reconnecting");
  },
);

test("stint messages share the snapshot connection, merge chunks and finish without reconnecting", async () => {
  const { result } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
  const socket = TestSocket.instances[0];
  act(() => socket.sendSnapshot(snapshot));
  const send = (sequence: number, entry: StintLogEntry) =>
    act(() =>
      socket.onmessage?.({
        data: JSON.stringify({
          type: "stint",
          stintId: "first",
          workItem: "board",
          sequence,
          entry,
        }),
      }),
    );
  const at = "2026-10-09T10:00:00Z";
  send(1, {
    type: "started",
    at,
    stint: {
      id: "first",
      workItem: "board",
      stage: "implement",
      ticket: 1,
      agent: "codex",
      worktree: { path: "/worktree", branch: "stintwork/board" },
      baseCommit: "base",
      brief: {
        skill: null,
        pointers: [],
        lastHandoff: null,
        changedPaths: [],
        prompt: "Read first",
      },
    },
  });
  send(2, { type: "event", at, event: { type: "message_delta", id: "1", text: "Hello " } });
  send(3, { type: "event", at, event: { type: "message_delta", id: "1", text: "world" } });
  send(2, { type: "event", at, event: { type: "message_delta", id: "1", text: "Stale text" } });
  expect(result.current.snapshot?.workItems[0].activeStint?.events).toEqual([
    { type: "message", id: "1", text: "Hello world" },
  ]);
  const permission = {
    type: "permission" as const,
    toolCallId: "git",
    title: "git add",
    kind: "execute",
    automatic: true,
    decision: { outcome: "selected" as const, optionId: "reject", kind: "reject_once" },
  };
  send(4, { type: "event", at, event: permission });
  expect(result.current.snapshot?.workItems[0].activeStint?.events).toEqual([
    { type: "message", id: "1", text: "Hello world" },
    permission,
  ]);
  expect(result.current.connection).toBe("live");
  expect(socket.close).not.toHaveBeenCalled();
  const handoff = {
    stint: "first",
    agent: "codex",
    stoppedAt: "Code",
    unresolved: "Checks",
    nextStep: "Review",
  };
  send(5, {
    type: "ended",
    at: "2026-10-09T10:01:00Z",
    status: "finished",
    checkpointCommit: "checkpoint",
    handoff,
  });
  expect(result.current.snapshot?.workItems[0].activeStint).toBeNull();
  expect(result.current.snapshot?.workItems[0].stints[0]).toMatchObject({
    id: "first",
    status: "finished",
    endedAt: "2026-10-09T10:01:00Z",
    checkpointCommit: "checkpoint",
    handoff,
  });
});

test("does not let a delayed GET overwrite a newer live snapshot", async () => {
  let resolveRequest: (value: ReturnType<typeof response>) => void = () => {};
  vi.mocked(fetch).mockReturnValue(
    new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }),
  );
  const { result } = renderHook(useProjectSnapshot);
  act(() => TestSocket.instances[0].sendSnapshot({ ...snapshot, name: "Newer project" }));
  await act(async () => {
    resolveRequest(response());
  });
  expect(result.current.snapshot?.name).toBe("Newer project");
});

test("a reconnect snapshot restores rich events and pending permissions, then merges live tool updates and decisions", async () => {
  const at = "2026-10-09T10:00:00Z";
  const rich: StintLogEvent[] = [
    {
      type: "plan",
      id: "plan",
      entries: [{ content: "Edit", priority: "high", status: "in_progress" }],
    },
    {
      type: "tool_call",
      toolCallId: "edit",
      title: "Edit file",
      kind: "edit",
      status: "in_progress",
      locations: [{ path: "/worktree/file" }],
    },
    { type: "file_edit", toolCallId: "edit", path: "/worktree/file" },
    {
      type: "permission_request",
      requestId: "request",
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
    },
  ];
  const active = foldStintLog([
    {
      type: "started",
      at,
      stint: {
        id: "first",
        workItem: "board",
        stage: "implement",
        ticket: 1,
        agent: "codex",
        worktree: { path: "/worktree", branch: "stintwork/board" },
        baseCommit: "base",
        brief: { skill: null, pointers: [], lastHandoff: null, changedPaths: [], prompt: "Work" },
      },
    },
    ...rich.map((event): StintLogEntry => ({ type: "event", at, event })),
  ]);
  if (!active) throw new Error("Expected a stint");
  const next: ProjectSnapshot = {
    ...snapshot,
    workItems: snapshot.workItems.map((item) => ({
      ...item,
      activeStint: active,
      stints: [summarizeStint(active)],
    })),
  };
  next.attentionItems = deriveAttentionItems(next);
  const { result } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
  const socket = TestSocket.instances[0];
  act(() => socket.sendSnapshot(next));
  expect(result.current.snapshot?.workItems[0].activeStint?.events).toEqual(active.events);
  expect(result.current.snapshot?.attentionItems).toMatchObject([
    { requestId: "request", raisedAt: at },
  ]);
  const updates: StintLogEvent[] = [
    {
      type: "tool_call_update",
      toolCallId: "edit",
      status: "completed",
      content: [{ type: "text", text: "Saved" }],
    },
    {
      type: "permission",
      requestId: "request",
      toolCallId: "git",
      title: "git add",
      kind: "execute",
      automatic: false,
      decision: { outcome: "selected", optionId: "cancel", kind: "reject_once" },
    },
  ];
  updates.forEach((event, index) => {
    act(() =>
      socket.onmessage?.({
        data: JSON.stringify({
          type: "stint",
          stintId: "first",
          workItem: "board",
          sequence: index + 1,
          entry: { type: "event", at, event },
        }),
      }),
    );
  });
  expect(result.current.snapshot?.workItems[0].activeStint?.events).toMatchObject([
    rich[0],
    { ...rich[1], status: "completed", content: [{ type: "text", text: "Saved" }] },
    rich[2],
    rich[3],
    updates[1],
  ]);
  expect(result.current.connection).toBe("live");
  expect(result.current.snapshot?.attentionItems).toEqual([]);
  expect(socket.close).not.toHaveBeenCalled();
});

test("reconnects after a socket failure, polls GET while offline, and stops polling when live", async () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(useProjectSnapshot);
  await act(async () => {});
  act(() => TestSocket.instances[0].sendSnapshot(snapshot));
  act(() => TestSocket.instances[0].onerror?.());
  expect(result.current.connection).toBe("reconnecting");
  expect(TestSocket.instances[0].close).toHaveBeenCalledOnce();
  expect(TestSocket.instances[0].onclose).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(TestSocket.instances).toHaveLength(2);
  vi.mocked(fetch).mockImplementation(async () =>
    response({ ...snapshot, name: "Polled project" }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(result.current.snapshot?.name).toBe("Polled project");
  act(() => TestSocket.instances[1].sendSnapshot(snapshot));
  const requests = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(fetch).toHaveBeenCalledTimes(requests);
  unmount();
  expect(TestSocket.instances[1].close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test("falls back when WebSocket is unavailable and retries failed GET requests", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", undefined);
  vi.mocked(fetch).mockRejectedValueOnce(new Error("Server unavailable"));
  const { result, unmount } = renderHook(useProjectSnapshot);
  await act(async () => {});
  expect(result.current.error).toBe("Server unavailable");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(result.current.snapshot).toEqual(snapshot);
  expect(result.current.error).toBeUndefined();
  expect(result.current.connection).toBe("reconnecting");
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test("rejects malformed live data without discarding the last usable project", async () => {
  const { result, unmount } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
  act(() => TestSocket.instances[0].onmessage?.({ data: '{"workItems":[{}]}' }));
  expect(result.current.snapshot).toEqual(snapshot);
  expect(result.current.connection).toBe("reconnecting");
  unmount();
});

test.each([
  { spec: { path: ".scratch/board/spec.md", text: 42 } },
  {
    tickets: [
      {
        number: 1,
        slug: "slice",
        title: "Slice",
        status: "open",
        body: "# Slice",
        path: ".scratch/board/issues/01-slice.md",
        resolved: false,
        blocked: false,
        blockedBy: null,
      },
    ],
  },
  {
    tickets: [
      {
        number: 1,
        slug: "slice",
        title: "Slice",
        status: "open",
        body: null,
        path: ".scratch/board/issues/01-slice.md",
        resolved: false,
        blocked: false,
        blockedBy: [],
      },
    ],
  },
])("rejects malformed drawer content without replacing the snapshot: %j", async (fields) => {
  const { result, unmount } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
  act(() =>
    TestSocket.instances[0].onmessage?.({
      data: JSON.stringify({ ...snapshot, workItems: [{ ...snapshot.workItems[0], ...fields }] }),
    }),
  );
  expect(result.current.snapshot).toEqual(snapshot);
  expect(result.current.connection).toBe("reconnecting");
  unmount();
});

test("aborts pending requests and detaches socket handlers on unmount", () => {
  vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
  const { unmount } = renderHook(useProjectSnapshot);
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  unmount();
  expect(signal?.aborted).toBe(true);
  expect(TestSocket.instances[0].onmessage).toBeNull();
  expect(TestSocket.instances[0].close).toHaveBeenCalledOnce();
});

test("live request and stint-end entries update attention items immediately without a full snapshot", async () => {
  const initial = attentionSnapshot([]);
  vi.mocked(fetch).mockResolvedValue(response(initial));
  const { result } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot).toEqual(initial));
  const socket = TestSocket.instances[0];
  act(() => socket.sendSnapshot(initial));
  const pending = attentionSnapshot();
  const event = pending.workItems[0].activeStint?.events[0];
  if (!event) throw new Error("Expected a permission request.");
  function send(sequence: number, entry: StintLogEntry) {
    act(() =>
      socket.onmessage?.({
        data: JSON.stringify({
          type: "stint",
          stintId: "stint",
          workItem: "first",
          sequence,
          entry,
        }),
      }),
    );
  }
  send(1, { type: "event", at: "2026-10-09T10:15:00Z", event });
  expect(result.current.snapshot?.attentionItems).toEqual(pending.attentionItems);
  send(1, { type: "event", at: "2026-10-09T10:15:00Z", event });
  expect(result.current.snapshot?.attentionItems).toHaveLength(1);
  send(2, { type: "ended", at: "2026-10-09T10:16:00Z", status: "failed" });
  expect(result.current.snapshot?.attentionItems).toEqual([]);
});

test.each([
  { attentionItems: null },
  { attentionItems: [{ ...attentionSnapshot().attentionItems[0], options: null }] },
  { attentionItems: [{ ...attentionSnapshot().attentionItems[0], raisedAt: "not a date" }] },
  { agents: [{ id: "agent", displayName: "Agent", capabilities: { declineEndsTurn: "yes" } }] },
])(
  "rejects malformed attention snapshots while retaining the last usable project: %j",
  async (fields) => {
    const { result, unmount } = renderHook(useProjectSnapshot);
    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
    act(() =>
      TestSocket.instances[0].onmessage?.({ data: JSON.stringify({ ...snapshot, ...fields }) }),
    );
    expect(result.current.snapshot).toEqual(snapshot);
    expect(result.current.connection).toBe("reconnecting");
    unmount();
  },
);

test("times out a socket that never sends its initial snapshot", async () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(useProjectSnapshot);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8000);
  });
  expect(result.current.snapshot).toEqual(snapshot);
  expect(result.current.connection).toBe("reconnecting");
  expect(TestSocket.instances[0].close).toHaveBeenCalledOnce();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(TestSocket.instances).toHaveLength(2);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
