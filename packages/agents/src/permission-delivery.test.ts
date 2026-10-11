// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestPermissionResponse } from "@agentclientprotocol/sdk";
import { expect, test } from "vitest";
import { createFakeAgentLauncher } from "./testing.js";

test("a permission can be answered synchronously when its request is published", async () => {
  const root = await mkdtemp(join(tmpdir(), "stintwork-permission-"));
  let answer: ((response: RequestPermissionResponse) => void) | undefined;
  let registeredWhenPublished = false;
  const stint = createFakeAgentLauncher([
    {
      type: "permission",
      toolCall: { toolCallId: "command" },
      options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
      expectedOptionId: "allow",
    },
    { type: "message", text: "The agent received Allow." },
  ])({
    agent: "codex",
    cwd: root,
    prompt: "Work",
    onPermission: () =>
      new Promise((resolveAnswer) => {
        answer = resolveAnswer;
      }),
    onEvent: (event) => {
      if (event.type !== "permission_request") return;
      registeredWhenPublished = !!answer;
      if (answer) answer({ outcome: { outcome: "selected", optionId: "allow" } });
      else throw new Error("Published before the permission was registered.");
    },
  });
  try {
    await expect(stint.done).resolves.toMatchObject({ stopReason: "end_turn" });
    expect(registeredWhenPublished).toBe(true);
  } finally {
    await stint.cancel();
    await rm(root, { recursive: true, force: true });
  }
});
