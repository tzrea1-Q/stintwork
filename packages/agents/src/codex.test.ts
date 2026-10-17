// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createCodexAgent, refreshAgentAvailability, type AgentLauncher } from "./index.js";
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
