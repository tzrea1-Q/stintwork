// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import {
  createCodexAgent,
  refreshAgentAvailability,
  installedAgentIdentity,
  readExecutableIdentity,
  type AgentLauncher,
} from "./index.js";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
test.each(["missing", "non-executable", "directory", "executable"])(
  "Codex %s detection never calls its launcher and permits explicit preparation",
  async (kind) => {
    const cwd = await mkdtemp(join(tmpdir(), "stintwork-codex-inspect-"));
    directories.push(cwd);
    const executable = join(cwd, "codex");
    if (kind === "directory") await mkdir(executable);
    else if (kind !== "missing") {
      await writeFile(executable, "must not run");
      await chmod(executable, kind === "executable" ? 0o755 : 0o644);
    }
    const launch = vi.fn<AgentLauncher>(() => {
      throw new Error("Must not launch");
    });
    const agent = createCodexAgent({ env: { PATH: "", CODEX_PATH: executable }, launch });
    await refreshAgentAvailability(agent);
    await refreshAgentAvailability(agent, true);
    expect(agent.availability).toMatchObject({
      available: false,
      canStart: true,
      kind: kind === "executable" ? "not-prepared" : "missing-executable",
    });
    expect(launch).not.toHaveBeenCalled();
  },
);

test.each(["installed", "bundled"] as const)(
  "changed %s executable invalidates readiness without running agents or preparing",
  async (source) => {
    const root = await mkdtemp(join(tmpdir(), "stintwork-codex-identity-"));
    directories.push(root);
    const installed = join(root, "installed");
    const selected = source === "installed" ? installed : join(root, "bundled");
    await writeFile(installed, "must not run");
    await chmod(installed, 0o700);
    if (source === "bundled") {
      await writeFile(selected, "must not run bundled");
      await chmod(selected, 0o700);
    }
    const env = {
      PATH: "",
      CODEX_PATH: installed,
      STINTWORK_AGENT_CACHE: join(root, "untouched-cache"),
    };
    const launch = vi.fn<AgentLauncher>();
    const agent = createCodexAgent({ env, launch });
    agent.availability = {
      available: true,
      canStart: true,
      installedIdentity: installedAgentIdentity("codex", env)?.identity,
      selection: { source, reason: "compatible", executable: readExecutableIdentity(selected) },
    };
    const previous = agent.availability;
    await refreshAgentAvailability(agent, true);
    expect(agent.availability).toBe(previous);
    await writeFile(selected, "changed version or identity");
    await refreshAgentAvailability(agent, true);
    expect(agent.availability).toMatchObject({
      available: false,
      kind: "not-prepared",
      selection: { reason: "unverified" },
    });
    expect(launch).not.toHaveBeenCalled();
    await expect(
      readFile(join(root, "untouched-cache/.stintwork-agent-cache")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  },
);
