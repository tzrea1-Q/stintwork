import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StintLogEvent } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createFakeAgentLauncher, type FakeAgentStep } from "./testing.js";

const fixtures: string[] = [];
afterEach(async () => {
  for (const path of fixtures.splice(0)) await rm(path, { recursive: true, force: true });
});

test("Autonomous forwards symlink escapes, extra writable directories, network and uninspectable requests", async () => {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-permission-boundary-"));
  fixtures.push(parent);
  const cwd = join(parent, "worktree");
  const outside = join(parent, "outside");
  await mkdir(cwd);
  await mkdir(outside);
  await writeFile(join(outside, "file"), "Outside");
  await symlink(outside, join(cwd, "link"));
  await symlink(join(outside, "file"), join(cwd, "bare-file"));
  const tools: Extract<FakeAgentStep, { type: "permission" }>["toolCall"][] = [
    { toolCallId: "link", kind: "edit", rawInput: { path: "link/new-file" } },
    { toolCallId: "bare", kind: "execute", rawInput: { command: "wc bare-file", cwd } },
    { toolCallId: "additional", kind: "edit", rawInput: { path: join(outside, "file") } },
    {
      toolCallId: "network",
      kind: "execute",
      rawInput: { command: "pnpm install", cwd, url: "https://example.invalid" },
    },
    {
      toolCallId: "additional-permissions",
      kind: "execute",
      rawInput: {
        command: "pnpm test",
        cwd,
        additionalPermissions: { network: { enabled: true } },
      },
    },
    { toolCallId: "unknown", kind: "execute", rawInput: { command: "pwd" } },
  ];
  const events: StintLogEvent[] = [];
  const stint = createFakeAgentLauncher(
    tools.map(
      (toolCall): FakeAgentStep => ({
        type: "permission",
        toolCall,
        expectedOptionId: "allow_once",
      }),
    ),
  )({
    agent: "codex",
    cwd,
    additionalDirectories: [outside],
    prompt: "Work",
    permissionLevel: "autonomous",
    onEvent: (event) => events.push(event),
    onPermission: async () => ({ outcome: { outcome: "selected", optionId: "allow_once" } }),
  });
  expect(await stint.done).toEqual({ stopReason: "end_turn" });
  expect(
    events.filter((event) => event.type === "permission").map((event) => event.automatic),
  ).toEqual(tools.map(() => false));
});

test("automatic policy never grants an allow-always option, even for an in-worktree edit", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "stintwork-permission-once-"));
  fixtures.push(cwd);
  const events: StintLogEvent[] = [];
  const stint = createFakeAgentLauncher([
    {
      type: "permission",
      toolCall: { toolCallId: "edit", kind: "edit", rawInput: { path: "file" } },
      options: [{ optionId: "forever", name: "Always", kind: "allow_always" }],
      expectedOptionId: "forever",
    },
  ])({
    agent: "codex",
    cwd,
    prompt: "Work",
    onEvent: (event) => events.push(event),
    onPermission: async () => ({ outcome: { outcome: "selected", optionId: "forever" } }),
  });
  expect(await stint.done).toEqual({ stopReason: "end_turn" });
  expect(events.find((event) => event.type === "permission")).toMatchObject({ automatic: false });
});

test("automatic answers also cover the handoff turn after a cancellation retry", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "stintwork-permission-handoff-"));
  fixtures.push(cwd);
  const events: StintLogEvent[] = [];
  const stint = createFakeAgentLauncher(
    [{ type: "end", stopReason: "cancelled" }],
    [
      {
        type: "permission",
        toolCall: { toolCallId: "handoff-edit", kind: "edit", rawInput: { path: "handoff.txt" } },
        expectedOptionId: "allow_once",
      },
      {
        type: "message",
        text: "## Where I stopped\nWork saved.\n## Unresolved\nNone.\n## Suggested next\nReview.",
      },
    ],
    { handoffFailures: 1 },
  )({
    agent: "codex",
    cwd,
    prompt: "Work",
    handoffTimeoutMs: 3000,
    onEvent: (event) => events.push(event),
  });
  expect(await stint.done).toMatchObject({ handoff: { stoppedAt: "Work saved." } });
  expect(events.find((event) => event.type === "permission")).toMatchObject({
    automatic: true,
    decision: { outcome: "selected", optionId: "allow_once" },
  });
});
