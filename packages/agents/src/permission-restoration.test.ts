// SPDX-License-Identifier: Apache-2.0
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import {
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type { StintLogEvent, StintEvent } from "@stintwork/core";
import { afterEach, expect, test, vi } from "vitest";
import { createAgentLauncher, type AgentStintOptions } from "./index.js";
import { fakeAgentProfiles } from "./profiles.js";
import { toAcpReadable } from "./stdio.js";

function signal<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => vi.useRealTimers());
const toolCall = {
  toolCallId: "edit",
  title: "Edit file",
  kind: "edit" as const,
  rawInput: { path: "/tmp/a" },
};
const options = [
  { optionId: "yes", name: "Allow", kind: "allow_once" as const },
  { optionId: "no", name: "Reject", kind: "reject_once" as const },
];
const saved: Extract<StintEvent, { type: "permission_request" }> = {
  type: "permission_request",
  requestId: "old",
  attemptId: "old-attempt",
  binding: "reconnecting",
  toolCallId: "old-attempt:edit",
  title: toolCall.title,
  kind: "edit",
  automatic: false,
  raisedAt: "2026-01-01T00:01:00Z",
  details: JSON.stringify(toolCall),
  options: [...options].reverse(),
};
function fixture(
  point: "load" | "load-detached" | "work" | "absent",
  request: RequestPermissionRequest["toolCall"] = toolCall,
  changeOptions = false,
  failWrite = false,
  phase: "work" | "handoff" | "findings" = "work",
  optionMetadata = false,
  restored = [saved],
) {
  const input = new PassThrough();
  const stdin = failWrite
    ? new Writable({
        write(chunk, encoding, callback) {
          if (chunk.toString().includes('"outcome":"selected"'))
            callback(new Error("Restored transport write failed"));
          else input.write(chunk, encoding, callback);
        },
      })
    : input;
  const child = Object.assign(new EventEmitter(), {
    stdin,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null,
    pid: undefined,
    kill: () => {
      queueMicrotask(() => child.emit("exit", 0, "SIGTERM"));
      return true;
    },
    unref() {},
  });
  const received = signal<RequestPermissionResponse>();
  const prompted = signal();
  const finish = signal();
  const events: StintLogEvent[] = [];
  let callback!: Parameters<NonNullable<AgentStintOptions["onPermission"]>>[0];
  const published = signal();
  const answer = signal<RequestPermissionResponse>();
  let asks = 0;
  const effects: string[] = [];
  new AgentSideConnection(
    (client) => {
      const ask = async () => {
        const response = await client.requestPermission({
          sessionId: "same",
          toolCall: request,
          options: changeOptions
            ? options.map((option) => ({ ...option, name: `${option.name} now` }))
            : options.map((option) => ({
                ...option,
                ...(optionMetadata ? { _meta: { adapter: "live-only" } } : {}),
              })),
        });
        if (response.outcome.outcome === "selected" && response.outcome.optionId === "yes")
          effects.push("edit");
        received.resolve(response);
      };
      return {
        async initialize() {
          return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true } };
        },
        async authenticate() {
          throw new Error("Unexpected authentication");
        },
        async newSession() {
          throw new Error("Must load the saved session");
        },
        async loadSession() {
          if (point === "load") await ask();
          if (point === "load-detached") void ask().catch(() => {});
          return {
            modes: {
              currentModeId: "acceptEdits",
              availableModes: [{ id: "acceptEdits", name: "Edits" }],
            },
          };
        },
        async setSessionMode() {
          return {};
        },
        async prompt() {
          asks++;
          prompted.resolve();
          if (point === "work") await ask();
          await finish.promise;
          return { stopReason: "end_turn" as const };
        },
        async cancel() {
          finish.resolve();
        },
      };
    },
    ndJsonStream(Writable.toWeb(child.stdout), toAcpReadable(input)),
  );
  const stint = createAgentLauncher(
    () => child as unknown as ChildProcessWithoutNullStreams,
    fakeAgentProfiles.claude,
  )({
    agent: "claude",
    cwd: "/tmp",
    prompt: "",
    permissionLevel: "edit-freely",
    resume: { sessionId: "same", progress: { phase }, permissions: restored },
    ...(phase !== "work" ? { afterTurnTimeoutMs: 1000 } : {}),
    onPermission(request) {
      callback = request;
      return answer.promise;
    },
    onEvent(event) {
      events.push(event);
      if (event.type === "permission_request") published.resolve();
    },
  });
  return {
    stint,
    events,
    effects,
    published,
    received,
    answer,
    prompted,
    finish,
    callback: () => callback,
    asks: () => asks,
  };
}

