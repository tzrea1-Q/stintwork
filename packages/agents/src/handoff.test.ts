import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StintLogEvent } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { parseHandoff } from "./handoff.js";
import { createFakeAgentLauncher } from "./testing.js";

const text =
  "## Where I stopped\nWritten **code**.\n## Unresolved\nTests.\n## Suggested next\nCheck it.";
const handoff = { stoppedAt: "Written **code**.", unresolved: "Tests.", nextStep: "Check it." };
const fixtures: string[] = [];
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "stintwork-handoff-"));
  fixtures.push(cwd);
  return cwd;
}
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((cwd) => rm(cwd, { recursive: true, force: true })));
});

test("parses exactly three Markdown sections, preserving body Markdown and CRLF", () => {
  expect(parseHandoff(text)).toEqual(handoff);
  expect(parseHandoff(text.replaceAll("\n", "\r\n"))).toEqual(handoff);
  expect(parseHandoff(text.replace("Tests.", "```md\n## Example\n```"))?.unresolved).toBe(
    "```md\n## Example\n```",
  );
});
test.each([
  "",
  "Plain handoff",
  `Preamble\n${text}`,
  text.replace("## Unresolved", "## Unknown"),
  text.replace("Tests.", ""),
  `${text}\n## Extra\nMore`,
  `${text}\n## Unresolved\nAgain`,
])("missing or malformed handoffs become no handoff (%s)", (invalid) => {
  expect(parseHandoff(invalid)).toBeNull();
});

test("requests a follow-up in the same ACP stint, separates message deltas, and includes handoff writes", async () => {
  const cwd = await fixture();
  const events: StintLogEvent[] = [];
  const stint = createFakeAgentLauncher(
    [
      { type: "message", text: "Work turn" },
      { type: "end", stopReason: "cancelled" },
    ],
    [
      { type: "expect-prompt", includes: "## Where I stopped\n## Unresolved\n## Suggested next" },
      { type: "write", path: "handoff.txt", content: "Written in the handoff turn" },
      { type: "message", text: text.slice(0, 30) },
      { type: "thought", text: "Not part of the handoff" },
      { type: "message", text: text.slice(30) },
    ],
  )({
    agent: "codex",
    cwd,
    prompt: "Implement ticket",
    handoffTimeoutMs: 500,
    onEvent: (event) => events.push(event),
  });
  expect(await stint.done).toEqual({ stopReason: "cancelled", handoff });
  expect(await readFile(join(cwd, "handoff.txt"), "utf8")).toBe("Written in the handoff turn");
  expect(events[0]).toEqual({ type: "message_delta", id: "1", text: "Work turn" });
  expect(events[1]).toEqual({ type: "message_delta", id: "2", text: text.slice(0, 30) });
});

