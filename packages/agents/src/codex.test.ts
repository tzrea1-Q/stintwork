// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createCodexAgent, refreshAgentAvailability, type AgentLauncher } from "./index.js";
import { codexProfile } from "./profiles.js";
import { createFakeAgentLauncher } from "./testing.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "stintwork-codex-availability-"));
  directories.push(cwd);
  return { cwd, env: { PATH: cwd }, executable: join(cwd, "codex") };
}

test.each(["missing", "non-executable", "directory"])(
  "a %s Codex executable is unavailable without launching",
  async (kind) => {
    const options = await fixture();
    if (kind === "directory") await mkdir(options.executable);
    else if (kind === "non-executable") {
      await writeFile(options.executable, "must not run");
      await chmod(options.executable, 0o644);
    }
    const launch = vi.fn<AgentLauncher>();
    const agent = createCodexAgent({ ...options, launch });
    await refreshAgentAvailability(agent);
    expect(agent.availability).toEqual({
      available: false,
      kind: "missing-executable",
      reason: { text: `Codex not found. ${codexProfile.installationHint}` },
      checkedAt: expect.any(String),
    });
    expect(launch).not.toHaveBeenCalled();
  },
);

test("login probes never prompt or authenticate, cache results, and refresh after login", async () => {
  const options = await fixture();
  await writeFile(options.executable, "must not run");
  await chmod(options.executable, 0o755);
  let authRequired = true;
  const launch = vi.fn<AgentLauncher>((stintOptions) =>
    createFakeAgentLauncher(
      [
        { type: "write", path: "work.txt", content: "Work" },
        { type: "expect-prompt", includes: "Work" },
      ],
      [],
      { profile: "codex", authRequired },
    )(stintOptions),
  );
  const agent = createCodexAgent({ ...options, launch });
  await Promise.all([refreshAgentAvailability(agent), refreshAgentAvailability(agent)]);
  expect(agent.availability).toMatchObject({
    available: false,
    kind: "login-required",
    reason: { text: expect.stringContaining("codex login") },
  });
  const checkedAt = agent.availability?.checkedAt;
  authRequired = false;
  await refreshAgentAvailability(agent);
  expect(agent.availability?.checkedAt).toBe(checkedAt);
  expect(agent.availability?.kind).toBe("login-required");
  expect(launch).toHaveBeenCalledTimes(1);
  await refreshAgentAvailability(agent, true);
  expect(agent.availability).toEqual({ available: true, checkedAt: expect.any(String) });
  expect(launch).toHaveBeenCalledTimes(2);
  expect(launch).toHaveBeenLastCalledWith({
    agent: "codex",
    cwd: options.cwd,
    prompt: "",
    checkAvailability: true,
    onEvent: expect.any(Function),
  });
  await expect(readFile(join(options.cwd, "work.txt"))).rejects.toMatchObject({ code: "ENOENT" });
});

test.each([
  ["Codex authentication required. Sign in with codex login.", "login-required"],
  ["Codex adapter not found.", "missing-executable"],
  ["Codex app-server failed.", "check-failed"],
])("classifies probe failure %s as %s", async (reason, kind) => {
  const options = await fixture();
  await writeFile(options.executable, "must not run");
  await chmod(options.executable, 0o755);
  const agent = createCodexAgent({
    ...options,
    launch: () => {
      throw new Error(reason);
    },
  });
  await refreshAgentAvailability(agent);
  expect(agent.availability).toMatchObject({ available: false, kind, reason: { text: reason } });
});

test("a hung probe is cancelled and times out even when cancellation hangs", async () => {
  const options = await fixture();
  await writeFile(options.executable, "must not run");
  await chmod(options.executable, 0o755);
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const agent = createCodexAgent({
    ...options,
    timeoutMs: 10,
    launch: () => ({ done: new Promise(() => {}), cancel }),
  });
  await refreshAgentAvailability(agent);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(agent.availability).toMatchObject({
    available: false,
    kind: "check-failed",
    reason: { text: expect.stringContaining("timed out") },
  });
});
