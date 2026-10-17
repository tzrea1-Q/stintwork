// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { StintLogEvent } from "@stintwork/core";
import { afterEach, expect, test, vi } from "vitest";
import {
  createGrokAgent,
  createAgentRegistry,
  describeAgents,
  refreshAgentAvailability,
} from "./index.js";
import { grokPermissionWarning, readGrokConfig } from "./grok-config.js";
import { sourceNodeArgs } from "./testing.js";

const folders: string[] = [];
async function fixture(config?: string) {
  const cwd = await mkdtemp(join(tmpdir(), "stintwork-grok-"));
  folders.push(cwd);
  const configPath = join(cwd, "config.toml");
  if (config !== undefined) await writeFile(configPath, config);
  return { cwd, configPath };
}
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

test.each([
  ['permission_mode = "always-approve"\n', "always-approve"],
  ["'permission_mode' = 'always-approve' # local preference\r\n", "always-approve"],
  ['"permission_mode" = "always\\u002dapprove"', "always-approve"],
  ['permission_mode = "manual"', "manual"],
  ['permission_mode = "auto"', "auto"],
  ['other = [\n  [1],\n]\npermission_mode = "always-approve"', "always-approve"],
  ['other = "[x] # [other]"\npermission_mode = "always-approve"', "always-approve"],
  ['# permission_mode = "always-approve"\nmodel = "grok"', null],
  ['[other]\npermission_mode = "always-approve"', null],
  // Grok's real layout keeps the setting under [ui] after other tables.
  [
    '[cli]\nuse_leader = true\n\n[[marketplace.sources]]\nname = "x"\n\n[ui]\nyolo = false\npermission_mode = "always-approve"\n\n[privacy]\ntelemetry = false',
    "always-approve",
  ],
  ['[[ui]]\npermission_mode = "always-approve"', null],
  [
    'description = """\npermission_mode = \'always-approve\'\n"""\npermission_mode = "manual"',
    "manual",
  ],
  [undefined, null],
])(
  "reads only the root permission mode from fixture config %s without writing it",
  async (config, permissionMode) => {
    const { configPath } = await fixture(config);
    expect(readGrokConfig(configPath)).toEqual({
      permissionMode,
      warnings: permissionMode === "always-approve" ? [grokPermissionWarning] : [],
    });
    if (config === undefined)
      await expect(readFile(configPath)).rejects.toMatchObject({ code: "ENOENT" });
    else expect(await readFile(configPath, "utf8")).toBe(config);
  },
);

test.each([
  "permission_mode = true",
  'permission_mode = "always-approve"\npermission_mode = "manual"',
  'permission_mode = "unfinished',
])("warns rather than promising permissions for unreadable fixture config %s", async (config) => {
  const { configPath } = await fixture(config);
  expect(readGrokConfig(configPath)).toEqual({
    permissionMode: null,
    warnings: [
      { text: expect.stringContaining("unknown"), code: "permission.grokConfigUnreadable" },
    ],
  });
  expect(await readFile(configPath, "utf8")).toBe(config);
});

test("Grok availability and refresh never await its long native readiness path", async () => {
  const { cwd, configPath } = await fixture('permission_mode = "always-approve"');
  const executable = join(cwd, "grok");
  await writeFile(executable, "must not run");
  await chmod(executable, 0o755);
  vi.stubEnv("PATH", cwd);
  const launch = vi.fn(() => {
    throw new Error("Must not launch");
  });
  const agent = createGrokAgent({ configPath, cwd, launch });
  await refreshAgentAvailability(agent);
  await refreshAgentAvailability(agent, true);
  expect(describeAgents(createAgentRegistry([agent]))[0]).toMatchObject({
    availability: {
      available: false,
      canStart: true,
      kind: "not-prepared",
      selection: { source: "installed", reason: "native" },
    },
    warnings: [grokPermissionWarning],
  });
  expect(launch).not.toHaveBeenCalled();
  await writeFile(configPath, 'permission_mode = "manual"');
  expect(agent.capabilities.permissionMode).toBe("manual");
  expect(agent.warnings).toEqual([]);
});

test("the native launcher invokes grok agent stdio using the developer's PATH and reports missing installation", async () => {
  const { cwd, configPath } = await fixture();
  const executable = join(cwd, "grok");
  const entry = fileURLToPath(new URL("./fake-agent.ts", import.meta.url));
  await writeFile(
    executable,
    `#!${process.execPath}\nconst fs = require('node:fs');\nfs.writeFileSync(${JSON.stringify(join(cwd, "args.json"))}, JSON.stringify(process.argv.slice(2)));\nconst child = require('node:child_process').spawn(process.execPath, ${JSON.stringify(sourceNodeArgs(entry))}, { stdio: 'inherit' });\nchild.on('exit', code => process.exit(code));\n`,
  );
  await chmod(executable, 0o755);
  vi.stubEnv("PATH", `${cwd}${delimiter}${process.env.PATH ?? ""}`);
  vi.stubEnv("STINTWORK_FAKE_OPTIONS", JSON.stringify({ profile: "grok" }));
  vi.stubEnv("STINTWORK_FAKE_SCRIPT", JSON.stringify([{ type: "message", text: "Working" }]));
  const events: StintLogEvent[] = [];
  const agent = createGrokAgent({ configPath, cwd });
  const stint = agent.launch({
    agent: "grok",
    cwd,
    prompt: "Work",
    onEvent: (event) => events.push(event),
  });
  expect(await stint.done).toEqual({ stopReason: "end_turn" });
  expect(events).toContainEqual({ type: "message_delta", id: "1", text: "Working" });
  expect(JSON.parse(await readFile(join(cwd, "args.json"), "utf8"))).toEqual(["agent", "stdio"]);
  vi.stubEnv("PATH", cwd);
  await rm(executable);
  await refreshAgentAvailability(agent);
  expect(agent.availability).toMatchObject({
    available: false,
    kind: "missing-executable",
    canStart: false,
  });
});