test.each(["yes", "no"])(
  "a manual permission during load waits for fresh %s consent before continuation and records transport proof",
  async (optionId) => {
    const f = fixture("load");
    await f.published.promise;
    expect(f.events).toContainEqual(
      expect.objectContaining({
        type: "permission_request",
        automatic: false,
        logicalRequestId: "old",
        raisedAt: saved.raisedAt,
        attemptId: expect.any(String),
        binding: "live",
      }),
    );
    expect(f.callback()).toBeDefined();
    expect(f.asks()).toBe(0);
    f.answer.resolve({ outcome: { outcome: "selected", optionId } });
    await f.callback().forwarded;
    await expect(f.received.promise).resolves.toMatchObject({ outcome: { optionId } });
    await f.prompted.promise;
    f.finish.resolve();
    await f.stint.done;
    expect(f.events).toContainEqual(
      expect.objectContaining({
        type: "permission_delivery",
        outcome: "written",
        requestId: f.callback().requestId,
      }),
    );
    expect(f.callback().requestId).not.toBe("old");
    expect(f.effects).toEqual(optionId === "yes" ? ["edit"] : []);
  },
);

test.each([
  { name: "details", tool: { ...toolCall, rawInput: { path: "/tmp/b" } }, changeOptions: false },
  { name: "title", tool: { ...toolCall, title: "Different operation" }, changeOptions: false },
  { name: "kind", tool: { ...toolCall, kind: "execute" as const }, changeOptions: false },
  { name: "name", tool: { ...toolCall, name: "Other tool" }, changeOptions: false },
  { name: "status", tool: { ...toolCall, status: "in_progress" as const }, changeOptions: false },
  {
    name: "content",
    tool: {
      ...toolCall,
      content: [
        { type: "content" as const, content: { type: "text" as const, text: "Different details" } },
      ],
    },
    changeOptions: false,
  },
  { name: "options", tool: toolCall, changeOptions: true },
])(
  "changed $name requires fresh manual consent and retires the old request before the new answer",
  async ({ tool, changeOptions }) => {
    const f = fixture("work", { ...tool, toolCallId: "new-turn" }, changeOptions);
    await f.published.promise;
    const request = f.events.find((event) => event.type === "permission_request");
    expect(request).toMatchObject({ automatic: false, binding: "live" });
    expect(request).not.toHaveProperty("logicalRequestId");
    expect(request).not.toHaveProperty("raisedAt");
    expect(f.events).toContainEqual({
      type: "permission_delivery",
      requestId: "old",
      attemptId: "old-attempt",
      outcome: "retired",
    });
    f.answer.resolve({ outcome: { outcome: "selected", optionId: "no" } });
    await f.received.promise;
    f.finish.resolve();
    await f.stint.done;
    expect(f.events).toContainEqual({
      type: "permission_delivery",
      requestId: "old",
      attemptId: "old-attempt",
      outcome: "retired",
    });
  },
);

test("a turn that never reissues the saved callback retires it without manufacturing an answer", async () => {
  const f = fixture("absent");
  await f.prompted.promise;
  f.finish.resolve();
  await f.stint.done;
  expect(
    f.events.filter((event) => event.type === "permission_request" || event.type === "permission"),
  ).toEqual([]);
  expect(f.events).toContainEqual({
    type: "permission_delivery",
    requestId: "old",
    attemptId: "old-attempt",
    outcome: "retired",
  });
});