test("a hanging handoff times out, keeps the original turn outcome, and cannot write later", async () => {
  const cwd = await fixture();
  const stint = createFakeAgentLauncher(
    [{ type: "end" }],
    [
      { type: "message", text },
      { type: "delay", milliseconds: 200 },
      { type: "write", path: "late.txt", content: "Must not be checkpointed late" },
    ],
  )({ agent: "codex", cwd, prompt: "Work", handoffTimeoutMs: 20, onEvent: () => {} });
  expect(await stint.done).toEqual({
    stopReason: "end_turn",
    handoff: null,
    handoffError: "Handoff timed out.",
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  await expect(readFile(join(cwd, "late.txt"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("a crashed handoff cannot turn a finished work turn into a failed stint", async () => {
  const stint = createFakeAgentLauncher(
    [{ type: "end" }],
    [{ type: "crash" }],
  )({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    handoffTimeoutMs: 500,
    onEvent: () => {},
  });
  expect(await stint.done).toMatchObject({
    stopReason: "end_turn",
    handoff: null,
    handoffError: expect.stringMatching(/exited|transport|connection closed/i),
  });
});

test.each([1, 2])("retries %i failed handoff prompts after a stop", async (handoffFailures) => {
  const stint = createFakeAgentLauncher(
    [
      { type: "message", text: "Working" },
      { type: "delay", milliseconds: 30_000 },
    ],
    [{ type: "message", text }],
    { handoffFailures },
  )({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    handoffTimeoutMs: 3000,
    onEvent: (event) => {
      if ("text" in event && event.text === "Working") void stint.cancel();
    },
  });
  expect(await stint.done).toEqual({ stopReason: "cancelled", handoff });
});

test("always-failing handoff prompts record the last failure within the timeout", async () => {
  const stint = createFakeAgentLauncher(
    [{ type: "end", stopReason: "cancelled" }],
    [{ type: "message", text }],
    { handoffFailures: 3 },
  )({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    handoffTimeoutMs: 2000,
    onEvent: () => {},
  });
  await stint.ready;
  const startedAt = performance.now();
  expect(await stint.done).toMatchObject({
    stopReason: "cancelled",
    handoff: null,
    handoffError: expect.stringContaining("Fake handoff prompt failed."),
  });
  expect(performance.now() - startedAt).toBeGreaterThanOrEqual(1400);
  expect(performance.now() - startedAt).toBeLessThan(2000);
});

test("a retry shares the original timeout and cannot write after it expires", async () => {
  const cwd = await fixture();
  const stint = createFakeAgentLauncher(
    [{ type: "end", stopReason: "cancelled" }],
    [
      { type: "message", text },
      { type: "delay", milliseconds: 400 },
      { type: "write", path: "late.txt", content: "Must not be checkpointed late" },
    ],
    { handoffFailures: 1 },
  )({ agent: "codex", cwd, prompt: "Work", handoffTimeoutMs: 750, onEvent: () => {} });
  await stint.ready;
  const startedAt = performance.now();
  expect(await stint.done).toEqual({
    stopReason: "cancelled",
    handoff: null,
    handoffError: "Handoff timed out.",
  });
  expect(performance.now() - startedAt).toBeLessThan(1100);
  await expect(readFile(join(cwd, "late.txt"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("a failed handoff is not retried when the work turn was not cancelled", async () => {
  const stint = createFakeAgentLauncher([{ type: "end" }], [{ type: "message", text }], {
    handoffFailures: 1,
  })({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    handoffTimeoutMs: 2000,
    onEvent: () => {},
  });
  expect(await stint.done).toMatchObject({
    stopReason: "end_turn",
    handoff: null,
    handoffError: expect.stringContaining("Fake handoff prompt failed."),
  });
});

test("a short budget does not start a retry that needs a longer backoff", async () => {
  const stint = createFakeAgentLauncher(
    [{ type: "end", stopReason: "cancelled" }],
    [{ type: "message", text }],
    { handoffFailures: 1 },
  )({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    handoffTimeoutMs: 100,
    onEvent: () => {},
  });
  expect(await stint.done).toMatchObject({
    stopReason: "cancelled",
    handoff: null,
    handoffError: expect.stringContaining("Fake handoff prompt failed."),
  });
});

test("malformed handoffs record a reason without retrying", async () => {
  const stint = createFakeAgentLauncher(
    [{ type: "end", stopReason: "cancelled" }],
    [{ type: "message", text: "Not the required sections" }],
  )({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    handoffTimeoutMs: 2000,
    onEvent: () => {},
  });
  expect(await stint.done).toEqual({
    stopReason: "cancelled",
    handoff: null,
    handoffError: "Handoff did not contain the required Markdown sections.",
  });
});

test("an acknowledged cancellation still requests the handoff in the same ACP stint", async () => {
  let markWorking: () => void = () => {};
  const working = new Promise<void>((resolve) => {
    markWorking = resolve;
  });
  const stint = createFakeAgentLauncher(
    [
      { type: "message", text: "Working" },
      { type: "delay", milliseconds: 30_000 },
    ],
    [
      { type: "expect-prompt", includes: "## Where I stopped" },
      { type: "message", text },
    ],
  )({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    handoffTimeoutMs: 500,
    onEvent: markWorking,
  });
  await working;
  await stint.cancel();
  expect(await stint.done).toEqual({ stopReason: "cancelled", handoff });
});

test("cancelling a work permission does not automatically cancel a handoff permission", async () => {
  const events: StintLogEvent[] = [];
  let workPermission: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    workPermission = resolve;
  });
  const stint = createFakeAgentLauncher(
    [
      {
        type: "permission",
        toolCall: { toolCallId: "work" },
        options: [{ optionId: "allow", name: "Yes, proceed", kind: "allow_once" }],
      },
    ],
    [
      { type: "expect-prompt", includes: "## Where I stopped" },
      {
        type: "permission",
        toolCall: { toolCallId: "handoff" },
        options: [{ optionId: "allow", name: "Yes, proceed", kind: "allow_once" }],
        expectedOptionId: "allow",
      },
      { type: "message", text },
    ],
  )({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    handoffTimeoutMs: 500,
    onEvent: (event) => events.push(event),
    onPermission: async (request) => {
      if (request.toolCall.toolCallId === "work") {
        workPermission();
        return new Promise(() => {});
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { outcome: { outcome: "selected", optionId: "allow" } };
    },
  });
  await waiting;
  await stint.cancel();
  expect(await stint.done).toEqual({ stopReason: "cancelled", handoff });
  expect(events.filter((event) => event.type === "permission")).toMatchObject([
    { toolCallId: "work", automatic: false, decision: { outcome: "cancelled" } },
    {
      toolCallId: "handoff",
      automatic: false,
      decision: { outcome: "selected", optionId: "allow" },
    },
  ]);
});

test("a pending handoff permission is cancelled and logged before the handoff timeout settles", async () => {
  const events: StintLogEvent[] = [];
  const stint = createFakeAgentLauncher(
    [{ type: "end" }],
    [
      {
        type: "permission",
        toolCall: { toolCallId: "handoff" },
        options: [{ optionId: "allow", name: "Yes, proceed", kind: "allow_once" }],
      },
      { type: "message", text },
    ],
  )({
    agent: "codex",
    cwd: await fixture(),
    prompt: "Work",
    handoffTimeoutMs: 50,
    onEvent: (event) => events.push(event),
    onPermission: () => new Promise(() => {}),
  });
  expect(await stint.done).toEqual({
    stopReason: "end_turn",
    handoff: null,
    handoffError: "Handoff timed out.",
  });
  expect(events).toMatchObject([
    { type: "permission_request", automatic: false },
    {
      type: "permission",
      toolCallId: "handoff",
      automatic: false,
      decision: { outcome: "cancelled" },
    },
  ]);
  const completed = structuredClone(events);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(events).toEqual(completed);
});
