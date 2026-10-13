// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { startAgentStint } from "./index.js";

vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  const { default: Module } = await import("node:module");
  const { fileURLToPath } = await import("node:url");
  const { sourceNodeArgs } = await import("./source-node-args.js");
  const require = Module.createRequire(import.meta.url);
  const adapter = require.resolve("@agentclientprotocol/codex-acp/dist/index.js");
  return {
    ...original,
    spawn: (
      command: string,
      args: string[],
      options: import("node:child_process").SpawnOptionsWithoutStdio,
    ) => {
      if (command !== process.execPath || args.length !== 1 || args[0] !== adapter)
        throw new Error("Expected the pinned Codex ACP executable.");
      return original.spawn(
        process.execPath,
        sourceNodeArgs(fileURLToPath(new URL("./fake-agent.ts", import.meta.url))),
        {
          ...options,
          env: {
            ...options.env,
            STINTWORK_FAKE_SCRIPT: JSON.stringify([
              { type: "write", path: "greeting.txt", content: "Codex greeting" },
            ]),
            STINTWORK_FAKE_HANDOFF: JSON.stringify([
              {
                type: "message",
                text: "## Where I stopped\nWrote greeting.\n## Unresolved\nNone.\n## Suggested next\nReview.",
              },
            ]),
          },
        },
      );
    },
  };
});

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
  vi.unstubAllEnvs();
});

test("Codex uses the installed adapter even when no ACP command is on PATH", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stintwork-codex-launch-"));
  directories.push(directory);
  vi.stubEnv("PATH", directory);
  const stint = startAgentStint({
    agent: "codex",
    cwd: directory,
    prompt: "Work",
    onEvent: () => {},
    handoffTimeoutMs: 1000,
  });
  await stint.ready;
  expect(await stint.done).toMatchObject({
    stopReason: "end_turn",
    handoff: { stoppedAt: "Wrote greeting." },
  });
  expect(await readFile(join(directory, "greeting.txt"), "utf8")).toBe("Codex greeting");
});
