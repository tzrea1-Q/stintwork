// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  createClaudeCodeAgent,
  describeAgents,
  createAgentRegistry,
  refreshAgentAvailability,
  installedAgentIdentity,
} from "./index.js";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("Claude detection and refresh only read files; unchanged explicit-start evidence is retained", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stintwork-claude-inspect-"));
  directories.push(directory);
  const executable = join(directory, "installed claude");
  const marker = join(directory, "launched");
  await writeFile(
    executable,
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'launched');`,
  );
  await chmod(executable, 0o755);
  const alias = join(directory, "claude");
  await symlink(executable, alias);
  const env = { PATH: "", CLAUDE_CODE_EXECUTABLE: alias };
  const agent = createClaudeCodeAgent(env);
  await refreshAgentAvailability(agent);
  expect(agent.availability).toMatchObject({
    available: false,
    canStart: true,
    kind: "not-prepared",
    selection: { source: "bundled", reason: "unverified" },
  });
  const identity = installedAgentIdentity("claude", env);
  agent.availability = {
    available: false,
    canStart: true,
    kind: "login-required",
    installedIdentity: identity?.identity,
    reason: { text: "Run claude auth login." },
  };
  await refreshAgentAvailability(agent, true);
  expect(agent.availability?.kind).toBe("login-required");
  expect(describeAgents(createAgentRegistry([agent]))[0]).not.toHaveProperty("prepare");
  await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
  await writeFile(executable, "changed executable");
  await refreshAgentAvailability(agent, true);
  expect(agent.availability?.kind).toBe("not-prepared");
  await rm(alias);
  await refreshAgentAvailability(agent, true);
  expect(agent.availability).toMatchObject({
    available: false,
    canStart: true,
    kind: "missing-executable",
    selection: { source: "bundled", reason: "missing" },
  });
});
