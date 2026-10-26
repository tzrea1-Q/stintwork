// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StintLogEvent } from "@stintwork/core";
import { afterEach, expect, test, vi } from "vitest";
import { collectAfterTurnRequests } from "./after-turn.js";
import { type AfterTurnRequest, createAgentLauncher, handoffRequest } from "./index.js";
import {
  createFakeAgentLauncher,
  fakeAgentProfiles,
  sourceNodeArgs,
  type FakeAgentStep,
} from "./testing.js";

const handoffText =
  "## Where I stopped\nWritten code.\n## Unresolved\nNone\n## Suggested next\nCheck it.";
const handoff = { stoppedAt: "Written code.", unresolved: "None", nextStep: "Check it." };
const receiptRequest: AfterTurnRequest = {
  name: "Receipt",
  prompt: "Give a receipt.",
  parse: (text) => /^## Receipt\n(.+)$/s.exec(text)?.[1] ?? null,
  resultField: "receipt",
  errorField: "receiptError",
  parseError: "Receipt did not contain the required heading.",
};
const fixtures: string[] = [];
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "stintwork-after-turn-"));
  fixtures.push(cwd);
  return cwd;
}
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((cwd) => rm(cwd, { recursive: true, force: true })));
});

const receiptSteps: FakeAgentStep[] = [
  { type: "expect-prompt", includes: receiptRequest.prompt },
  { type: "message", text: "## Receipt\nRecorded." },
];

test("ordered requests keep the ACP identifier, writes, messages and permissions", async () => {
  const cwd = await fixture();
  const events: StintLogEvent[] = [];
  const stint = createFakeAgentLauncher(
    [
      { type: "expect-prompt", includes: "Work" },
      { type: "message", text: "Work turn" },
      { type: "write", path: "work.txt", content: "Work" },
    ],
    [],
    {
      afterTurnRequests: [
        [
          { type: "expect-prompt", includes: handoffRequest.prompt },
          { type: "expect-file", path: "work.txt", includes: "Work" },
          { type: "write", path: "handoff.txt", content: "Handoff" },
          { type: "message", text: handoffText },
        ],
        [
          { type: "expect-prompt", includes: receiptRequest.prompt },
          { type: "expect-file", path: "handoff.txt", includes: "Handoff" },
          { type: "message", text: "## Receipt\nRec" },
          { type: "thought", text: "Not part of the receipt" },
          { type: "message", text: "orded." },
          {
            type: "permission",
            toolCall: { toolCallId: "receipt" },
            expectedOptionId: "allow_once",
          },
        ],
      ],
    },
  )({
    agent: "codex",
    cwd,
    prompt: "Work",
    afterTurnRequests: [handoffRequest, receiptRequest],
    afterTurnTimeoutMs: 2000,
    onEvent: (event) => events.push(event),
    onPermission: async () => ({ outcome: { outcome: "selected", optionId: "allow_once" } }),
  });
  expect(await stint.done).toEqual({ stopReason: "end_turn", handoff, receipt: "Recorded." });
  expect(events.filter((event) => event.type === "message_delta")).toEqual([
    { type: "message_delta", id: "1", text: "Work turn" },
    { type: "message_delta", id: "2", text: handoffText },
    { type: "message_delta", id: "3", text: "## Receipt\nRec" },
    { type: "message_delta", id: "5", text: "orded." },
  ]);
  expect(events.find((event) => event.type === "permission")).toMatchObject({
    toolCallId: "receipt",
    decision: { outcome: "selected", optionId: "allow_once" },
  });
});

test.each(["handoff", "receipt"])(
  "a malformed %s does not affect the other result",
  async (bad) => {
    const stint = createFakeAgentLauncher([{ type: "end" }], [], {
      afterTurnRequests: [
        [{ type: "message", text: bad === "handoff" ? "Malformed" : handoffText }],
        [{ type: "message", text: bad === "receipt" ? "Malformed" : "## Receipt\nRecorded." }],
      ],
    })({
      agent: "codex",
      cwd: await fixture(),
      prompt: "Work",
      handoffTimeoutMs: 1000,
      afterTurnRequests: [handoffRequest, receiptRequest],
      onEvent: () => {},
    });
    expect(await stint.done).toEqual({
      stopReason: "end_turn",
      handoff: bad === "handoff" ? null : handoff,
      receipt: bad === "receipt" ? null : "Recorded.",
      ...(bad === "handoff"
        ? { handoffError: handoffRequest.parseError }
        : { receiptError: receiptRequest.parseError }),
    });
  },
);

