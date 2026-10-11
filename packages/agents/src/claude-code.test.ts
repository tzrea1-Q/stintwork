// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  createClaudeCodeAgent,
  describeAgents,
  createAgentRegistry,
  refreshAgentAvailability,
} from "./index.js";

const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(status = { loggedIn: false }, exitCode?: number) {
  const directory = await mkdtemp(join(tmpdir(), "stintwork-claude-login-"));
  fixtures.push(directory);
  const state = join(directory, "status.json");
  const checks = join(directory, "checks.txt");
  const executable = join(directory, "claude");
  await writeFile(state, JSON.stringify(status));
  await writeFile(
    executable,
    `#!${process.execPath}\nconst fs = require("node:fs");
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["auth", "status", "--json"])) process.exit(2);
fs.appendFileSync(${JSON.stringify(checks)}, "checked\\n");
process.stdout.write(fs.readFileSync(${JSON.stringify(state)}, "utf8"));
process.exit(${exitCode ?? `JSON.parse(fs.readFileSync(${JSON.stringify(state)}, "utf8")).loggedIn ? 0 : 1`});\n`,
  );
  await chmod(executable, 0o755);
  return {
    directory,
    executable,
    state,
    checks,
    agent: createClaudeCodeAgent({ PATH: directory }),
  };
}

test("a missing or non-executable Claude installation is unavailable with an installation hint", async () => {
  const { directory, executable } = await fixture();
  await chmod(executable, 0o644);
  const agent = createClaudeCodeAgent({ PATH: directory });
  await refreshAgentAvailability(agent);
  expect(agent.availability).toMatchObject({
    available: false,
    kind: "missing-executable",
    reason: expect.stringContaining("claude auth login"),
  });
  expect(agent.availability?.reason).toContain("@agentclientprotocol/claude-agent-acp@0.88.0");
  await rm(executable);
  await refreshAgentAvailability(agent, true);
  expect(agent.availability?.kind).toBe("missing-executable");
});

test("logged-out status is cached, concurrent reads share a check, and refresh discovers login", async () => {
  const { agent, state, checks } = await fixture();
  await Promise.all([refreshAgentAvailability(agent), refreshAgentAvailability(agent)]);
  expect(agent.availability).toMatchObject({ available: false, kind: "login-required" });
  expect(agent.availability?.reason).toContain("claude auth login");
  const initial = agent.availability;
  await writeFile(state, JSON.stringify({ loggedIn: true, token: "must-not-be-published" }));
  await refreshAgentAvailability(agent);
  expect(agent.availability).toEqual(initial);
  expect(await readFile(checks, "utf8")).toBe("checked\n");
  await refreshAgentAvailability(agent, true);
  expect(agent.availability).toEqual({ available: true, checkedAt: expect.any(String) });
  expect(await readFile(checks, "utf8")).toBe("checked\nchecked\n");
  const descriptions = describeAgents(createAgentRegistry([agent]));
  expect(JSON.stringify(descriptions)).not.toContain("must-not-be-published");
  expect(descriptions[0]).not.toHaveProperty("detectAvailability");
});

test("an explicit installed executable, including a symlink and a path with spaces, uses its own login", async () => {
  const { directory, executable } = await fixture({ loggedIn: true }, 0);
  const alias = join(directory, "installed claude");
  await symlink(executable, alias);
  const agent = createClaudeCodeAgent({ PATH: "", CLAUDE_CODE_EXECUTABLE: alias });
  await refreshAgentAvailability(agent);
  expect(agent.availability?.available).toBe(true);
  await rm(alias);
  await mkdir(alias);
  await refreshAgentAvailability(agent, true);
  expect(agent.availability?.kind).toBe("missing-executable");
});

test.each([0, 2])(
  "an unrecognized login-check response (exit %i) refuses work without inventing a login requirement",
  async (exitCode) => {
    const { agent, state } = await fixture({ loggedIn: false }, exitCode);
    await writeFile(state, "private diagnostic, not JSON");
    await refreshAgentAvailability(agent);
    expect(agent.availability).toMatchObject({ available: false, kind: "check-failed" });
    expect(agent.availability?.reason).not.toContain("private diagnostic");
  },
);
