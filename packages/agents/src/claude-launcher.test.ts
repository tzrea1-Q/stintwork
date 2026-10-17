// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createClaudeCodeAgent } from "./index.js";

vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  const { default: Module } = await import("node:module");
  const { sourceNodeArgs } = await import("./source-node-args.js");
  const adapter = Module.createRequire(import.meta.url).resolve(
    "@agentclientprotocol/claude-agent-acp/dist/index.js",
  );
  const fake = new URL("./fake-agent.ts", import.meta.url).href;
  return {
    ...original,
    spawn: (
      command: string,
      args: string[],
      options: import("node:child_process").SpawnOptionsWithoutStdio,
    ) => {
      if (command !== process.execPath || args.length !== 1 || args[0] !== adapter)
        throw new Error("Expected the pinned Claude ACP executable.");
      return original.spawn(
        process.execPath,
        sourceNodeArgs(
          "--input-type=module",
          "-e",
          `
        import { writeFileSync } from "node:fs";
        writeFileSync("adapter-selection.json", JSON.stringify({
          executable: process.env.CLAUDE_CODE_EXECUTABLE,
          inheritedConfig: process.env.STINTWORK_TEST_CONFIG,
          cwd: process.cwd(),
        }));
        await import(${JSON.stringify(fake)});
      `,
        ),
        options,
      );
    },
  };
});

const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test.each(["PATH", "explicit"])(
  "Claude %s selection reaches the pinned adapter and overrides inherited values",
  async (selection) => {
    const directory = await mkdtemp(join(tmpdir(), "stintwork-claude-launch-"));
    fixtures.push(directory);
    const installed = join(directory, "installed claude");
    await writeFile(installed, "#!/bin/sh\nexit 0\n");
    await chmod(installed, 0o755);
    await symlink(installed, join(directory, "claude"));
    const profile = createClaudeCodeAgent({
      ...process.env,
      PATH: directory,
      ...(selection === "explicit" ? { CLAUDE_CODE_EXECUTABLE: "/nonexistent/claude" } : {}),
      STINTWORK_TEST_CONFIG: "developer-settings",
      STINTWORK_FAKE_OPTIONS: JSON.stringify({ profile: "claude" }),
      STINTWORK_FAKE_SCRIPT: JSON.stringify([
        { type: "write", path: "greeting.txt", content: "Claude greeting" },
      ]),
      STINTWORK_FAKE_HANDOFF: JSON.stringify([
        {
          type: "message",
          text: "## Where I stopped\nWrote greeting.\n## Unresolved\nNone.\n## Suggested next\nReview.",
        },
      ]),
    });
    const stint = profile.launch({
      agent: "claude",
      ...(selection === "explicit" ? { nativeExecutable: join(directory, "claude") } : {}),
      cwd: await realpath(directory),
      prompt: "Work",
      onEvent: () => {},
      handoffTimeoutMs: 1000,
    });
    await stint.ready;
    expect(await stint.done).toMatchObject({
      stopReason: "end_turn",
      handoff: { stoppedAt: "Wrote greeting." },
    });
    expect(JSON.parse(await readFile(join(directory, "adapter-selection.json"), "utf8"))).toEqual({
      executable: join(directory, "claude"),
      inheritedConfig: "developer-settings",
      cwd: await realpath(directory),
    });
    expect(await readFile(join(directory, "greeting.txt"), "utf8")).toBe("Claude greeting");
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(manifest.devDependencies["@agentclientprotocol/claude-agent-acp"]).toBe("0.88.0");
  },
);