test("a restored selection with a broken transport records failure and never reports delivery or executes the tool", async () => {
  const f = fixture("work", toolCall, false, true);
  await f.published.promise;
  f.answer.resolve({ outcome: { outcome: "selected", optionId: "yes" } });
  await expect(f.callback().forwarded).rejects.toThrow("Restored transport write failed");
  await expect(f.stint.done).rejects.toThrow("Restored transport write failed");
  expect(f.events).toContainEqual(
    expect.objectContaining({
      type: "permission",
      decision: { outcome: "selected", optionId: "yes", kind: "allow_once" },
    }),
  );
  expect(f.events).toContainEqual(
    expect.objectContaining({ type: "permission_delivery", outcome: "failed" }),
  );
  expect(f.events).not.toContainEqual(
    expect.objectContaining({ type: "permission_delivery", outcome: "written" }),
  );
  expect(f.effects).toEqual([]);
});

test.each(["handoff", "findings"] as const)(
  "a completed resumed %s turn retires a saved request that was not reissued",
  async (phase) => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "performance"] });
    const f = fixture("absent", toolCall, false, false, phase);
    await f.prompted.promise;
    f.finish.resolve();
    await f.stint.done;
    expect(f.events).toContainEqual({
      type: "permission_delivery",
      requestId: "old",
      attemptId: "old-attempt",
      outcome: "retired",
    });
    expect(f.events.filter((event) => event.type === "permission")).toEqual([]);
  },
);

test("load can return while its live callback waits; no continuation prompt overtakes the developer answer", async () => {
  const f = fixture("load-detached");
  await f.published.promise;
  expect(f.asks()).toBe(0);
  f.answer.resolve({ outcome: { outcome: "selected", optionId: "no" } });
  await f.callback().forwarded;
  await f.prompted.promise;
  f.finish.resolve();
  await f.stint.done;
  expect(f.effects).toEqual([]);
});

test("option _meta does not turn an identical reissue into fresh consent or lose its original age", async () => {
  const f = fixture("work", toolCall, false, false, "work", true);
  await f.published.promise;
  const request = f.events.find((event) => event.type === "permission_request");
  expect(request).toMatchObject({ logicalRequestId: "old", raisedAt: saved.raisedAt, options });
  f.answer.resolve({ outcome: { outcome: "selected", optionId: "no" } });
  await f.callback().forwarded;
  await f.received.promise;
  f.finish.resolve();
  await f.stint.done;
  expect(f.events).not.toContainEqual(
    expect.objectContaining({ type: "permission_delivery", requestId: "old", outcome: "retired" }),
  );
  expect(f.effects).toEqual([]);
});

test("a continuation's new provider toolCallId preserves the pending logical item and original age", async () => {
  const f = fixture("work", { ...toolCall, toolCallId: "new-model-turn" });
  await f.published.promise;
  expect(f.events).toContainEqual(
    expect.objectContaining({
      type: "permission_request",
      logicalRequestId: "old",
      raisedAt: saved.raisedAt,
      toolCallId: expect.stringMatching(/:new-model-turn$/),
    }),
  );
  f.answer.resolve({ outcome: { outcome: "selected", optionId: "no" } });
  await f.received.promise;
  f.finish.resolve();
  await f.stint.done;
  expect(f.effects).toEqual([]);
});

test("identical restored requests bind only the first outstanding item in saved order", async () => {
  const second = { ...saved, requestId: "second", raisedAt: "2026-01-01T00:02:00Z" };
  const f = fixture("work", { ...toolCall, toolCallId: "new" }, false, false, "work", false, [
    saved,
    second,
  ]);
  await f.published.promise;
  expect(f.events.filter((event) => event.type === "permission_request")).toEqual([
    expect.objectContaining({ logicalRequestId: "old", raisedAt: saved.raisedAt }),
  ]);
  f.answer.resolve({ outcome: { outcome: "selected", optionId: "no" } });
  await f.received.promise;
  f.finish.resolve();
  await f.stint.done;
  expect(
    f.events.filter((event) => event.type === "permission_delivery" && event.outcome === "retired"),
  ).toEqual([
    {
      type: "permission_delivery",
      requestId: "second",
      attemptId: "old-attempt",
      outcome: "retired",
    },
  ]);
});
