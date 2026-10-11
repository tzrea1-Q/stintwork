// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StintLogEvent } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createFakeAgentLauncher } from "./testing.js";

const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test.each(["claude", "codex"] as const)(
  "%s safe commands use the shared ACP policy, including symlink confinement",
  async (profile) => {
    const root = await mkdtemp(join(tmpdir(), "stintwork-safe-command-"));
    fixtures.push(root);
    const cwd = join(root, "worktree");
    const outside = join(root, "outside");
    await mkdir(cwd);
    await mkdir(outside);
    await mkdir(join(cwd, "src"));
    await symlink(outside, join(cwd, "outside-link"));
    await symlink(join(cwd, "src"), join(cwd, "inside-link"));
    const cases = [
      { command: "cat inside-link/file", automatic: true, cwd },
      { command: ["pnpm", "test"], automatic: true, cwd },
      { command: "git status | head -n 10", automatic: true, cwd },
      { command: "cat outside-link/file", automatic: false, cwd },
      { command: "pnpm test", automatic: false, cwd: join(cwd, "outside-link") },
      { command: "cat file > ../outside/file", automatic: false, cwd },
      { command: "git status && unknown", automatic: false, cwd },
    ];
    const events: StintLogEvent[] = [];
    const manual: string[] = [];
    const stint = createFakeAgentLauncher(
      cases.map(({ command, cwd }, index) => ({
        type: "permission" as const,
        toolCall: {
          toolCallId: String(index),
          ...(profile === "codex" ? { kind: "execute" as const } : {}),
          rawInput: {
            command,
            ...(profile === "claude" && cwd === join(root, "worktree") ? {} : { cwd }),
            ...(profile === "claude" ? { name: "Bash", description: "Inspect project files" } : {}),
          },
        },
        options: [{ optionId: "once", name: "Allow", kind: "allow_once" as const }],
        expectedOptionId: "once",
      })),
      [],
      { profile },
    )({
      agent: profile,
      cwd,
      prompt: "Work",
      permissionLevel: "edit-freely",
      onEvent: (event) => events.push(event),
      onPermission: async (request) => {
        manual.push(request.toolCall.toolCallId);
        return { outcome: { outcome: "selected", optionId: "once" } };
      },
    });
    expect(await stint.done).toMatchObject({ stopReason: "end_turn" });
    expect(manual).toEqual(["3", "4", "5", "6"]);
    for (const eventType of ["permission_request", "permission"])
      expect(
        events.flatMap((event) =>
          (event.type === "permission_request" || event.type === "permission") &&
          event.type === eventType
            ? [event.automatic]
            : [],
        ),
      ).toEqual(cases.map(({ automatic }) => automatic));
  },
);

test("a safe command still forwards when the agent offers no allow-once option", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "stintwork-safe-command-"));
  fixtures.push(cwd);
  const events: StintLogEvent[] = [];
  let forwarded = false;
  const stint = createFakeAgentLauncher(
    [
      {
        type: "permission",
        toolCall: { toolCallId: "safe", rawInput: { name: "Bash", command: "git status", cwd } },
        options: [{ optionId: "reject", name: "No", kind: "reject_once" }],
        expectedOptionId: "reject",
      },
    ],
    [],
    { profile: "claude" },
  )({
    agent: "claude",
    cwd,
    prompt: "Work",
    permissionLevel: "edit-freely",
    onEvent: (event) => events.push(event),
    onPermission: async () => {
      forwarded = true;
      return { outcome: { outcome: "selected", optionId: "reject" } };
    },
  });
  await stint.done;
  expect(forwarded).toBe(true);
  expect(events).toContainEqual(expect.objectContaining({ type: "permission", automatic: false }));
});
