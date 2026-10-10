import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { StintLogEvent } from "@stintwork/core";
import { afterEach, expect, test, vi } from "vitest";
import { createGrokAgent, createAgentRegistry, describeAgents, refreshAgents } from "./index.js";
import { grokPermissionWarning, readGrokConfig } from "./grok-config.js";
import { createFakeAgentLauncher } from "./testing.js";

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
    warnings: [expect.stringContaining("unknown")],
  });
  expect(await readFile(configPath, "utf8")).toBe(config);
});

test("availability probes never prompt for work, invent modes, or authenticate; a login refresh recovers", async () => {
  const { cwd, configPath } = await fixture('permission_mode = "always-approve"');
  let authRequired = true;
  const agent = createGrokAgent({
    configPath,
    launch: (options) =>
      createFakeAgentLauncher(
        [
          { type: "expect-prompt", includes: "Work" },
          { type: "write", path: "work.txt", content: "Work" },
        ],
        [],
        { profile: "grok", authRequired },
      )(options),
  });
  const registry = createAgentRegistry([agent]);
  await refreshAgents(registry, cwd);
  expect(describeAgents(registry)[0]).toMatchObject({
    capabilities: { modes: [], defaultMode: null, permissionMode: "always-approve" },
    availability: {
      available: false,
      status: "login-required",
      reason: expect.stringContaining("grok login"),
    },
    warnings: [grokPermissionWarning],
  });
  const checkedAt = agent.availability?.checkedAt;
  await refreshAgents(registry, cwd);
  expect(agent.availability?.checkedAt).toBe(checkedAt);
  authRequired = false;
  await refreshAgents(registry, cwd);
  expect(agent.availability).toMatchObject({ available: true });
  await expect(readFile(join(cwd, "work.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  await writeFile(configPath, 'permission_mode = "manual"');
  await refreshAgents(registry, cwd);
  expect(agent.capabilities.permissionMode).toBe("manual");
  expect(agent.warnings).toEqual([]);
});

test("the native launcher invokes grok agent stdio using the developer's PATH and reports missing installation", async () => {
  const { cwd, configPath } = await fixture();
  const executable = join(cwd, "grok");
  const entry = fileURLToPath(new URL("./fake-agent.ts", import.meta.url));
  await writeFile(
    executable,
    `#!${process.execPath}\nconst fs = require('node:fs');\nfs.writeFileSync(${JSON.stringify(join(cwd, "args.json"))}, JSON.stringify(process.argv.slice(2)));\nconst child = require('node:child_process').spawn(process.execPath, ['--import', ${JSON.stringify(createRequire(import.meta.url).resolve("tsx"))}, ${JSON.stringify(entry)}], { stdio: 'inherit' });\nchild.on('exit', code => process.exit(code));\n`,
  );
  await chmod(executable, 0o755);
  vi.stubEnv("PATH", `${cwd}${delimiter}${process.env.PATH ?? ""}`);
  vi.stubEnv("STINTWORK_FAKE_OPTIONS", JSON.stringify({ profile: "grok" }));
  vi.stubEnv("STINTWORK_FAKE_SCRIPT", JSON.stringify([{ type: "message", text: "Working" }]));
  const events: StintLogEvent[] = [];
  const agent = createGrokAgent({ configPath });
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
  await agent.refresh?.(cwd);
  expect(agent.availability).toMatchObject({
    available: false,
    status: "not-installed",
    reason: expect.stringContaining("Install Grok Build"),
  });
});
