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
  expect(await stint.done).toEqual({ stopReason: "end_turn", handoff: null });
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
  expect(await stint.done).toEqual({ stopReason: "end_turn", handoff: null });
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
