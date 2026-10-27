// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StintLogEvent } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createAgentLauncher, ProcessOwnershipError } from "./index.js";
import { createFakeAgentLauncher } from "./testing.js";

const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "stintwork-agent-"));
  fixtures.push(root);
  return root;
}

test("the real ACP client streams text deltas with stable IDs and preserves other updates", async () => {
  const events: StintLogEvent[] = [];
  const launcher = createFakeAgentLauncher([
    { type: "message", text: "Hello " },
    { type: "delay", milliseconds: 30 },
    { type: "message", text: "world" },
    { type: "thought", text: "Thinking" },
    { type: "thought", text: " more" },
    { type: "update", update: { sessionUpdate: "plan", entries: [] } },
    { type: "message", text: "Another message" },
    { type: "end" },
  ]);
  const stint = launcher({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Read first: ticket",
    onEvent: (event) => events.push(event),
  });
  expect(await stint.done).toMatchObject({ stopReason: "end_turn" });
  expect(events).toEqual([
    { type: "message_delta", id: "1", text: "Hello " },
    { type: "message_delta", id: "1", text: "world" },
    { type: "thought_delta", id: "2", text: "Thinking" },
    { type: "thought_delta", id: "2", text: " more" },
    { type: "plan", id: "plan", entries: [] },
    { type: "message_delta", id: "3", text: "Another message" },
  ]);
});

test("without a permission handler the stint waits, never auto-declines, and can be cancelled", async () => {
  const events: StintLogEvent[] = [];
  const stint = createFakeAgentLauncher([
    {
      type: "permission",
      toolCall: { toolCallId: "git" },
      options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
    },
  ])({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    onEvent: (event) => events.push(event),
  });
  await expect.poll(() => events.length).toBe(1);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: "permission_request",
    automatic: false,
    options: [{ optionId: "allow" }],
  });
  await stint.cancel();
  expect(await stint.done).toEqual({ stopReason: "cancelled" });
  expect(events[1]).toMatchObject({
    type: "permission",
    automatic: false,
    decision: { outcome: "cancelled" },
  });
});

test("handler decisions are recorded, including explicit cancellation", async () => {
  const events: StintLogEvent[] = [];
  const stint = createFakeAgentLauncher([
    {
      type: "permission",
      toolCall: { toolCallId: "git" },
      options: [{ optionId: "reject", name: "Reject", kind: "reject_once" }],
    },
    { type: "message", text: "Must not continue after cancellation" },
  ])({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    onEvent: (event) => events.push(event),
    onPermission: async () => ({ outcome: { outcome: "cancelled" } }),
  });
  expect(await stint.done).toEqual({ stopReason: "cancelled" });
  expect(events).toMatchObject([
    {
      type: "permission_request",
      requestId: expect.any(String),
      options: [{ optionId: "reject", name: "Reject", kind: "reject_once" }],
    },
    {
      type: "permission",
      requestId: expect.any(String),
      toolCallId: "git",
      title: null,
      kind: null,
      automatic: false,
      decision: { outcome: "cancelled" },
    },
    { type: "permission_delivery", outcome: "failed" },
  ]);
});

test("a handler cannot select an option the agent did not offer", async () => {
  const events: StintLogEvent[] = [];
  const stint = createFakeAgentLauncher([
    {
      type: "permission",
      toolCall: { toolCallId: "git" },
      options: [{ optionId: "cancel", name: "No", kind: "reject_once" }],
    },
  ])({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    onEvent: (event) => events.push(event),
    onPermission: async () => ({ outcome: { outcome: "selected", optionId: "made-up" } }),
  });
  await expect(stint.done).rejects.toThrow("offered option");
  expect(events.filter((event) => event.type === "permission").at(-1)).toMatchObject({
    type: "permission",
    automatic: false,
    decision: { outcome: "failed" },
  });
});

test("messages before and after an inline permission remain separate delta groups", async () => {
  const events: StintLogEvent[] = [];
  const stint = createFakeAgentLauncher([
    { type: "message", text: "Before permission" },
    {
      type: "permission",
      toolCall: { toolCallId: "git" },
      options: [{ optionId: "allow", name: "Yes, proceed", kind: "allow_once" }],
      expectedOptionId: "allow",
    },
    { type: "message", text: "After permission" },
  ])({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    onEvent: (event) => events.push(event),
    onPermission: async () => ({ outcome: { outcome: "selected", optionId: "allow" } }),
  });
  expect(await stint.done).toEqual({ stopReason: "end_turn" });
  expect(events).toMatchObject([
    { type: "message_delta", id: "1", text: "Before permission" },
    { type: "permission_request" },
    { type: "permission", automatic: false, decision: { outcome: "selected", optionId: "allow" } },
    { type: "permission_delivery", outcome: "written" },
    { type: "message_delta", id: "2", text: "After permission" },
  ]);
});