test("a failed request keeps its error and the next request can ask permission", async () => {
  const stint = createFakeAgentLauncher([{ type: "end" }], [], {
    afterTurnRequests: [
      [{ type: "error", message: "Handoff unavailable" }],
      [
        {
          type: "permission",
          toolCall: { toolCallId: "receipt" },
          expectedOptionId: "allow_once",
        },
        ...receiptSteps,
      ],
    ],
  })({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    afterTurnTimeoutMs: 1000,
    afterTurnRequests: [handoffRequest, receiptRequest],
    onEvent: () => {},
    onPermission: async () => ({ outcome: { outcome: "selected", optionId: "allow_once" } }),
  });
  expect(await stint.done).toEqual({
    stopReason: "end_turn",
    handoff: null,
    handoffError: expect.stringContaining("Handoff unavailable"),
    receipt: "Recorded.",
  });
});

test("a second request joins a preamble and heading after a tool call", async () => {
  const stint = createFakeAgentLauncher([{ type: "end" }], [], {
    afterTurnRequests: [
      [{ type: "message", text: handoffText }],
      [
        { type: "message", text: "Checking first." },
        {
          type: "update",
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "check",
            title: "Check receipt",
            status: "completed",
          },
        },
        { type: "message", text: "## Receipt\nRecorded." },
      ],
    ],
  })({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    afterTurnTimeoutMs: 1000,
    afterTurnRequests: [
      handoffRequest,
      { ...receiptRequest, parse: (text) => /\n## Receipt\n(.+)$/s.exec(text)?.[1] ?? null },
    ],
    onEvent: () => {},
  });
  expect(await stint.done).toEqual({ stopReason: "end_turn", handoff, receipt: "Recorded." });
});

test.each(["end_turn", "cancelled"])(
  "retry rules apply to the second request after %s",
  async (stopReason) => {
    const stint = createFakeAgentLauncher([{ type: "end", stopReason }], [], {
      afterTurnRequests: [
        [{ type: "message", text: handoffText }],
        [{ type: "error", message: "Receipt still settling" }],
        receiptSteps,
      ],
    })({
      agent: "codex",
      cwd: await fixture(),
      prompt: "Work",
      afterTurnTimeoutMs: 2000,
      afterTurnRequests: [handoffRequest, receiptRequest],
      onEvent: () => {},
    });
    expect(await stint.done).toEqual({
      stopReason,
      handoff,
      ...(stopReason === "cancelled"
        ? { receipt: "Recorded." }
        : { receipt: null, receiptError: expect.stringContaining("Receipt still settling") }),
    });
  },
);

