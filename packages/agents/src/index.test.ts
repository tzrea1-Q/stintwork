import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StintLogEvent } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createAgentLauncher } from "./index.js";
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
    { type: "other", kind: "plan", update: { sessionUpdate: "plan", entries: [] } },
    { type: "message_delta", id: "3", text: "Another message" },
  ]);
});

test.each([true, false])(
  "automatic rejection prefers reject_once when present (%s)",
  async (once) => {
    const events: StintLogEvent[] = [];
    const options = [
      { optionId: "allow", name: "Allow", kind: "allow_once" as const },
      { optionId: "reject-always", name: "Never allow", kind: "reject_always" as const },
      ...(once ? [{ optionId: "reject-once", name: "Reject", kind: "reject_once" as const }] : []),
    ];
    const stint = createFakeAgentLauncher([
      {
        type: "permission",
        toolCall: { toolCallId: "git", title: "git add", kind: "execute" },
        options,
      },
      { type: "message", text: "Continuing without git add" },
      { type: "end" },
    ])({
      agent: "codex",
      cwd: await fixture(),
      prompt: "Work",
      onEvent: (event) => events.push(event),
    });
    expect(await stint.done).toEqual({ stopReason: "end_turn" });
    expect(events).toEqual([
      {
        type: "permission",
        toolCallId: "git",
        title: "git add",
        kind: "execute",
        automatic: true,
        decision: {
          outcome: "selected",
          optionId: once ? "reject-once" : "reject-always",
          kind: once ? "reject_once" : "reject_always",
        },
      },
      { type: "message_delta", id: "1", text: "Continuing without git add" },
    ]);
  },
);

test("permission requests without a reject option fail safely and are recorded", async () => {
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
  await expect(stint.done).rejects.toThrow("no reject option");
  expect(events).toEqual([
    {
      type: "permission",
      toolCallId: "git",
      title: null,
      kind: null,
      automatic: true,
      decision: { outcome: "failed", reason: "Agent permission request has no reject option." },
    },
  ]);
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
  expect(events).toEqual([
    {
      type: "permission",
      toolCallId: "git",
      title: null,
      kind: null,
      automatic: false,
      decision: { outcome: "cancelled" },
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
  ).rejects.toThrow("Only Codex");
});