test("ACP plans, tool calls, partial updates, file edits and remaining update kinds get dedicated bounded events", async () => {
  const events: StintLogEvent[] = [];
  const stint = createFakeAgentLauncher([
    {
      type: "update",
      update: {
        sessionUpdate: "plan",
        entries: [{ content: "Read", priority: "high", status: "completed" }],
      },
    },
    {
      type: "update",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "edit",
        title: "Edit file",
        kind: "edit",
        status: "in_progress",
        locations: [{ path: "/work/file.ts", line: 2 }],
      },
    },
    {
      type: "update",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "edit",
        status: "completed",
        title: null,
        content: [{ type: "diff", path: "/work/file.ts", oldText: "before", newText: "after" }],
        rawOutput: { changed: true },
      },
    },
    {
      type: "update",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "edit",
        locations: [{ path: "/work/next.ts" }],
        content: [{ type: "content", content: { type: "text", text: "Saved" } }],
      },
    },
    { type: "update", update: { sessionUpdate: "usage_update", used: 10, size: 100 } },
  ])({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    onEvent: (event) => events.push(event),
  });
  expect(await stint.done).toEqual({ stopReason: "end_turn" });
  expect(events).toEqual([
    {
      type: "plan",
      id: "plan",
      entries: [{ content: "Read", priority: "high", status: "completed" }],
    },
    {
      type: "tool_call",
      toolCallId: "edit",
      title: "Edit file",
      kind: "edit",
      status: "in_progress",
      locations: [{ path: "/work/file.ts", line: 2 }],
    },
    { type: "file_edit", toolCallId: "edit", path: "/work/file.ts" },
    {
      type: "tool_call_update",
      toolCallId: "edit",
      status: "completed",
      content: [{ type: "diff", path: "/work/file.ts", oldText: "before", newText: "after" }],
      output: '{"changed":true}',
    },
    {
      type: "file_edit",
      toolCallId: "edit",
      path: "/work/file.ts",
      oldText: "before",
      newText: "after",
    },
    {
      type: "tool_call_update",
      toolCallId: "edit",
      locations: [{ path: "/work/next.ts" }],
      content: [{ type: "text", text: "Saved" }],
    },
    { type: "file_edit", toolCallId: "edit", path: "/work/next.ts" },
    {
      type: "other",
      kind: "usage_update",
      update: { sessionUpdate: "usage_update", used: 10, size: 100 },
    },
  ]);
});

test("cancelling a scripted ACP turn settles and closes its child", async () => {
  let ready: () => void = () => {};
  const message = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const stint = createFakeAgentLauncher([
    { type: "message", text: "Working" },
    { type: "delay", milliseconds: 30_000 },
  ])({ agent: "codex", cwd: await fixture(), prompt: "Work", onEvent: ready });
  await Promise.race([
    message,
    stint.done.then(() => {
      throw new Error("Stint ended before its first message");
    }),
  ]);
  await stint.cancel();
  expect(await stint.done).toMatchObject({ stopReason: "cancelled" });
});

test("unsupported agents fail before launching a child", async () => {
  const launcher = createAgentLauncher(() => {
    throw new Error("Must not launch");
  });
  await expect(
    launcher({ agent: "other", cwd: await fixture(), prompt: "Work", onEvent: () => {} }).done,
  ).rejects.toThrow("This launcher supports Codex, not agent other.");
});

test.each([false, true])(
  "unverified suspension detaches permission but refuses cleanup proof without a rejection or handoff (permission: %s)",
  async (permission) => {
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const events: StintLogEvent[] = [];
    const phases: string[] = [];
    const stint = createFakeAgentLauncher(
      permission
        ? [
            {
              type: "permission",
              toolCall: { toolCallId: "pending" },
              options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
            },
          ]
        : [{ type: "message", text: "Working" }, { type: "hang" }],
      [{ type: "message", text: "Handoff must not run" }],
    )({
      agent: "codex",
      cwd: await fixture(),
      prompt: "Work",
      afterTurnTimeoutMs: 1000,
      onEvent(event) {
        events.push(event);
        if (event.type === (permission ? "permission_request" : "message_delta")) entered();
      },
      onPhase(phase) {
        phases.push(phase);
      },
      onPermission: async () => new Promise(() => {}),
    });
    await waiting;
    if (!stint.suspend) throw new Error("Expected suspension support");
    await expect(stint.suspend()).rejects.toThrow(ProcessOwnershipError);
    await expect(stint.done).rejects.toThrow(ProcessOwnershipError);
    expect(phases).toEqual(["work"]);
    expect(events.filter((event) => event.type === "permission")).toEqual([]);
    expect(events.some((event) => "text" in event && event.text.includes("Handoff"))).toBe(false);
  },
);