test("the second request uses the remaining budget and cannot write after timeout", async () => {
  const cwd = await fixture();
  const stint = createFakeAgentLauncher([{ type: "end" }], [], {
    afterTurnRequests: [
      [
        { type: "delay", milliseconds: 100 },
        { type: "message", text: handoffText },
      ],
      [
        { type: "delay", milliseconds: 200 },
        { type: "write", path: "late.txt", content: "Must not be written" },
        ...receiptSteps,
      ],
    ],
  })({
    agent: "codex",
    cwd,
    prompt: "Work",
    afterTurnTimeoutMs: 250,
    afterTurnRequests: [handoffRequest, receiptRequest],
    onEvent: () => {},
  });
  expect(await stint.done).toEqual({
    stopReason: "end_turn",
    handoff,
    receipt: null,
    receiptError: "Receipt timed out.",
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  await expect(readFile(join(cwd, "late.txt"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("an exhausted budget records each error without sending later prompts", async () => {
  const stint = createFakeAgentLauncher([{ type: "end" }], [], {
    afterTurnRequests: [[{ type: "hang" }], [{ type: "error", message: "Must not be asked" }]],
  })({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    afterTurnTimeoutMs: 30,
    afterTurnRequests: [handoffRequest, receiptRequest],
    onEvent: () => {},
  });
  expect(await stint.done).toEqual({
    stopReason: "end_turn",
    handoff: null,
    handoffError: "Handoff timed out.",
    receipt: null,
    receiptError: "Receipt timed out.",
  });
});

test("backoff for the first request consumes the second request's budget", async () => {
  const stint = createFakeAgentLauncher([{ type: "end", stopReason: "cancelled" }], [], {
    afterTurnRequests: [
      [{ type: "error", message: "Still settling" }],
      [{ type: "message", text: handoffText }],
      [{ type: "delay", milliseconds: 500 }, ...receiptSteps],
    ],
  })({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    afterTurnTimeoutMs: 900,
    afterTurnRequests: [handoffRequest, receiptRequest],
    onEvent: () => {},
  });
  expect(await stint.done).toEqual({
    stopReason: "cancelled",
    handoff,
    receipt: null,
    receiptError: "Receipt timed out.",
  });
});

test("a zero budget records errors without asking the agent", async () => {
  const stint = createFakeAgentLauncher(
    [{ type: "end" }],
    [{ type: "crash" }],
  )({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    afterTurnTimeoutMs: 0,
    afterTurnRequests: [handoffRequest, receiptRequest],
    onEvent: () => {},
  });
  expect(await stint.done).toEqual({
    stopReason: "end_turn",
    handoff: null,
    handoffError: "Handoff timed out.",
    receipt: null,
    receiptError: "Receipt timed out.",
  });
});

test("an expired timer stays exhausted even if it fires before the clock deadline", async () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  const prompt = vi.fn(() => new Promise<string>(() => {}));
  try {
    expect(
      await collectAfterTurnRequests([handoffRequest, receiptRequest], {
        timeoutMs: 10,
        prompt,
        failure: new Promise<never>(() => {}),
        retryAfterCancel: () => false,
        cancel: async () => {},
      }),
    ).toEqual({
      handoff: null,
      handoffError: "Handoff timed out.",
      receipt: null,
      receiptError: "Receipt timed out.",
    });
    expect(prompt).toHaveBeenCalledTimes(1);
  } finally {
    clock.mockRestore();
  }
});

test("an empty request list does not ask for a handoff", async () => {
  const stint = createFakeAgentLauncher(
    [{ type: "end" }],
    [{ type: "crash" }],
  )({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    afterTurnTimeoutMs: 1000,
    afterTurnRequests: [],
    onEvent: () => {},
  });
  expect(await stint.done).toEqual({ stopReason: "end_turn" });
});

test("session and phase persistence precede prompts, and completed output precedes the next request", async () => {
  const cwd = await fixture();
  const phases: string[] = [];
  let sessionId = "";
  const stint = createFakeAgentLauncher(
    [
      { type: "expect-file", path: "session.json", includes: "sessionId" },
      { type: "expect-file", path: "phase.txt", includes: "work" },
    ],
    [],
    {
      afterTurnRequests: [
        [
          { type: "expect-file", path: "phase.txt", includes: "handoff" },
          { type: "message", text: handoffText },
        ],
        [
          { type: "expect-file", path: "saved-handoff.json", includes: "Written code." },
          ...receiptSteps,
        ],
      ],
    },
  )({
    agent: "codex",
    cwd,
    prompt: "Work",
    onEvent: () => {},
    afterTurnTimeoutMs: 2000,
    afterTurnRequests: [handoffRequest, receiptRequest],
    onProcess(attempt) {
      expect(attempt).toMatchObject({
        id: expect.any(String),
        pid: expect.any(Number),
        owner: { pid: process.pid },
        marker: null,
      });
    },
    onSession(id) {
      sessionId = id;
      writeFileSync(join(cwd, "session.json"), JSON.stringify({ sessionId: id }));
    },
    onPhase(phase, result) {
      phases.push(phase);
      writeFileSync(join(cwd, "phase.txt"), phase);
      if (result.handoff)
        writeFileSync(join(cwd, "saved-handoff.json"), JSON.stringify(result.handoff));
    },
  });
  expect(await stint.done).toMatchObject({ handoff, receipt: "Recorded." });
  expect(sessionId).not.toBe("");
  expect(phases).toEqual(["work", "handoff", "handoff", "finalization"]);
});

test.each(["session", "work", "completed handoff"])(
  "a failed %s persistence stops subsequent prompts",
  async (boundary) => {
    const cwd = await fixture();
    const stint = createFakeAgentLauncher(
      [{ type: "write", path: "work.txt", content: "Work" }],
      [],
      {
        afterTurnRequests: [
          [{ type: "message", text: handoffText }],
          [{ type: "write", path: "later.txt", content: "Must not happen" }],
        ],
      },
    )({
      agent: "codex",
      cwd,
      prompt: "Work",
      onEvent: () => {},
      afterTurnTimeoutMs: 2000,
      afterTurnRequests: [handoffRequest, receiptRequest],
      onSession() {
        if (boundary === "session") throw new Error("Metadata write failed");
      },
      onPhase(phase, result) {
        if (
          (boundary === "work" && phase === "work") ||
          (boundary === "completed handoff" && result.handoff)
        )
          throw new Error("Metadata write failed");
      },
    });
    await expect(stint.done).rejects.toThrow("Metadata write failed");
    await expect(readFile(join(cwd, "later.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    if (boundary !== "completed handoff")
      await expect(readFile(join(cwd, "work.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  },
);

test("newSession is persisted even when subsequent mode setup fails", async () => {
  let sessionId = "";
  const cwd = await fixture();
  const launch = createAgentLauncher(
    (directory) =>
      spawn(
        process.execPath,
        sourceNodeArgs(fileURLToPath(new URL("./fake-agent.ts", import.meta.url))),
        {
          cwd: directory,
          stdio: "pipe",
          env: { ...process.env, STINTWORK_FAKE_OPTIONS: JSON.stringify({ profile: "grok" }) },
        },
      ),
    fakeAgentProfiles.codex,
  );
  const stint = launch({
    agent: "codex",
    cwd,
    prompt: "Work",
    permissionLevel: "ask",
    onEvent: () => {},
    onSession(id) {
      sessionId = id;
    },
  });
  await expect(stint.done).rejects.toThrow("does not offer the required");
  expect(sessionId).not.toBe("");
});
