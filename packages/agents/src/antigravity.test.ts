// SPDX-License-Identifier: Apache-2.0
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import {
  antigravityProfile,
  createAgentLauncher,
  createAntigravityAgent,
  refreshAgentAvailability,
} from "./index.js";
import { createFakeAgentLauncher, sourceNodeArgs } from "./testing.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function fixture(version = "1.5.3", options = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "agy-test-"));
  dirs.push(cwd);
  const executable = join(cwd, "agy");
  const entry = fileURLToPath(new URL("./fake-agent.ts", import.meta.url));
  const args = sourceNodeArgs(entry)
    .map((arg) => `'${arg.replaceAll("'", "'\\''")}'`)
    .join(" ");
  await writeFile(
    executable,
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo '${version}'; exit; fi\nprintf '%s\\n' "$@" > '${cwd}/args'\nprintf '%s' "$$" > '${cwd}/pid'\nexec '${process.execPath}' ${args}\n`,
  );
  await chmod(executable, 0o755);
  const env = {
    ...process.env,
    PATH: cwd,
    STINTWORK_FAKE_OPTIONS: JSON.stringify({ profile: "antigravity", ...options }),
  };
  return { cwd, executable, env, agent: createAntigravityAgent({ env }) };
}

test.each([
  ["", "missing"],
  ["1.5.2", "below-tested-range"],
  ["1.5.3-rc.1", "unparseable"],
  ["garbage", "unparseable"],
  ["2.0.0", "incompatible"],
])("rejects version %s", async (version, reason) => {
  const { cwd, agent } = await fixture(version);
  await refreshAgentAvailability(agent);
  expect(agent.availability).toMatchObject({
    canStart: false,
    kind: "incompatible",
    selection: { source: "installed", reason },
  });
  await expect(agent.prepare?.({ cwd })).rejects.toMatchObject({
    coreText: { code: "agent.antigravityVersion" },
  });
});

test("a compatible version clears a transient failure without changing the executable", async () => {
  const { cwd, executable, agent } = await fixture();
  const marker = join(cwd, "checked");
  await writeFile(
    executable,
    `#!/bin/sh\nif [ ! -f '${marker}' ]; then : > '${marker}'; exit 1; fi\necho 1.5.3\n`,
  );
  await refreshAgentAvailability(agent);
  expect(agent.availability).toMatchObject({ canStart: false, kind: "incompatible" });
  const identity = agent.availability?.installedIdentity;
  await refreshAgentAvailability(agent, true);
  expect(agent.availability).toMatchObject({
    canStart: true,
    kind: "not-prepared",
    installedIdentity: identity,
    selection: { reason: "native" },
  });
  expect(agent.availability?.reason).toBeUndefined();
});

test("detects missing agy, prepares installed agy without prompting, and kills an uncooperative server", async () => {
  const { cwd, executable, env } = await fixture("1.5.3", { ignoreSigterm: true });
  let child: ChildProcessWithoutNullStreams | undefined;
  const launch = createAgentLauncher(
    (workingDirectory, childEnv, path) => {
      child = spawn(path ?? "agy", ["acp"], {
        cwd: workingDirectory,
        env: childEnv,
        stdio: "pipe",
      });
      return child;
    },
    antigravityProfile,
    env,
  );
  const agent = createAntigravityAgent({ env, launch });
  await refreshAgentAvailability(agent);
  expect(agent.availability).toMatchObject({ canStart: true, selection: { source: "installed" } });
  expect(await agent.prepare?.({ cwd })).toMatchObject({
    source: "installed",
    executable: { version: "1.5.3" },
  });
  expect(await readFile(join(cwd, "args"), "utf8")).toBe("acp\n");
  expect(child?.signalCode).toBe("SIGKILL");
  const pid = Number(await readFile(join(cwd, "pid"), "utf8"));
  expect(() => process.kill(pid, 0)).toThrow();
  await rm(executable);
  await refreshAgentAvailability(agent, true);
  expect(agent.availability).toMatchObject({
    canStart: false,
    kind: "missing-executable",
    reason: { code: "agent.antigravityMissing" },
  });
});

