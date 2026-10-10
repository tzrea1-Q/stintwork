import {
  createMemoryRepoFiles,
  foldStintLog,
  indexProject,
  summarizeStint,
  deriveAttentionItems,
  type ProjectSnapshot,
  type StintLogEntry,
  type StintLogEvent,
} from "@stintwork/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useProjectSnapshot } from "./useProjectSnapshot";
import { attentionProfile, attentionSnapshot } from "./attention-test-fixtures";

const snapshot = indexProject(createMemoryRepoFiles({ ".scratch/board/spec.md": "# Pipeline" }), {
  name: "Stintwork",
});

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

test("login-required attention survives HTTP loading and live snapshot validation, then clears after login", async () => {
  const next = attentionSnapshot([], {
    ...attentionProfile,
    availability: { available: false, status: "login-required", checkedAt: "2026-10-09T10:00:00Z" },
  });
  vi.mocked(fetch).mockImplementation(async () => response(next));
  const { result } = renderHook(useProjectSnapshot);
  await waitFor(() => expect(result.current.snapshot?.attentionItems).toEqual(next.attentionItems));
  const socket = TestSocket.instances[0];
  act(() => socket.sendSnapshot(next));
  expect(result.current.connection).toBe("live");
  expect(result.current.snapshot?.attentionItems[0]?.kind).toBe("login-required");
  act(() => socket.sendSnapshot({ ...next, attentionItems: [] }));
  expect(result.current.snapshot?.attentionItems).toEqual([]);
  expect(socket.close).not.toHaveBeenCalled();
});

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