test("authentication failure directs the developer to agy", async () => {
  const { cwd, agent } = await fixture("1.5.3", { authRequired: true });
  await expect(agent.prepare?.({ cwd })).rejects.toMatchObject({
    coreText: { code: "agent.antigravityLogin" },
    message: expect.stringContaining("agy"),
  });
});

test.each([
  ["ask", "default"],
  ["edit-freely", "default"],
  ["autonomous", "default"],
] as const)("%s selects %s", async (permissionLevel, mode) => {
  const { cwd } = await fixture();
  const stint = createFakeAgentLauncher([{ type: "expect-mode", mode }], [], {
    profile: "antigravity",
  })({ agent: "antigravity", cwd, prompt: "Work", permissionLevel, onEvent() {} });
  expect(await stint.done).toEqual({ stopReason: "end_turn" });
});

test("Edit freely auto-allows worktree edits and asks about outside edits", async () => {
  const { cwd } = await fixture();
  const requests: string[] = [];
  const decisions: boolean[] = [];
  const stint = createFakeAgentLauncher(
    ["file.txt", join(cwd, "../outside.txt")].map((path, index) => ({
      type: "permission" as const,
      toolCall: { toolCallId: String(index), kind: "edit" as const, rawInput: { path } },
      expectedOptionId: "allow",
    })),
    [],
    { profile: "antigravity" },
  )({
    agent: "antigravity",
    cwd,
    prompt: "Work",
    permissionLevel: "edit-freely",
    onEvent: (event) => {
      if (event.type === "permission") decisions.push(event.automatic);
    },
    onPermission: async (request) => {
      requests.push(request.toolCall.toolCallId);
      return { outcome: { outcome: "selected", optionId: "allow" } };
    },
  });
  expect(await stint.done).toEqual({ stopReason: "end_turn" });
  expect(requests).toEqual(["1"]);
  expect(decisions).toEqual([true, false]);
});

test.each(["allow", "deny"])("forwards %s to the developer", async (optionId) => {
  const { cwd } = await fixture();
  const events: string[] = [];
  const stint = createFakeAgentLauncher(
    [
      {
        type: "permission",
        toolCall: { toolCallId: "p", kind: "execute", rawInput: { command: "pwd" } },
        expectedOptionId: optionId,
      },
    ],
    [],
    { profile: "antigravity" },
  )({
    agent: "antigravity",
    cwd,
    prompt: "Work",
    permissionLevel: "ask",
    onEvent: (event) => events.push(event.type),
    onPermission: async () => ({ outcome: { outcome: "selected", optionId } }),
  });
  expect(await stint.done).toEqual({ stopReason: "end_turn" });
  expect(events).toContain("permission_request");
});

test("unanswered permission can be cancelled and unexpected options are refused", async () => {
  const { cwd } = await fixture();
  const request = {
    type: "permission" as const,
    toolCall: { toolCallId: "p", kind: "execute" as const },
  };
  let pending!: () => void;
  const waiting = new Promise<void>((resolve) => {
    pending = resolve;
  });
  const stint = createFakeAgentLauncher([request], [], { profile: "antigravity" })({
    agent: "antigravity",
    cwd,
    prompt: "Work",
    permissionLevel: "ask",
    onEvent: (event) => {
      if (event.type === "permission_request") pending();
    },
  });
  await waiting;
  await stint.cancel();
  expect((await stint.done).stopReason).toBe("cancelled");
  const unexpected = createFakeAgentLauncher(
    [{ ...request, options: [{ optionId: "surprise", name: "Surprise", kind: "allow_once" }] }],
    [],
    { profile: "antigravity" },
  )({
    agent: "antigravity",
    cwd,
    prompt: "Work",
    onEvent() {},
    onPermission: async () => {
      throw new Error("must not ask");
    },
  });
  expect((await unexpected.done).stopReason).toBe("cancelled");
});
