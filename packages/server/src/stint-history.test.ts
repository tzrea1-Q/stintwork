// SPDX-License-Identifier: Apache-2.0
import {
  execFileSync,
  spawn,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { EventEmitter, once } from "node:events";
import type { Server } from "node:http";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { adapterCacheFixture } from "../../agents/test/adapter-cache-fixture.js";
import { verifyRecordedAgent } from "../../agents/src/adapter-cache.js";
import { toAcpReadable } from "../../agents/src/stdio.js";
import {
  createAgentRegistry,
  createAgentLauncher,
  createClaudeCodeAgent,
  createCodexAgent,
  prepareAgent,
  adapterHost,
  type AgentStintResult,
  continuationInstruction,
  systemProcesses,
  stopStintProcesses,
} from "@stintwork/agents";
import {
  createFakeAgentLauncher,
  fakeAgentProfiles,
  sourceNodeArgs,
} from "@stintwork/agents/testing";
import {
  gateReadiness,
  indexStints,
  summarizeStint,
  type ProjectSnapshot,
  type Stint,
  type StintLogEntry,
  type StintProgress,
  type StintProcessAttempt,
  type StintLiveMessage,
  isStintLogEntry,
} from "@stintwork/core";
import { ensureWorktree } from "@stintwork/git";
import * as git from "@stintwork/git";
import { WebSocket, WebSocketServer } from "ws";
import { FSWatcher } from "chokidar";
import * as checkModule from "./checks.js";
import { afterEach, expect, test, vi } from "vitest";
import { createProjectServer, createNodeRepoFiles } from "./index.js";
import { recoverInterruptedStints } from "./stint-history.js";

import { PassThrough, Writable } from "node:stream";
import {
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type RequestPermissionResponse,
} from "@agentclientprotocol/sdk";

const fixtures: {
  parent: string;
  projects: ReturnType<typeof createProjectServer>[];
  children: ChildProcess[];
  attempts: StintProcessAttempt[];
  tools: ReturnType<typeof systemProcesses.read>;
  cache?: string;
}[] = [];
const brief = { skill: null, pointers: [], lastHandoff: null, changedPaths: [], prompt: "Work" };

async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-history-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  execFileSync("git", ["config", "user.name", "Tests"], { cwd: root });
  execFileSync("git", ["config", "user.email", "tests@example.invalid"], { cwd: root });
  for (const [path, text] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    ".gitignore": ".stintwork/local/\n",
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/01-first.md": "# First\nStatus: ready-for-agent\nBlocked by: none",
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "Fixture"], { cwd: root });
  const tracked = {
    parent,
    projects: [] as ReturnType<typeof createProjectServer>[],
    children: [] as ChildProcess[],
    attempts: [] as StintProcessAttempt[],
    tools: [] as ReturnType<typeof systemProcesses.read>,
  };
  fixtures.push(tracked);
  function project(options: Parameters<typeof createProjectServer>[2] = {}) {
    const result = createProjectServer(root, join(root, "web"), {
      agentRegistry: createAgentRegistry([
        { ...fakeAgentProfiles.codex, launch: createFakeAgentLauncher([]) },
      ]),
      ...options,
    });
    tracked.projects.push(result);
    return result;
  }
  return { root, project, tracked };
}

function kill(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") child.kill("SIGKILL");
  else if (child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill("SIGKILL");
    }
  }
}

afterEach(async () => {
  for (const { parent, projects, children, attempts, tools, cache } of fixtures.splice(0)) {
    for (const child of children) kill(child);
    for (const tool of tools)
      if (
        systemProcesses.read().some((row) => row.pid === tool.pid && row.identity === tool.identity)
      )
        systemProcesses.signal(tool.pid, "SIGKILL");
    for (const attempt of attempts)
      if (
        systemProcesses
          .read()
          .some((row) => row.pid === attempt.pid && row.identity === attempt.identity)
      )
        await stopStintProcesses(attempt, true);
    await Promise.all(projects.map((project) => project.stop()));
    await rm(parent, { recursive: true, force: true });
    if (cache) await rm(cache, { recursive: true, force: true });
  }
});

async function log(
  root: string,
  id: string,
  at: string,
  ended?: Extract<StintLogEntry, { type: "ended" }>,
) {
  const worktree = await ensureWorktree(root, "first");
  const started: StintLogEntry = {
    type: "started",
    at,
    stint: {
      id,
      workItem: "first",
      stage: "implement",
      ticket: 1,
      agent: "codex",
      worktree,
      baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: worktree.path,
        encoding: "utf8",
      }).trim(),
      brief,
    },
  };
  const path = join(root, ".stintwork/local/stints", `${id}.jsonl`);
  await mkdir(dirname(path), { recursive: true });
  const text = `${[started, ...(ended ? [ended] : [])].map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  await writeFile(path, text);
  return { path, text, worktree };
}

test.each([false, true])(
  "SIGKILL leaves an unfinished legacy log; restart checkpoints edits before accepting a new stint (TCP: %s)",
  async (tcp) => {
    const { root, project, tracked } = await fixture();
    const child = spawn(
      process.execPath,
      sourceNodeArgs(
        "--input-type=module",
        "--eval",
        `import { once } from 'node:events';
     import { createProjectServer } from ${JSON.stringify(new URL("./index.ts", import.meta.url).href)};
     import { createFakeAgentLauncher } from ${JSON.stringify(new URL("../../agents/src/testing.ts", import.meta.url).href)};
     try {
       const project = createProjectServer(${JSON.stringify(root)}, ${JSON.stringify(join(root, "web"))}, {
         // Legacy logs have no process-attempt metadata. Native ownership is covered by the server-only crash matrix.
         launchAgent: options => createFakeAgentLauncher([{type:'message',text:'Before crash'}, {type:'write',path:'partial.txt',content:'Uncommitted work'}, {type:'hang'}])({...options, onProcess: undefined, onSession: undefined, onPhase: undefined})
       });
       let url;
       if (${tcp}) {
         const server = await project.start(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
         url = 'http://127.0.0.1:' + server.address().port;
       }
       const request = {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workItem:'first',ticket:1,agent:'codex'})};
       const response = url ? await fetch(url + '/api/stints', request) : await project.app.request('/api/stints', request);
       process.send({status:response.status,body:await response.json()});
     } catch (error) { process.send({error:String(error)}); process.exit(1); }`,
      ),
      { detached: process.platform !== "win32", stdio: ["ignore", "ignore", "pipe", "ipc"] },
    );
    tracked.children.push(child);
    const message = await new Promise<{ status: number; body: { stint: Stint }; error?: string }>(
      (resolve, reject) => {
        child.once("message", (message) =>
          resolve(message as { status: number; body: { stint: Stint } }),
        );
        child.once("error", reject);
        child.once("exit", (code, signal) =>
          reject(new Error(`Server exited before starting a stint: ${code ?? signal}`)),
        );
      },
    );
    expect(message.error).toBeUndefined();
    expect(message.status).toBe(201);
    const stint = message.body.stint;
    await expect
      .poll(
        async () => readFile(join(stint.worktree.path, "partial.txt"), "utf8").catch(() => ""),
        { timeout: 10_000 },
      )
      .toBe("Uncommitted work");
    const path = join(root, ".stintwork/local/stints", `${stint.id}.jsonl`);
    const before = await readFile(path, "utf8");
    expect(before).not.toContain('"type":"ended"');
    const exited = once(child, "exit");
    kill(child);
    await exited;
    expect(await readFile(path, "utf8")).toBe(before);

    const restarted = project({
      launchAgent: () => ({
        done: Promise.resolve({ stopReason: "end_turn" }),
        cancel: async () => {},
      }),
    });
    let url: string | undefined;
    if (tcp) {
      const server = await restarted.start();
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected TCP address");
      url = `http://127.0.0.1:${address.port}`;
    }
    const request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
    };
    await (url ? fetch(`${url}/api/health`) : restarted.app.request("/api/health"));
    await expect
      .poll(
        () =>
          indexStints(createNodeRepoFiles(root)).stints.find((item) => item.id === stint.id)
            ?.status,
      )
      .toBe("interrupted");
    expect(
      (
        await (url
          ? fetch(`${url}/api/stints`, request)
          : restarted.app.request("/api/stints", request))
      ).status,
    ).toBe(201);
    const response = await (url
      ? fetch(`${url}/api/stints/${stint.id}`)
      : restarted.app.request(`/api/stints/${stint.id}`));
    const { stint: recovered }: { stint: Stint } = await response.json();
    expect(recovered).toMatchObject({ status: "interrupted", handoff: null });
    // Setup steps (dependency install, workflow.yaml) may add their own messages first.
    expect(recovered.events).toContainEqual(
      expect.objectContaining({ type: "message", text: "Before crash" }),
    );
    expect(recovered.endedAt).not.toBeNull();
    expect(recovered.checkpointCommit).toMatch(/^[a-f\d]{40}$/);
    expect(
      execFileSync("git", ["show", `${recovered.checkpointCommit}:partial.txt`], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toBe("Uncommitted work");
    expect(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: stint.worktree.path,
        encoding: "utf8",
      }),
    ).toBe("");
    expect((await readFile(path, "utf8")).startsWith(before)).toBe(true);
    expect(
      (await readFile(path, "utf8")).split("\n").filter((line) => line.includes('"type":"ended"')),
    ).toHaveLength(1);
  },
);

test("restart history and replay match every log, newest first, and recovery is idempotent", async () => {
  const { root, project } = await fixture();
  const checkpoint = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  for (const [id, status, at] of [
    ["finished", "finished", "03"],
    ["stopped", "stopped", "02"],
    ["failed", "failed", "01"],
  ] as const) {
    await log(root, id, `2026-10-09T10:00:${at}Z`, {
      type: "ended",
      at: "2026-10-09T10:01:00Z",
      status,
      checkpointCommit: checkpoint,
      handoff: {
        stint: id,
        agent: "codex",
        stoppedAt: "Recorded work",
        unresolved: "Checks",
        nextStep: "Continue",
      },
    });
  }
  const unfinished = await log(root, "interrupted", "2026-10-09T10:00:04Z");
  const endedBefore = await readFile(join(root, ".stintwork/local/stints/finished.jsonl"), "utf8");
  const first = project();
  await first.app.request("/api/health");
  await expect
    .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].status)
    .toBe("interrupted");
  const snapshot: ProjectSnapshot = await (await first.app.request("/api/project")).json();
  const expected = indexStints(createNodeRepoFiles(root)).stints;
  expect(snapshot.workItems[0].stints).toEqual(expected.map(summarizeStint));
  expect(snapshot.workItems[0].stints.map((stint) => stint.id)).toEqual([
    "interrupted",
    "finished",
    "stopped",
    "failed",
  ]);
  expect(snapshot.workItems[0].activeStint).toBeNull();
  for (const stint of expected) {
    const response = await first.app.request(`/api/stints/${stint.id}`);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ stint });
  }
  expect((await first.app.request("/api/stints/missing")).status).toBe(404);
  expect((await first.app.request("/api/stints/%2E%2E%2Foutside")).status).toBe(404);
  const recovered = await readFile(unfinished.path, "utf8");
  await first.stop();
  const second = project();
  expect(await (await second.app.request("/api/project")).json()).toEqual(snapshot);
  expect(await readFile(unfinished.path, "utf8")).toBe(recovered);
  expect(await readFile(join(root, ".stintwork/local/stints/finished.jsonl"), "utf8")).toBe(
    endedBefore,
  );
});

test("initializing another server and repeated API reads do not interrupt a stint owned by this process", async () => {
  const { root, project } = await fixture();
  let end: (value: { stopReason: string }) => void = () => {};
  const first = project({
    launchAgent: () => ({
      done: new Promise((resolve) => {
        end = resolve;
      }),
      cancel: async () => end({ stopReason: "cancelled" }),
    }),
  });
  const response = await first.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  const { stint }: { stint: Stint } = await response.json();
  const path = join(root, ".stintwork/local/stints", `${stint.id}.jsonl`);
  const before = await readFile(path, "utf8");
  const second = project();
  for (const server of [first, second, first]) {
    const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
    expect(snapshot.workItems[0].activeStint?.id).toBe(stint.id);
    expect((await server.app.request(`/api/stints/${stint.id}`)).status).toBe(200);
  }
  expect(await readFile(path, "utf8")).toBe(before);
  await first.stop();
  expect(indexStints(createNodeRepoFiles(root)).stints[0].status).toBe("interrupted");
});

test("recovery preserves a torn final line and checkpoints edits without losing earlier events", async () => {
  const { root, project } = await fixture();
  const unfinished = await log(root, "torn", "2026-10-09T10:00:00Z");
  await appendFile(
    unfinished.path,
    `${JSON.stringify({
      type: "event",
      at: "2026-10-09T10:00:01Z",
      event: { type: "message_delta", id: "message", text: "Saved stream" },
    })}\n{"type":"event"`,
  );
  await writeFile(join(unfinished.worktree.path, "partial.txt"), "Partial work");
  const before = await readFile(unfinished.path, "utf8");
  const server = project();
  await server.app.request("/api/health");
  await expect
    .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].status)
    .toBe("interrupted");
  const { stint }: { stint: Stint } = await (await server.app.request("/api/stints/torn")).json();
  expect(stint).toMatchObject({
    status: "interrupted",
    events: [{ type: "message", text: "Saved stream" }],
  });
  expect((await readFile(unfinished.path, "utf8")).startsWith(`${before}\n`)).toBe(true);
  expect(stint.checkpointCommit).not.toBeNull();
});

test("concurrent startup requests append only one recovery ending and record the same checkpoint", async () => {
  const { root, project } = await fixture();
  const unfinished = await log(root, "concurrent", "2026-10-09T10:00:00Z");
  await writeFile(join(unfinished.worktree.path, "partial.txt"), "Recovered once");
  const first = project();
  const second = project();
  const responses = await Promise.all([
    first.app.request("/api/stints/concurrent"),
    second.app.request("/api/stints/concurrent"),
  ]);
  expect(responses.every((response) => response.status === 200)).toBe(true);
  await expect
    .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].status)
    .toBe("interrupted");
  const history = await Promise.all(
    [first, second].map(async (server) =>
      (await server.app.request("/api/stints/concurrent")).json(),
    ),
  );
  expect(history[0]).toEqual(history[1]);
  expect(history[0].stint.status).toBe("interrupted");
  const entries = (await readFile(unfinished.path, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(entries.filter((entry) => entry.type === "ended")).toHaveLength(1);
  expect(
    execFileSync("git", ["show", `${history[0].stint.checkpointCommit}:partial.txt`], {
      cwd: root,
      encoding: "utf8",
    }),
  ).toBe("Recovered once");
});

test("a missing worktree records interrupted with an explicit checkpoint error and leaves other history readable", async () => {
  const { root, project } = await fixture();
  const unfinished = await log(root, "missing", "2026-10-09T10:00:00Z");
  await rm(unfinished.worktree.path, { recursive: true });
  const { stint }: { stint: Stint } = await (
    await project().app.request("/api/stints/missing")
  ).json();
  expect(stint).toMatchObject({ status: "interrupted", checkpointCommit: null, handoff: null });
  expect(stint.error).toContain("Checkpoint failed:");
});

test("recovery never checkpoints a different project's worktree named in a log", async () => {
  const first = await fixture();
  const other = await fixture();
  const unfinished = await log(first.root, "foreign", "2026-10-09T10:00:00Z");
  const worktree = await ensureWorktree(other.root, "first");
  const started = JSON.parse(unfinished.text.trim());
  started.stint.worktree = worktree;
  await writeFile(unfinished.path, `${JSON.stringify(started)}\n`);
  await writeFile(join(worktree.path, "foreign.txt"), "Do not commit");
  const { stint }: { stint: Stint } = await (
    await first.project().app.request("/api/stints/foreign")
  ).json();
  expect(stint).toMatchObject({ status: "interrupted", checkpointCommit: null });
  expect(stint.error).toContain("not on this project's work item branch");
  expect(
    execFileSync("git", ["status", "--porcelain"], { cwd: worktree.path, encoding: "utf8" }),
  ).toContain("?? foreign.txt");
});

async function warmRecovery(agent: "claude" | "codex", source: "installed" | "bundled") {
  const result = await fixture();
  const cache = await adapterCacheFixture(agent);
  Object.assign(result.tracked, { cache: cache.root });
  if (source === "bundled") {
    delete cache.options.env?.[agent === "claude" ? "CLAUDE_CODE_EXECUTABLE" : "CODEX_PATH"];
  }
  const selected = await prepareAgent(cache.options);
  expect(selected.source).toBe(source);
  const trace = join(cache.root, "recovery.jsonl");
  const env: NodeJS.ProcessEnv = {
    ...cache.options.env,
    TEST_LAUNCH_ENV: "configured-launcher-environment",
    TEST_ACP_TRACE: trace,
    TEST_RECOVERY: "resume",
  };
  const registered = agent === "claude" ? createClaudeCodeAgent(env) : createCodexAgent({ env });
  registered.prepare = async () => {
    throw new Error("Recovery must not prepare an agent");
  };
  registered.verifyRecovery = (launch, cwd) =>
    verifyRecordedAgent(launch, { ...cache.options, cwd, env });
  const calls = () =>
    readFile(trace, "utf8")
      .then((text) =>
        text
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line)),
      )
      .catch(() => []);
  return { ...result, cache, selected, registered, env, calls };
}

// Probe access independently of the identity parser: parser regressions must fail, not skip.
const nativeProcessInspection = (() => {
  try {
    execFileSync("/bin/ps", ["-p", String(process.pid), "-o", "pid="], {
      stdio: "ignore",
      timeout: 1000,
    });
    return true;
  } catch {
    return false;
  }
})();

async function crashStep<T>(
  name: string,
  work: () => T | Promise<T>,
  timeout = 10_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out at ${name}`)), timeout);
      }),
    ]);
  } catch (error) {
    throw new Error(`${name}: ${String(error)}`, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

test.each(["resolved", "rejected", "stalled"] as const)(
  "a matrix wait names its step and clears its deadline when %s",
  async (outcome) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let finish!: (value: string) => void;
      let fail!: (error: Error) => void;
      const pending = new Promise<string>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
      const result = crashStep("recovery verification entered", () => pending).catch(
        (error) => error,
      );
      if (outcome === "resolved") finish("entered");
      else if (outcome === "rejected") fail(new Error("Controlled verification failure"));
      else await vi.advanceTimersByTimeAsync(10_000);
      if (outcome === "resolved") expect(await result).toBe("entered");
      else expect(String(await result)).toContain("recovery verification entered");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  },
);

test("a subscriber connected before EOF cleanup sees two valid frames before the fixture's late log count", async () => {
  const { root, project, registered, selected, logged, entries } = await savedRecovery("handoff");
  const uid = process.getuid?.() as number;
  const attempt = entries.find((entry) => entry.type === "recovery" && entry.kind === "attempt");
  if (attempt?.type !== "recovery" || attempt.kind !== "attempt")
    throw new Error("Expected attempt");
  Object.assign(attempt.attempt, { pid: 20, identity: `${uid}:old-adapter`, processGroup: true });
  Object.assign(attempt.attempt.owner, { pid: 10, identity: `${uid}:old-owner` });
  const before = entries.filter((entry) => !(entry.type === "recovery" && entry.kind === "resume"));
  await writeFile(logged.path, `${before.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  const inspecting = permissionSignal();
  const resumeInspection = permissionSignal();
  const verifying = permissionSignal();
  const resumeVerification = permissionSignal();
  const launched = permissionSignal();
  const finish = permissionSignal<AgentStintResult>();
  let transient = true;
  let now = 0;
  const read = vi.spyOn(systemProcesses, "read").mockImplementation(() => [
    { pid: process.pid, uid, group: process.pid, identity: `${uid}:server`, command: "server" },
    ...(transient
      ? [
          {
            pid: 21,
            uid,
            group: 21,
            identity: `${uid}:transient`,
            command: "transient unrelated job",
          },
        ]
      : []),
  ]);
  const exists = vi
    .spyOn(systemProcesses, "exists")
    .mockImplementation((pid) => pid === process.pid || (pid === 21 && transient));
  const cwd = vi.spyOn(systemProcesses, "workingDirectories").mockReturnValue(new Map());
  const signal = vi.spyOn(systemProcesses, "signal").mockImplementation(() => {
    throw new Error("No signal is authorized");
  });
  const on = vi.spyOn(WebSocketServer.prototype, "on");
  registered.verifyRecovery = async () => {
    verifying.resolve();
    await resumeVerification.promise;
    return selected;
  };
  registered.launch = () => {
    launched.resolve();
    return {
      ready: Promise.resolve(),
      done: finish.promise,
      cancel: async () => {
        finish.resolve({ stopReason: "cancelled" });
      },
    };
  };
  const server = project({
    agentRegistry: createAgentRegistry([registered]),
    recoveryProcessScan: {
      now: () => now,
      wait: async (milliseconds) => {
        inspecting.resolve();
        await resumeInspection.promise;
        transient = false;
        now += milliseconds;
      },
    },
  });
  const websocket = on.mock.contexts.find(
    (_, index) => on.mock.calls[index][0] === "connection",
  ) as WebSocketServer;
  const frames: StintLiveMessage[] = [];
  const client = {
    readyState: WebSocket.OPEN,
    on: vi.fn(),
    terminate: vi.fn(),
    send(bytes: string) {
      const message = JSON.parse(bytes);
      if (message.type === "stint") frames.push(message);
    },
  } as unknown as WebSocket;
  try {
    await server.app.request("/api/health");
    await permissionStep(
      root,
      server,
      "old-writer inspection held before subscription",
      () => inspecting.promise,
    );
    const subscriptionEntries = (await readFile(logged.path, "utf8")).trim().split("\n").length;
    websocket.clients.add(client);
    websocket.emit("connection", client);
    resumeInspection.resolve();
    await permissionStep(
      root,
      server,
      "verification held after cleanup frames",
      () => verifying.promise,
    );
    const previousEntries = (await readFile(logged.path, "utf8")).trim().split("\n").length;
    expect(previousEntries).toBe(subscriptionEntries + 2);
    expect(frames).toMatchObject([
      {
        sequence: subscriptionEntries + 1,
        entry: { type: "recovery", kind: "resume", state: "suspended" },
      },
      {
        sequence: subscriptionEntries + 2,
        entry: { type: "recovery", kind: "resume", state: "resuming" },
      },
    ]);
    const duringSetup = (await readFile(logged.path, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(frames.map((frame) => frame.entry)).toEqual(duringSetup.slice(subscriptionEntries));
    resumeVerification.resolve();
    await permissionStep(
      root,
      server,
      "replacement launched after verification release",
      () => launched.promise,
    );
    finish.resolve({ stopReason: "end_turn" });
    await permissionStep(root, server, "replacement ending and checkpoint", () =>
      waitForEnding(root),
    );
    const ended = (await readFile(logged.path, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(frames.map((frame) => frame.sequence)).toEqual(
      frames.map((_, index) => subscriptionEntries + index + 1),
    );
    expect(frames.map((frame) => frame.entry)).toEqual(ended.slice(subscriptionEntries));
    expect(new Set(frames.map((frame) => frame.sequence)).size).toBe(frames.length);
  } finally {
    websocket.clients.delete(client);
    resumeInspection.resolve();
    resumeVerification.resolve();
    finish.resolve({ stopReason: "end_turn" });
    await server.stop();
    on.mockRestore();
    signal.mockRestore();
    cwd.mockRestore();
    exists.mockRestore();
    read.mockRestore();
  }
});

test.skipIf(!nativeProcessInspection).each(
  (["claude", "codex"] as const).flatMap((agent) =>
    (["installed", "bundled"] as const).flatMap((source) =>
      [false, true].flatMap((tcp) =>
        (["surviving", "EOF", "EOF-with-tool"] as const).map((lifetime) => ({
          agent,
          source,
          tcp,
          lifetime,
        })),
      ),
    ),
  ),
)(
  "$agent/$source: server-only SIGKILL checks adapter/tools ($lifetime, TCP: $tcp)",
  async ({ agent, source, tcp, lifetime }) => {
    let diagnosticRoot: string | undefined;
    let diagnosticLog: string | undefined;
    let restarted: ReturnType<typeof createProjectServer> | undefined;
    let release: () => void = () => {};
    let socket: WebSocket | undefined;
    let childStep = "not spawned";
    let stderr = "";
    try {
      const { root, project, tracked, selected, env, registered, calls, cache } = await crashStep(
        "prepare warm recovery fixture",
        () => warmRecovery(agent, source),
      );
      diagnosticRoot = root;
      let unrelated: ChildProcess | undefined;
      if (lifetime !== "surviving") {
        const directory = join(tracked.parent, "unrelated-deleted-cwd");
        await crashStep("create unrelated cwd", () => mkdir(directory));
        unrelated = spawn(
          process.execPath,
          ["--eval", "process.send('ready'); setInterval(() => {}, 1000)"],
          {
            cwd: directory,
            detached: true,
            stdio: ["ignore", "ignore", "pipe", "ipc"],
          },
        );
        tracked.children.push(unrelated);
        await crashStep("unrelated process ready IPC", () =>
          once(unrelated as ChildProcess, "message"),
        );
        await crashStep("delete unrelated cwd", () => rm(directory, { recursive: true }));
      }
      const child = spawn(
        process.execPath,
        sourceNodeArgs(
          "--input-type=module",
          "--eval",
          `
      import { once } from 'node:events';
      import { createProjectServer } from ${JSON.stringify(new URL("./index.ts", import.meta.url).href)};
      import { createAgentRegistry, createClaudeCodeAgent, createCodexAgent } from ${JSON.stringify(new URL("../../agents/src/index.ts", import.meta.url).href)};
      const env = ${JSON.stringify({ ...env, TEST_RECOVERY: "crash", TEST_TOOL_WRITER: lifetime === "EOF" ? undefined : "1", TEST_EXIT_ON_EOF: lifetime === "surviving" ? undefined : "1" })};
      const agent = ${JSON.stringify(agent)} === 'claude' ? createClaudeCodeAgent(env) : createCodexAgent({ env });
      agent.prepare = async () => (${JSON.stringify(selected)});
      const launch = agent.launch;
      agent.launch = options => launch({...options,onEvent(event) {
        options.onEvent(event);
        if ('text' in event && event.text === 'Before crash') process.send('working');
      }});
      const project = createProjectServer(${JSON.stringify(root)}, ${JSON.stringify(join(root, "web"))}, {agentRegistry:createAgentRegistry([agent]),handoffTimeoutMs:3000});
      let url;
      if (${tcp}) {
        process.send({step:'cold server watcher ready'});
        const server = await project.start();
        process.send({step:'cold TCP listener ready'});
        server.listen(0,'127.0.0.1'); await once(server,'listening',{signal:AbortSignal.timeout(10000)});
        url = 'http://127.0.0.1:' + server.address().port;
      }
      const request = {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workItem:'first',ticket:1,agent:agent.id})};
      process.send({step:'cold start response'});
      const response = url ? await fetch(url+'/api/stints',{...request,signal:AbortSignal.timeout(10000)}) : await project.app.request('/api/stints',request);
      process.send({status:response.status,body:await response.json()});
    `,
        ),
        { detached: process.platform !== "win32", stdio: ["ignore", "ignore", "pipe", "ipc"] },
      );
      tracked.children.push(child);
      child.stderr?.on("data", (bytes) => {
        stderr = (stderr + String(bytes)).slice(-8000);
      });
      child.on("message", (message) => {
        if (message && typeof message === "object" && "step" in message)
          childStep = String(message.step);
      });
      const working = new Promise<void>((resolve) => {
        child.on("message", (message) => {
          if (message === "working") resolve();
        });
      });
      const message = await crashStep(
        "cold server start response IPC",
        () =>
          new Promise<{ status: number; body: { stint: Stint } }>((resolve, reject) => {
            child.on("message", (message) => {
              if (message && typeof message === "object" && "status" in message)
                resolve(message as { status: number; body: { stint: Stint } });
            });
            child.once("error", reject);
            child.once("exit", (code, signal) =>
              reject(new Error(`Server exited: ${code ?? signal}`)),
            );
          }),
      );
      expect(message.status).toBe(201);
      const stint = message.body.stint;
      const path = join(root, ".stintwork/local/stints", `${stint.id}.jsonl`);
      diagnosticLog = path;
      await crashStep("work started IPC", () => working);
      const before = await crashStep("read log before crash", () => readFile(path, "utf8"));
      const original = indexStints(createNodeRepoFiles(root)).stints[0];
      expect(original.recovery?.sessionId).toBe("fake-session");
      const oldAttempt = original.recovery?.attempt;
      if (!oldAttempt) throw new Error("Expected recorded process ownership");
      tracked.attempts.push(oldAttempt);
      const toolPid =
        lifetime === "EOF"
          ? undefined
          : Number(
              await crashStep("read tool PID", () =>
                readFile(join(stint.worktree.path, "tool.pid"), "utf8"),
              ),
            );
      if (toolPid) {
        const tool = systemProcesses
          .read()
          .find((row) => row.pid === toolPid && row.parent === oldAttempt.pid);
        if (!tool) throw new Error("Expected tool ancestry before killing the server");
        tracked.tools.push(tool);
      }
      const exited = once(child, "exit");
      // Explicitly kill only the server; EOF lifetime adapters exit from their stdin end signal.
      child.kill("SIGKILL");
      await crashStep("server SIGKILL exit", () => exited);
      if (lifetime === "surviving") expect(systemProcesses.exists(oldAttempt.pid)).toBe(true);
      else
        await expect
          .poll(
            () =>
              systemProcesses
                .read()
                .some((row) => row.pid === oldAttempt.pid && row.identity === oldAttempt.identity),
            { timeout: 10_000, message: "adapter stdin EOF exit" },
          )
          .toBe(false);
      if (toolPid) expect(systemProcesses.exists(toolPid)).toBe(true);
      const npmCalls = await crashStep("read preparation trace", () => cache.calls());
      let enteredVerification!: () => void;
      const verificationEntered = new Promise<void>((resolve) => {
        enteredVerification = resolve;
      });
      const verified = registered.verifyRecovery;
      if (!verified) throw new Error("Expected recovery verifier");
      registered.verifyRecovery = vi.fn(async (...args: Parameters<typeof verified>) => {
        await crashStep(
          "fixture verification release",
          () =>
            new Promise<void>((resolve) => {
              release = resolve;
              enteredVerification();
            }),
        );
        return verified(...args);
      });
      const recoveredProject = project({
        agentRegistry: createAgentRegistry([registered]),
        handoffTimeoutMs: 3000,
      });
      restarted = recoveredProject;
      let url: string | undefined;
      if (tcp) {
        const server = await crashStep("restarted server watcher ready", () =>
          recoveredProject.start(),
        );
        server.listen(0, "127.0.0.1");
        await crashStep("restarted TCP listener ready", () => once(server, "listening"));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Expected TCP address");
        url = `http://127.0.0.1:${address.port}`;
      }
      const frames: StintLiveMessage[] = [];
      // Hold verification before subscribing: cleanup/resuming entries must already be in
      // snapshot/history, otherwise they are live frames included in the later log count too.
      if (url && lifetime !== "EOF-with-tool")
        await crashStep(
          "recovery verification held before WebSocket subscription",
          () => verificationEntered,
        );
      if (url) {
        socket = new WebSocket(`${url.replace("http:", "ws:")}/api/live`);
        socket.on("message", (bytes) => {
          const message = JSON.parse(String(bytes));
          if (message.type === "stint") frames.push(message);
        });
        await crashStep("initial WebSocket snapshot", () => once(socket as WebSocket, "message"));
      }
      const request = (path: string, init?: RequestInit) =>
        crashStep(`${init?.method ?? "GET"} ${path}`, () =>
          url
            ? fetch(`${url}${path}`, { ...init, signal: AbortSignal.timeout(10_000) })
            : recoveredProject.app.request(path, init),
        );
      expect((await request("/api/health")).status).toBe(200);
      if (lifetime === "EOF-with-tool") {
        await expect
          .poll(
            async () => {
              const snapshot: ProjectSnapshot = await crashStep(
                "read detached tool warning response",
                async () => (await request("/api/project")).json(),
              );
              return snapshot.warnings.map((warning) => warning.message).join("\n");
            },
            { timeout: 10_000, message: "detached tool ownership warning" },
          )
          .toContain(`PID ${toolPid}`);
        expect(registered.verifyRecovery).not.toHaveBeenCalled();
        expect(await crashStep("read blocked recovery log", () => readFile(path, "utf8"))).toBe(
          before,
        );
        expect((await request("/api/work-items/first/checks", { method: "POST" })).status).toBe(
          409,
        );
        expect(systemProcesses.exists(toolPid as number)).toBe(true);
        expect(await crashStep("verify no preparation on restart", () => cache.calls())).toEqual(
          npmCalls,
        );
        expect(unrelated?.exitCode).toBeNull();
        socket?.close();
        return;
      }
      await crashStep("recovery verification entered", () => verificationEntered);
      const live = systemProcesses.read();
      expect(live.some((row) => row.pid === oldAttempt.pid || row.pid === toolPid)).toBe(false);
      const current = await crashStep("read current stint response", async () =>
        (await request(`/api/stints/${stint.id}`)).json(),
      );
      expect(current.stint.status).toBe("running");
      expect(
        (
          await request("/api/stints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workItem: "first", ticket: 1, agent }),
          })
        ).status,
      ).toBe(409);
      expect((await request("/api/work-items/first/checks", { method: "POST" })).status).toBe(409);
      // The startup marker is already represented in the initial snapshot/history.
      const previousEntries = (
        await crashStep("read recovery log before continuation", () => readFile(path, "utf8"))
      )
        .trim()
        .split("\n").length;
      release();
      await expect
        .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].status, {
          timeout: 10_000,
          message: "resumed stint finished",
        })
        .toBe("finished");
      const recovered = indexStints(createNodeRepoFiles(root)).stints[0];
      expect(recovered).toMatchObject({
        id: stint.id,
        startedAt: stint.startedAt,
        baseCommit: stint.baseCommit,
        worktree: stint.worktree,
        brief: original.brief,
        recovery: { sessionId: "fake-session", launch: { ...selected } },
        handoff: { stoppedAt: "Recovered work." },
      });
      expect(recovered.recovery?.attempt?.pid).not.toBe(original.recovery?.attempt?.pid);
      const after = await crashStep("read finished stint log", () => readFile(path, "utf8"));
      expect(after.startsWith(before)).toBe(true);
      expect(after).not.toContain("REPLAY MUST NOT APPEND");
      expect(after.split("\n").filter((line) => line.includes('"type":"ended"'))).toHaveLength(1);
      const entries = after
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(entries.every(isStintLogEntry)).toBe(true);
      if (socket) {
        await expect
          .poll(() => frames.at(-1)?.entry.type, {
            timeout: 10_000,
            message: "WebSocket ended frame",
          })
          .toBe("ended");
        expect(frames.map((frame) => frame.sequence)).toEqual(
          frames.map((_, index) => previousEntries + index + 1),
        );
        expect(frames.map((frame) => frame.entry)).toEqual(entries.slice(previousEntries));
        socket.close();
      }
      const messages = recovered.events.filter((event) => event.type === "message");
      expect(messages.filter((event) => event.text === "Before crash")).toHaveLength(1);
      expect(messages.filter((event) => event.text === "After restart")).toHaveLength(1);
      expect(new Set(messages.map((event) => event.id)).size).toBe(messages.length);
      const tools = recovered.events.filter((event) => event.type === "tool_call");
      expect(tools.map((event) => event.title)).toEqual(["Old tool", "Fresh tool"]);
      expect(new Set(tools.map((event) => event.toolCallId)).size).toBe(2);
      for (const name of [
        "partial.txt",
        ...(toolPid ? ["tool.txt"] : []),
        "resumed.txt",
        "handoff.txt",
      ]) {
        expect(
          execFileSync("git", ["show", `${recovered.checkpointCommit}:${name}`], {
            cwd: root,
            encoding: "utf8",
          }),
        ).toBeTruthy();
      }
      const trace = await crashStep("read ACP trace", () => calls());
      const resumed = trace.filter((call) => call.pid === recovered.recovery?.attempt?.pid);
      expect(resumed.map((call) => call.method)).toEqual([
        "initialize",
        "session/load",
        "session/set_mode",
        "session/prompt",
        "session/prompt",
      ]);
      expect(resumed[1].params).toMatchObject({
        sessionId: "fake-session",
        cwd: stint.worktree.path,
        additionalDirectories: expect.arrayContaining([expect.any(String)]),
      });
      expect(resumed[2].params.modeId).toBe(agent === "claude" ? "acceptEdits" : "workspace-write");
      expect(resumed[3].params.prompt).toEqual([{ type: "text", text: continuationInstruction }]);
      expect(
        resumed.every(
          (call) =>
            call.home === env.HOME &&
            call.token === env.TEST_LAUNCH_ENV &&
            call[agent] === selected.executable.path,
        ),
      ).toBe(true);
      expect(await crashStep("verify no preparation on restart", () => cache.calls())).toEqual(
        npmCalls,
      );
      expect((await request(`/api/stints/${stint.id}`)).status).toBe(200);
      expect(
        (await crashStep("verify a single session load", () => calls())).filter(
          (call) => call.method === "session/load",
        ),
      ).toHaveLength(1);
      if (unrelated) expect(unrelated.exitCode).toBeNull();
    } catch (error) {
      const diagnosticApp = restarted?.app;
      const warnings = diagnosticApp
        ? await crashStep(
            "diagnostic /api/project",
            async () => (await diagnosticApp.request("/api/project")).json(),
            1000,
          ).then(
            (snapshot) => snapshot.warnings,
            (failure) => `unavailable: ${String(failure)}`,
          )
        : "restarted server not created";
      const tail = await crashStep(
        "diagnostic stint log tail",
        async () => {
          if (!diagnosticLog && diagnosticRoot) {
            const directory = join(diagnosticRoot, ".stintwork/local/stints");
            const name = (await readdir(directory)).find((name) => name.endsWith(".jsonl"));
            if (name) diagnosticLog = join(directory, name);
          }
          return diagnosticLog
            ? (await readFile(diagnosticLog, "utf8"))
                .trim()
                .split("\n")
                .slice(-12)
                .join("\n")
                .slice(-12000)
            : "no stint log yet";
        },
        1000,
      ).catch((failure) => `unavailable: ${String(failure)}`);
      throw new Error(
        `${String(error)}\nCold child step: ${childStep}\nChild stderr: ${stderr}\nRestart /api/project warnings: ${JSON.stringify(warnings)}\nStint log tail:\n${tail}`,
        { cause: error },
      );
    } finally {
      release();
      socket?.terminate();
    }
  },
);

async function savedRecovery(phase: StintProgress["phase"]) {
  const result = await warmRecovery("codex", "installed");
  const { root, selected, registered } = result;
  const logged = await log(root, "saved-phase", "2026-01-01T00:00:00.000Z");
  const started = JSON.parse(logged.text) as Extract<StintLogEntry, { type: "started" }>;
  const worktree = logged.worktree.path;
  await writeFile(
    join(worktree, ".scratch/first/workflow.yaml"),
    "workflow: feature\nstage: review\n",
  );
  started.stint.stage = "review";
  started.stint.ticket = null;
  const progress: StintProgress = { phase, stopReason: "end_turn" };
  if (phase !== "handoff" && phase !== "work")
    progress.handoff = {
      stint: "saved-phase",
      agent: "codex",
      stoppedAt: "Saved handoff",
      unresolved: "None",
      nextStep: "Review",
    };
  if (phase === "finalization")
    progress.findings = { commit: started.stint.baseCommit, findings: [], rawReply: "No findings" };
  // This fixture owns and observes an unstarted child exiting, then records completed cleanup.
  // Dead PIDs alone cannot prove that a previous adapter left no detached writers.
  const dead = spawn(process.execPath, ["--eval", ""]);
  await once(dead, "exit");
  const attempt = {
    id: "old-attempt",
    owner: { pid: dead.pid as number, startedAt: "2026-01-01T00:00:00.000Z" },
    pid: dead.pid as number,
    marker: "stintwork-old-attempt",
  };
  const entries: StintLogEntry[] = [
    started,
    {
      type: "recovery",
      version: 1,
      at: started.at,
      kind: "launch",
      launch: { ...selected, host: adapterHost(), permissionLevel: "ask" },
    },
    { type: "recovery", version: 1, at: started.at, kind: "attempt", attempt },
    {
      type: "recovery",
      version: 1,
      at: started.at,
      kind: "session",
      attemptId: attempt.id,
      sessionId: "fake-session",
    },
    {
      type: "recovery",
      version: 1,
      at: started.at,
      kind: "phase",
      attemptId: attempt.id,
      progress,
    },
    { type: "recovery", version: 1, at: started.at, kind: "resume", state: "suspended" },
  ];
  await writeFile(logged.path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  return { ...result, logged, started, entries, registered };
}

test.each(["handoff", "findings", "finalization"] as const)(
  "saved %s phase never reruns implementation and preserves Review identity",
  async (phase) => {
    const { project, root, registered, calls, started } = await savedRecovery(phase);
    const server = project({
      agentRegistry: createAgentRegistry([registered]),
      handoffTimeoutMs: 3000,
    });
    await server.app.request("/api/health");
    await expect
      .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].status)
      .toBe("finished");
    const recovered = indexStints(createNodeRepoFiles(root)).stints[0];
    expect(recovered.findings).toMatchObject({ commit: started.stint.baseCommit, findings: [] });
    const prompts = (await calls()).filter((call) => call.method === "session/prompt");
    expect(prompts).toHaveLength(phase === "handoff" ? 2 : phase === "findings" ? 1 : 0);
    expect(
      prompts.every(
        (call) => !call.params.prompt[0].text.includes("Continue the interrupted turn"),
      ),
    ).toBe(true);
    if (phase !== "handoff") expect(recovered.handoff?.stoppedAt).toBe("Saved handoff");
    if (phase === "finalization") expect(await calls()).toEqual([]);
    else
      expect((await calls()).find((call) => call.method === "session/set_mode").params.modeId).toBe(
        "read-only",
      );
  },
);

test.each(["max_tokens", undefined])(
  "saved finalization without a status fails for stop reason %s and blocks the gate",
  async (stopReason) => {
    const { project, root, registered, logged, entries, calls } =
      await savedRecovery("finalization");
    const phase = entries.find((entry) => entry.type === "recovery" && entry.kind === "phase");
    if (phase?.type !== "recovery" || phase.kind !== "phase") throw new Error("Expected phase");
    phase.progress.stopReason = stopReason;
    expect(phase.progress.status).toBeUndefined();
    await writeFile(logged.path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    const server = project({ agentRegistry: createAgentRegistry([registered]) });
    await server.app.request("/api/health");
    await expect
      .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].status)
      .not.toBe("running");
    const recovered = indexStints(createNodeRepoFiles(root)).stints[0];
    expect(recovered.status).toBe("failed");
    expect(recovered.error).toBe(
      `Agent ended the stint with stop reason: ${stopReason ?? "unknown"}.`,
    );
    expect(recovered.errorMessage).toEqual({
      code: "stint.stopReason",
      params: { reason: stopReason ?? "unknown" },
    });
    expect(recovered.checkpointCommit).toBeTruthy();
    expect(recovered.handoff?.stoppedAt).toBe("Saved handoff");
    expect(recovered.findings?.findings).toEqual([]);
    expect(await calls()).toEqual([]);
    const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
    expect(gateReadiness(snapshot.workItems[0], snapshot.workflows)).toMatchObject({
      ready: false,
      reason: { code: "gate.stintUnfinished" },
    });
  },
);

test("a live recorded owner reserves the work item without launching or checkpointing", async () => {
  const { project, root, registered, logged, entries, calls } = await savedRecovery("finalization");
  const attempt = entries.find((entry) => entry.type === "recovery" && entry.kind === "attempt");
  if (attempt?.type !== "recovery" || attempt.kind !== "attempt")
    throw new Error("Expected attempt");
  attempt.attempt.owner.pid = process.pid;
  entries.pop(); // This test models an uncleaned attempt still owned by a live server.
  await writeFile(logged.path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  const before = await readFile(logged.path, "utf8");
  const server = project({
    agentRegistry: createAgentRegistry([registered]),
    recoveryProcessScan: { wait: async () => {} },
  });
  await expect
    .poll(
      async () => {
        const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
        return snapshot.warnings.some((warning) => warning.message.includes("previous owner"));
      },
      { message: "bounded inspection must retain the live-owner block" },
    )
    .toBe(true);
  expect(await readFile(logged.path, "utf8")).toBe(before);
  expect(await calls()).toEqual([]);
  expect(
    (
      await server.app.request("/api/stints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItem: "first", agent: "codex" }),
      })
    ).status,
  ).toBe(409);
  expect(indexStints(createNodeRepoFiles(root)).stints[0].status).toBe("running");
});

test("a worktree changed during warm verification cannot launch or checkpoint on the new branch", async () => {
  const { project, root, registered, logged, calls, started } = await savedRecovery("findings");
  const verify = registered.verifyRecovery;
  if (!verify) throw new Error("Expected recovery verifier");
  registered.verifyRecovery = async (...args) => {
    const selected = await verify(...args);
    execFileSync("git", ["checkout", "--quiet", "-b", "changed-during-verification"], {
      cwd: logged.worktree.path,
    });
    return selected;
  };
  const server = project({ agentRegistry: createAgentRegistry([registered]) });
  await server.app.request("/api/health");
  await expect
    .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].status)
    .toBe("interrupted");
  const recovered = indexStints(createNodeRepoFiles(root)).stints[0];
  expect(recovered.checkpointCommit).toBeNull();
  expect(recovered.error).toContain("Checkpoint failed");
  expect(await calls()).toEqual([]);
  expect(
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: logged.worktree.path,
      encoding: "utf8",
    }).trim(),
  ).toBe(started.stint.baseCommit);
  expect(
    await readFile(join(logged.worktree.path, ".scratch/first/workflow.yaml"), "utf8"),
  ).toContain("stage: review");
});

async function waitForEnding(root: string) {
  await expect
    .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].status)
    .not.toBe("running");
  return indexStints(createNodeRepoFiles(root)).stints[0];
}

const recoveryFaults = [
  ["no-load", "Codex does not support loadSession."],
  ["no-directories", "does not support additional writable directories"],
  ["no-mode", "Codex does not offer the required read-only mode."],
  ["session/load:missing", "Session not found"],
  ["session/load:auth", "Codex authentication required."],
  ["session/load:provider", "Provider unavailable"],
  ["session/load:network", "ENETUNREACH"],
  ["session/set_mode:reject", "Mode rejected"],
  [
    "initialize:exit",
    /Codex (?:exited before the stint ended \(17\)|ACP transport closed before the stint ended)/,
  ],
  ["session/load:transport", "ACP transport closed before the stint ended"],
  ["initialize:hang", "Recovery setup exceeded 1 seconds."],
  ["session/load:hang", "Recovery setup exceeded 1 seconds."],
  ["session/set_mode:hang", "Recovery setup exceeded 1 seconds."],
] as const;

test.each(recoveryFaults)(
  "failed recovery %s stops its writer before checkpoint and never retries",
  async (fault, expectedReason) => {
    const { root, project, registered, env, calls, cache, logged } = await savedRecovery("handoff");
    env.TEST_RESUME_FAILURE = fault;
    const npmBefore = await cache.calls();
    const before = await readFile(logged.path, "utf8");
    await writeFile(join(logged.worktree.path, "partial.txt"), "Keep partial work");
    await writeFile(join(logged.worktree.path, ".env"), "excluded fixture secret");
    // A real pre-commit hook fails if the replacement adapter can still write.
    const hook = join(root, ".git/hooks/pre-commit");
    await writeFile(
      hook,
      `#!${process.execPath}\nconst fs=require('node:fs');\nconst calls=fs.readFileSync(${JSON.stringify(env.TEST_ACP_TRACE)},'utf8').trim().split('\\n').map(JSON.parse);\ntry { process.kill(calls.at(-1).pid,0); process.exit(21); } catch(e) { if(e.code!=='ESRCH') process.exit(22); }\n`,
      { mode: 0o700 },
    );
    const server = project({
      agentRegistry: createAgentRegistry([registered]),
      recoverySetupTimeoutMs: fault.endsWith(":hang") ? 1000 : 60_000,
    });
    expect((await server.app.request("/api/health")).status).toBe(200);
    const stint = await waitForEnding(root);
    expect(stint.status).toBe("interrupted");
    expect(stint.recovery?.state).toBe("fallback");
    expect(stint.recovery?.reason).toMatch(expectedReason);
    expect(stint.error).toMatch(expectedReason);
    expect(stint.handoff).toBeNull();
    expect(stint.checkpointCommit).toMatch(/^[a-f\d]{40}$/);
    expect(stint.checkpointWarnings).toContainEqual(
      expect.objectContaining({ path: ".env", excluded: true }),
    );
    expect(
      execFileSync("git", ["show", `${stint.checkpointCommit}:partial.txt`], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toBe("Keep partial work");
    expect(await readFile(join(logged.worktree.path, ".env"), "utf8")).toBe(
      "excluded fixture secret",
    );
    if (fault.endsWith(":auth")) {
      const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
      expect(snapshot.agents.find((agent) => agent.id === "codex")?.availability).toMatchObject({
        kind: "login-required",
      });
      expect(snapshot.attentionItems.some((item) => item.kind === "login-required")).toBe(true);
      expect(stint.recovery?.reason).toContain("codex login");
    }
    const saved = await readFile(logged.path, "utf8");
    expect(saved.startsWith(before)).toBe(true);
    const entries = saved
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entries.filter((entry) => entry.type === "ended")).toHaveLength(1);
    const fallbackIndex = entries.findIndex(
      (entry) => entry.kind === "resume" && entry.state === "fallback",
    );
    expect(fallbackIndex).toBeGreaterThan(0);
    expect(entries[fallbackIndex + 1]).toMatchObject({
      kind: "phase",
      progress: { phase: "finalization", status: "interrupted" },
    });
    const trace = await calls();
    expect(trace.filter((call) => call.method === "session/load").length).toBeLessThanOrEqual(1);
    expect(
      trace.some((call) => call.method === "session/new" || call.method === "session/prompt"),
    ).toBe(false);
    expect(await cache.calls()).toEqual(npmBefore);
    for (let i = 0; i < 3; i++) {
      await server.app.request("/api/project");
      await server.app.request(`/api/stints/${stint.id}`);
    }
    expect(await calls()).toEqual(trace);
    expect(await readFile(logged.path, "utf8")).toBe(saved);
    await server.stop();
    const next = project({ agentRegistry: createAgentRegistry([registered]) });
    await next.app.request("/api/health");
    expect(await readFile(logged.path, "utf8")).toBe(saved);
    expect(await calls()).toEqual(trace);
  },
);

test.each([
  ["host", "Recorded agent host differs from this host."],
  ["lock", "Recorded adapter/lock identity differs from the released profile."],
  ["adapter", "Recorded adapter/lock identity differs from the released profile."],
  ["cli-changed", "Recorded agent executable identity changed."],
  ["cli-missing", "ENOENT"],
  ["cache-missing", "ENOENT"],
  ["cache-corrupt", "Adapter cache integrity mismatch; recovery cannot repair it."],
  ["metadata", "Missing recovery metadata (legacy or incomplete stint log)."],
  ["session", "Ambiguous recovery session history."],
  ["phase", "Ambiguous recovery phase history."],
  ["torn", "Invalid or torn recovery log; readable history has been preserved."],
  ["unsupported", "Invalid or torn recovery log; readable history has been preserved."],
  ["grok", "Grok Build is experimental; restart recovery uses a checkpoint and a new stint."],
] as const)(
  "startup eligibility %s preserves readable history and uses checkpoint fallback",
  async (fault, expectedReason) => {
    const { root, project, registered, cache, selected, logged, entries, calls } =
      await savedRecovery("handoff");
    const launch = entries.find((entry) => entry.type === "recovery" && entry.kind === "launch");
    if (launch?.type !== "recovery" || launch.kind !== "launch") throw new Error("Expected launch");
    const session = entries.find((entry) => entry.type === "recovery" && entry.kind === "session");
    if (session?.type !== "recovery" || session.kind !== "session")
      throw new Error("Expected session");
    if (fault === "host") launch.launch.host.abi = "changed";
    if (fault === "lock") launch.launch.lockDigest = "f".repeat(64);
    if (fault === "adapter") launch.launch.adapterVersion = "0.0.0";
    if (fault === "cli-changed") await appendFile(selected.executable.path, "\n// changed\n");
    if (fault === "cli-missing") await rm(selected.executable.path);
    if (fault === "cache-missing")
      await rm(join(cache.options.cacheDirectory as string, "entries", selected.cacheKey), {
        recursive: true,
      });
    if (fault === "cache-corrupt") await appendFile(selected.adapterEntry, "\n// corruption\n");
    if (fault === "metadata") entries.splice(entries.indexOf(session), 1);
    if (fault === "session") session.attemptId = "foreign-attempt";
    if (fault === "phase")
      entries.push({
        type: "recovery",
        version: 1,
        at: session.at,
        kind: "phase",
        attemptId: session.attemptId,
        progress: { phase: "work" },
      });
    if (fault === "grok") {
      const start = entries[0];
      if (start.type !== "started") throw new Error("Expected start");
      start.stint.agent = "grok";
    }
    await writeFile(
      logged.path,
      `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n${fault === "torn" ? '{"type":"recovery"' : fault === "unsupported" ? '{"type":"recovery","version":2}\n' : ""}`,
    );
    const before = await readFile(logged.path, "utf8");
    const npmBefore = await cache.calls();
    await writeFile(join(logged.worktree.path, "partial.txt"), "Preserved");
    const launchSpy = vi.spyOn(registered, "launch");
    const prepareSpy = vi.spyOn(registered, "prepare");
    const grokLaunch = vi.fn(() => {
      throw new Error("Grok must never load");
    });
    const server = project({
      agentRegistry: createAgentRegistry([
        registered,
        { ...fakeAgentProfiles.grok, launch: grokLaunch },
      ]),
    });
    await server.app.request("/api/health");
    const stint = await waitForEnding(root);
    expect(stint).toMatchObject({
      status: "interrupted",
      recovery: { state: "fallback", reason: expect.stringContaining(expectedReason) },
    });
    expect(stint.error).toMatch(expectedReason);
    expect(stint.checkpointCommit).toBeTruthy();
    expect(stint.handoff).toBeNull();
    expect((await readFile(logged.path, "utf8")).startsWith(before)).toBe(true);
    expect(await cache.calls()).toEqual(npmBefore);
    expect(await calls()).toEqual([]);
    expect(launchSpy).not.toHaveBeenCalled();
    expect(prepareSpy).not.toHaveBeenCalled();
    expect(grokLaunch).not.toHaveBeenCalled();
    if (fault === "torn" || fault === "unsupported") {
      const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
      expect(snapshot.warnings.some((warning) => warning.path.endsWith("saved-phase.jsonl"))).toBe(
        true,
      );
    }
  },
);

test.each([false, true])(
  "slow startup leaves board/health/history usable, reserves mutations and reconnects once (TCP: %s)",
  async (tcp) => {
    const { root, project, registered, calls } = await savedRecovery("handoff");
    let release: () => void = () => {};
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const verify = registered.verifyRecovery;
    if (!verify) throw new Error("Expected verifier");
    const verifySpy = vi.fn(async (...args: Parameters<typeof verify>) => {
      await waiting;
      return verify(...args);
    });
    registered.verifyRecovery = verifySpy;
    const server = project({ agentRegistry: createAgentRegistry([registered]) });
    const sockets: WebSocket[] = [];
    try {
      // start() must return while recovery verification is still deliberately blocked.
      await server.start();
      let url: string | undefined;
      if (tcp) {
        const listener = await server.start();
        listener.listen(0, "127.0.0.1");
        await once(listener, "listening");
        const address = listener.address();
        if (!address || typeof address === "string") throw new Error("Expected TCP address");
        url = `http://127.0.0.1:${address.port}`;
      }
      const request = (path: string, init?: RequestInit) =>
        url ? fetch(`${url}${path}`, init) : server.app.request(path, init);
      const json = (body: unknown) => ({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      for (let i = 0; i < 3; i++) {
        expect((await request("/api/health")).status).toBe(200);
        const snapshot: ProjectSnapshot = await (await request("/api/project")).json();
        expect(snapshot.workItems[0].activeStint).toMatchObject({
          id: "saved-phase",
          status: "running",
          recovery: { state: "resuming" },
        });
        const history = await (await request("/api/stints/saved-phase")).json();
        expect(history.stint.recovery.state).toBe("resuming");
        if (url) {
          const socket = new WebSocket(`${url.replace("http", "ws")}/api/live`);
          sockets.push(socket);
          const snapshotMessage = once(socket, "message");
          const [message] = await snapshotMessage;
          expect(JSON.parse(String(message)).workItems[0].activeStint.recovery.state).toBe(
            "resuming",
          );
          socket.close();
          await once(socket, "close");
        }
      }
      for (const [path, body] of [
        ["/api/stints", { workItem: "first", agent: "codex" }],
        ["/api/work-items/first/checks", {}],
        ["/api/work-items/first/stages/review/agent", { agent: "codex" }],
        ["/api/work-items/first/gates/review/approve", {}],
        ["/api/work-items/first/findings/decision", { id: "finding", status: "resolved" }],
        ["/api/work-items/first/ship/merge-local", {}],
      ] as const)
        expect((await request(path, json(body))).status, path).toBe(409);
      // A different work item's ordinary start is independent of recovery.
      await mkdir(join(root, ".scratch/second/issues"), { recursive: true });
      await writeFile(join(root, ".scratch/second/spec.md"), "# Second");
      await writeFile(
        join(root, ".scratch/second/issues/01-second.md"),
        "# Second\nStatus: ready-for-agent\nBlocked by: none\n",
      );
      execFileSync("git", ["add", ".scratch/second"], { cwd: root });
      execFileSync("git", ["commit", "--quiet", "-m", "Second fixture work item"], { cwd: root });
      await writeFile(
        join(root, ".stintwork/config"),
        'checks:\n  - name: Check\n    command: node -e "process.exit(0)"\n',
      );
      const secondTree = await ensureWorktree(root, "second");
      expect(secondTree.path).toBeTruthy();
      expect((await request("/api/work-items/second/checks", json({}))).status).toBe(202);
      expect(verifySpy).toHaveBeenCalledTimes(1);
      expect(await calls()).toEqual([]);
    } finally {
      for (const socket of sockets) socket.terminate();
      release();
    }
    await waitForEnding(root);
    expect((await calls()).filter((call) => call.method === "session/load")).toHaveLength(1);
  },
);

test("warm verification timeout cannot launch later, and a recorded fallback crash never reloads work", async () => {
  const { root, project, registered, selected, calls, logged } = await savedRecovery("handoff");
  let release: (value: typeof selected) => void = () => {};
  registered.verifyRecovery = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const launchSpy = vi.spyOn(registered, "launch");
  const server = project({
    agentRegistry: createAgentRegistry([registered]),
    recoverySetupTimeoutMs: 100,
  });
  await server.app.request("/api/health");
  const stint = await waitForEnding(root);
  expect(stint.recovery).toMatchObject({
    state: "fallback",
    reason: "Recovery setup exceeded 0.1 seconds.",
  });
  release(selected);
  await server.app.request("/api/project");
  expect(launchSpy).not.toHaveBeenCalled();
  await server.stop();
  // Reproduce a crash immediately before the terminal append, after its durable fallback boundary.
  const lines = (await readFile(logged.path, "utf8")).trim().split("\n");
  await writeFile(
    logged.path,
    `${lines.filter((line) => JSON.parse(line).type !== "ended").join("\n")}\n`,
  );
  registered.verifyRecovery = vi.fn(() => {
    throw new Error("Failed recovery must never be retried");
  });
  const restarted = project({ agentRegistry: createAgentRegistry([registered]) });
  await restarted.app.request("/api/health");
  const recovered = await waitForEnding(root);
  expect(recovered.status).toBe("interrupted");
  expect(recovered.recovery?.reason).toBe(stint.recovery?.reason);
  expect(registered.verifyRecovery).not.toHaveBeenCalled();
  expect(launchSpy).not.toHaveBeenCalled();
  expect(await calls()).toEqual([]);
  expect(
    (await readFile(logged.path, "utf8"))
      .split("\n")
      .filter((line) => line.includes('"type":"ended"')),
  ).toHaveLength(1);
});

test("fallback checkpoint errors stay explicit and preserve the files without inventing a commit or handoff", async () => {
  const { root, project, logged, registered, env } = await savedRecovery("handoff");
  env.TEST_RESUME_FAILURE = "session/load:missing";
  await writeFile(join(logged.worktree.path, "partial.txt"), "Still here");
  await writeFile(join(root, ".git/hooks/pre-commit"), "#!/bin/sh\nexit 23\n", { mode: 0o700 });
  const server = project({ agentRegistry: createAgentRegistry([registered]) });
  await server.app.request("/api/health");
  const stint = await waitForEnding(root);
  expect(stint).toMatchObject({ status: "interrupted", checkpointCommit: null, handoff: null });
  expect(stint.error).toContain("Session not found");
  expect(stint.error).toContain("Checkpoint failed:");
  expect(await readFile(join(logged.worktree.path, "partial.txt"), "utf8")).toBe("Still here");
});

test("live human waits pause setup, work has no recovery deadline, and later work failure ends normally", async () => {
  const { root, project, registered, selected } = await savedRecovery("handoff");
  registered.verifyRecovery = async () => selected;
  let permissionRaised: () => void = () => {};
  const waitingForPermission = new Promise<void>((resolve) => {
    permissionRaised = resolve;
  });
  let failWork: (error: Error) => void = () => {};
  registered.launch = (options) => {
    let ready: () => void = () => {};
    const readiness = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let delivered: () => void = () => {};
    const forwarded = new Promise<void>((resolve) => {
      delivered = resolve;
    });
    const request = {
      sessionId: "fake-session",
      requestId: "live",
      toolCall: { toolCallId: "tool", title: "Live permission", status: "pending" as const },
      options: [{ optionId: "allow", name: "Allow once", kind: "allow_once" as const }],
      forwarded,
    };
    const done = new Promise<never>((_resolve, reject) => {
      failWork = reject;
    });
    void options.onPermission?.(request).then(() => {
      delivered();
      ready();
    });
    options.onEvent({
      type: "permission_request",
      requestId: "live",
      toolCallId: "tool",
      title: "Live permission",
      kind: null,
      automatic: false,
      details: "{}",
      options: request.options,
    });
    permissionRaised();
    return { ready: readiness, done, cancel: async () => failWork(new Error("Cancelled")) };
  };
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  try {
    const server = project({ agentRegistry: createAgentRegistry([registered]) });
    await server.app.request("/api/health");
    await waitingForPermission;
    const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
    expect(snapshot.attentionItems.some((item) => item.kind === "permission")).toBe(true);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(indexStints(createNodeRepoFiles(root)).stints[0]).toMatchObject({
      status: "running",
      recovery: { state: "resuming" },
    });
    expect(
      (
        await server.app.request("/api/stints/saved-phase/permissions/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId: "allow" }),
        })
      ).status,
    ).toBe(200);
    await vi.advanceTimersByTimeAsync(0);
    expect(indexStints(createNodeRepoFiles(root)).stints[0].recovery?.state).toBe("resumed");
    await vi.advanceTimersByTimeAsync(60_001);
    expect(indexStints(createNodeRepoFiles(root)).stints[0]).toMatchObject({
      status: "running",
      recovery: { state: "resumed" },
    });
    failWork(new Error("Work failed after setup"));
    // Only checkpoint Git I/O needs wall time; allow a busy host to finish its subprocesses.
    await expect
      .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].status, { timeout: 10_000 })
      .toBe("failed");
    const stint = indexStints(createNodeRepoFiles(root)).stints[0];
    expect(stint).toMatchObject({
      status: "failed",
      error: "Work failed after setup",
      recovery: { state: "resumed" },
    });
    expect(stint.recovery?.reason).toBeUndefined();
  } finally {
    vi.useRealTimers();
  }
});

test("multiple unfinished logs block their work item before any asynchronous writer starts", async () => {
  const { root, project } = await fixture();
  const first = await log(root, "ambiguous-first", "2026-10-09T10:00:00Z");
  const second = await log(root, "ambiguous-second", "2026-10-09T10:01:00Z");
  await writeFile(join(first.worktree.path, "partial.txt"), "Do not checkpoint concurrently");
  const server = project();
  const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
  expect(
    snapshot.warnings.some((warning) => warning.message.includes("Multiple unfinished stints")),
  ).toBe(true);
  expect(await readFile(first.path, "utf8")).toBe(first.text);
  expect(await readFile(second.path, "utf8")).toBe(second.text);
  expect(
    (await server.app.request("/api/work-items/first/checks", { method: "POST" })).status,
  ).toBe(409);
  await server.stop();
});

test("invalid logged IDs fall back in the discovered file without following an invented log path", async () => {
  const { root, project } = await fixture();
  const logged = await log(root, "discovered", "2026-10-09T10:00:00Z");
  const started = JSON.parse(logged.text);
  started.stint.id = "../../outside";
  const original = `${JSON.stringify(started)}\n`;
  await writeFile(logged.path, original);
  const server = project();
  await server.app.request("/api/health");
  const stint = await waitForEnding(root);
  expect(stint.status).toBe("interrupted");
  expect(stint.recovery?.reason).toBe("The stint ID does not match its log filename.");
  expect((await readFile(logged.path, "utf8")).startsWith(original)).toBe(true);
  await expect(readFile(join(root, ".stintwork/outside.jsonl"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("recovery discovery isolates unreadable logs and reports directory errors without blocking startup", async () => {
  const { root } = await fixture();
  const good = await log(root, "readable", "2026-10-09T10:00:00Z");
  const goodPath = ".stintwork/local/stints/readable.jsonl";
  const badPath = ".stintwork/local/stints/unreadable.jsonl";
  const adopt = vi.fn();
  const warn = vi.fn();
  recoverInterruptedStints(
    {
      list: () => [badPath, goodPath],
      read: (path) => {
        if (path === badPath) throw new Error("EACCES");
        return good.text;
      },
    },
    adopt,
    warn,
  );
  expect(adopt).toHaveBeenCalledTimes(1);
  expect(adopt.mock.calls[0][0].id).toBe("readable");
  expect(warn).toHaveBeenCalledWith({
    path: badPath,
    message: "Cannot read stint log: Error: EACCES",
  });
  recoverInterruptedStints(
    {
      list: () => {
        throw new Error("EACCES");
      },
      read: () => undefined,
    },
    adopt,
    warn,
  );
  expect(warn).toHaveBeenCalledWith({
    path: ".stintwork/local/stints/",
    message: "Cannot list stint logs: Error: EACCES",
  });
  expect(adopt).toHaveBeenCalledTimes(1);
});

test("graceful suspension keeps the original stint/session and dirty work for one startup continuation", async () => {
  const { root, project, registered, selected, env, calls } = await warmRecovery(
    "codex",
    "installed",
  );
  const initialAgent = createCodexAgent({ env: { ...env, TEST_RECOVERY: "crash" } });
  initialAgent.prepare = async () => selected;
  let working!: () => void;
  const work = new Promise<void>((resolve) => {
    working = resolve;
  });
  const launch = initialAgent.launch;
  initialAgent.launch = (options) =>
    launch({
      ...options,
      onEvent(event) {
        options.onEvent(event);
        if ("text" in event && event.text === "Before crash") working();
      },
    });
  const first = project({
    agentRegistry: createAgentRegistry([initialAgent]),
    handoffTimeoutMs: 3000,
  });
  const response = await first.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  await work;
  const original = indexStints(createNodeRepoFiles(root)).stints[0];
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: original.worktree.path,
    encoding: "utf8",
  });
  await Promise.all([first.stop(), first.stop()]);
  const suspended = indexStints(createNodeRepoFiles(root)).stints[0];
  expect(suspended).toMatchObject({
    id: original.id,
    status: "running",
    endedAt: null,
    checkpointCommit: null,
    recovery: {
      state: "suspended",
      sessionId: original.recovery?.sessionId,
      progress: { phase: "work" },
    },
  });
  expect(
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: original.worktree.path, encoding: "utf8" }),
  ).toBe(head);
  expect((await calls()).filter((call) => call.method === "session/prompt")).toHaveLength(1);
  const restarted = project({
    agentRegistry: createAgentRegistry([registered]),
    handoffTimeoutMs: 3000,
  });
  await restarted.app.request("/api/health");
  await waitForEnding(root);
  const ended = indexStints(createNodeRepoFiles(root)).stints[0];
  expect(ended).toMatchObject({
    id: original.id,
    startedAt: original.startedAt,
    baseCommit: original.baseCommit,
    brief: original.brief,
    status: "finished",
    recovery: { sessionId: original.recovery?.sessionId },
    handoff: { stoppedAt: "Recovered work." },
  });
});

test.each(["verification", "load", "permission", "continuation"])(
  "Stop during %s persists before cancellation and ignores late callbacks, even with shutdown",
  async (point) => {
    const { root, project, registered, selected, logged } = await savedRecovery("work");
    let entered!: () => void;
    const entering = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    registered.verifyRecovery = async () => {
      if (point === "verification") {
        entered();
        await held;
      }
      return selected;
    };
    let ready!: () => void;
    let finish!: (result: { stopReason: string }) => void;
    let callbacks: Parameters<typeof registered.launch>[0] | undefined;
    const launch = vi.fn((options: Parameters<typeof registered.launch>[0]) => {
      callbacks = options;
      const readiness = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const done = new Promise<{ stopReason: string }>((resolve) => {
        finish = resolve;
      });
      if (point === "permission") {
        if (!options.onPermission) throw new Error("Expected permission callback");
        void options.onPermission({
          sessionId: "fake-session",
          requestId: "pending",
          toolCall: { toolCallId: "tool" },
          options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
          forwarded: new Promise(() => {}),
        });
      }
      if (point === "continuation") ready();
      entered();
      return {
        ready: readiness,
        done,
        cancel: async () => {
          const text = await readFile(logged.path, "utf8");
          expect(text).toContain('"kind":"stop_requested"');
          finish({ stopReason: "cancelled" });
        },
      };
    });
    registered.launch = launch;
    const server = project({ agentRegistry: createAgentRegistry([registered]) });
    await server.app.request("/api/health");
    await entering;
    const stop = () => server.app.request("/api/stints/saved-phase/stop", { method: "POST" });
    expect((await stop()).status).toBe(202);
    const shutdown = server.stop();
    release();
    ready?.();
    await shutdown;
    const stopped = await waitForEnding(root);
    expect(stopped).toMatchObject({ status: "stopped", checkpointCommit: expect.any(String) });
    const before = await readFile(logged.path, "utf8");
    callbacks?.onEvent({ type: "message", id: "late", text: "Must not append" });
    callbacks?.onPhase?.("work", {});
    expect(await readFile(logged.path, "utf8")).toBe(before);
    const entries = before
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entries.filter((entry) => entry.type === "ended")).toHaveLength(1);
    expect(entries.filter((entry) => entry.kind === "stop_requested")).toHaveLength(1);
    expect((await stop()).status).toBe(409);
    expect(
      (
        await server.app.request("/api/stints/saved-phase/permissions/pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId: "allow" }),
        })
      ).status,
    ).toBe(409);
    if (point === "verification") expect(launch).not.toHaveBeenCalled();
  },
);

test("a crash after durable Stop intent checkpoints once without verifying or loading work", async () => {
  const { root, project, registered, logged, entries, calls } = await savedRecovery("work");
  entries.push({
    type: "recovery",
    version: 1,
    at: "2026-01-01T00:00:01Z",
    kind: "stop_requested",
  });
  await writeFile(logged.path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  const verify = vi.fn(async () => {
    throw new Error("Stop must not load");
  });
  registered.verifyRecovery = verify;
  const server = project({ agentRegistry: createAgentRegistry([registered]) });
  await server.app.request("/api/health");
  const ended = await waitForEnding(root);
  expect(ended).toMatchObject({ status: "stopped", checkpointCommit: expect.any(String) });
  expect(verify).not.toHaveBeenCalled();
  expect(await calls()).toEqual([]);
  await server.stop();
  const before = await readFile(logged.path, "utf8");
  const restarted = project({ agentRegistry: createAgentRegistry([registered]) });
  await restarted.app.request("/api/health");
  expect(await readFile(logged.path, "utf8")).toBe(before);
});

test("a concurrent server reserves recovery before async verification and cannot be stopped by its neighbour", async () => {
  const { root, project, registered, selected, tracked, logged } = await savedRecovery("work");
  const child = spawn(
    process.execPath,
    sourceNodeArgs(
      "--input-type=module",
      "--eval",
      `
    import {createProjectServer} from ${JSON.stringify(new URL("./index.ts", import.meta.url).href)};
    import {createAgentRegistry,createCodexAgent} from ${JSON.stringify(new URL("../../agents/src/index.ts", import.meta.url).href)};
    const agent = createCodexAgent({env:{}});
    agent.verifyRecovery = async () => {process.send('reserved'); return new Promise(()=>{});};
    const server = createProjectServer(${JSON.stringify(root)},${JSON.stringify(join(root, "web"))},{agentRegistry:createAgentRegistry([agent])});
    await server.app.request('/api/health');
  `,
    ),
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  tracked.children.push(child);
  const [message] = await once(child, "message");
  expect(message).toBe("reserved");
  const before = await readFile(logged.path, "utf8");
  const verify = vi.fn(async () => selected);
  registered.verifyRecovery = verify;
  const second = project({ agentRegistry: createAgentRegistry([registered]) });
  const snapshot: ProjectSnapshot = await (await second.app.request("/api/project")).json();
  expect(snapshot.warnings.some((warning) => warning.message.includes("another server"))).toBe(
    true,
  );
  expect(
    (await second.app.request("/api/stints/saved-phase/stop", { method: "POST" })).status,
  ).toBe(409);
  await second.stop();
  expect(verify).not.toHaveBeenCalled();
  expect(await readFile(logged.path, "utf8")).toBe(before);
  expect(child.exitCode).toBeNull();
});

test("unverifiable replacement cleanup blocks checkpoint and further Stop without releasing the work item", async () => {
  const { root, project, registered, selected, logged } = await savedRecovery("work");
  registered.verifyRecovery = async () => selected;
  const { ProcessOwnershipError } = await import("@stintwork/agents");
  let failed!: (error: Error) => void;
  const failure = new Promise<never>((_, reject) => {
    failed = reject;
  });
  let ready!: () => void;
  const entered = new Promise<void>((resolve) => {
    ready = resolve;
  });
  registered.launch = () => {
    ready();
    return { ready: Promise.resolve(), done: failure, cancel: async () => {} };
  };
  const server = project({ agentRegistry: createAgentRegistry([registered]) });
  await server.app.request("/api/health");
  await entered;
  const before = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: logged.worktree.path,
    encoding: "utf8",
  });
  failed(
    new ProcessOwnershipError(
      "Unsafe adapter/tool ownership. Stop the old processes and restart Stintwork.",
    ),
  );
  await expect
    .poll(async () => {
      const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
      return snapshot.warnings.some((warning) =>
        warning.message.includes("Unsafe adapter/tool ownership"),
      );
    })
    .toBe(true);
  expect(indexStints(createNodeRepoFiles(root)).stints[0]).toMatchObject({
    status: "running",
    checkpointCommit: null,
  });
  expect(
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: logged.worktree.path, encoding: "utf8" }),
  ).toBe(before);
  expect(
    (await server.app.request("/api/stints/saved-phase/stop", { method: "POST" })).status,
  ).toBe(409);
});

test("shutdown detaches an unverified live permission without a developer rejection or unsafe checkpoint", async () => {
  const { root, project, registered, selected } = await warmRecovery("codex", "installed");
  let raised!: () => void;
  const waiting = new Promise<void>((resolve) => {
    raised = resolve;
  });
  let requestId = "";
  const fake = createFakeAgentLauncher([
    {
      type: "permission",
      toolCall: { toolCallId: "work" },
      options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
    },
  ]);
  const server = project({
    agentRegistry: createAgentRegistry([registered]),
    prepareAgent: async () => selected,
    launchAgent: ({ preparedAgent: _, ...options }) =>
      fake({
        ...options,
        onEvent(event) {
          options.onEvent(event);
          if (event.type === "permission_request") {
            requestId = event.requestId;
            raised();
          }
        },
      }),
  });
  const response = await server.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  await waiting;
  const original = indexStints(createNodeRepoFiles(root)).stints[0];
  await server.stop();
  const suspended = indexStints(createNodeRepoFiles(root)).stints[0];
  expect(suspended).toMatchObject({
    id: original.id,
    status: "running",
    endedAt: null,
    checkpointCommit: null,
    recovery: { state: "suspending", progress: { phase: "work" } },
  });
  expect(suspended.events.filter((event) => event.type === "permission")).toEqual([]);
  expect(
    (
      await server.app.request(`/api/stints/${original.id}/permissions/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId: "allow" }),
      })
    ).status,
  ).toBe(409);
});

test("shutdown after a genuine completed turn finishes saved finalization instead of suspending work", async () => {
  const { root, project, registered, selected, logged, started } = await savedRecovery("work");
  registered.verifyRecovery = async () => selected;
  let complete!: () => void;
  let finish!: (value: { stopReason: string }) => void;
  const completed = new Promise<void>((resolve) => {
    complete = resolve;
  });
  registered.launch = (options) => {
    if (!options.onPhase) throw new Error("Expected phase persistence");
    options.onPhase("finalization", {
      stopReason: "end_turn",
      handoff: { stoppedAt: "Saved final turn", unresolved: "None", nextStep: "Review" },
      findings: [],
    });
    complete();
    return {
      ready: new Promise<void>(() => {}),
      done: new Promise((resolve) => {
        finish = resolve;
      }),
      cancel: async () => {
        finish({ stopReason: "end_turn" });
      },
      suspend: async () => {
        throw new Error("Completed work must finalize");
      },
    };
  };
  const server = project({ agentRegistry: createAgentRegistry([registered]) });
  await server.app.request("/api/health");
  await completed;
  const beforeShutdown = await readFile(logged.path, "utf8");
  await server.stop();
  const ended = await waitForEnding(root);
  expect(ended).toMatchObject({
    status: "finished",
    handoff: { stoppedAt: "Saved final turn" },
    findings: { commit: started.stint.baseCommit, findings: [] },
  });
  expect((await readFile(logged.path, "utf8")).slice(beforeShutdown.length)).not.toContain(
    '"state":"suspended"',
  );
});

test("shutdown cancels a fresh launcher still opening its first session before awaiting preparation", async () => {
  const { root, project, registered, selected } = await warmRecovery("codex", "installed");
  let entered!: () => void;
  let finish!: (value: { stopReason: string }) => void;
  const starting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const cancel = vi.fn(async () => {
    finish({ stopReason: "cancelled" });
  });
  registered.prepare = async () => selected;
  registered.launch = () => {
    entered();
    return {
      ready: new Promise<void>(() => {}),
      done: new Promise((resolve) => {
        finish = resolve;
      }),
      cancel,
    };
  };
  const server = project({ agentRegistry: createAgentRegistry([registered]) });
  const request = server.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  await starting;
  const stopping = server.stop();
  try {
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    finish({ stopReason: "cancelled" });
    await stopping;
    await request;
  }
  expect(indexStints(createNodeRepoFiles(root)).stints[0]).toMatchObject({
    status: "interrupted",
    checkpointCommit: expect.any(String),
  });
});

test("malformed ownership metadata cannot reclaim a live server's reservation", async () => {
  const { root, project, registered, logged } = await savedRecovery("work");
  const directory = join(root, ".stintwork/local/stint-owners");
  await mkdir(directory, { recursive: true });
  const owner = join(directory, "first.owner");
  const text = JSON.stringify({ pid: process.pid, identity: 123, token: "live-owner" });
  await writeFile(owner, text);
  const read = vi
    .spyOn(systemProcesses, "read")
    .mockReturnValue([
      { pid: process.pid, group: process.pid, identity: "real-server-start", command: "server" },
    ]);
  registered.verifyRecovery = vi.fn(async () => new Promise<never>(() => {}));
  const server = project({ agentRegistry: createAgentRegistry([registered]) });
  try {
    const before = await readFile(logged.path, "utf8");
    const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
    expect(
      snapshot.warnings.some((warning) => warning.message.includes("ownership is unverifiable")),
    ).toBe(true);
    expect(await readFile(owner, "utf8")).toBe(text);
    expect(await readFile(logged.path, "utf8")).toBe(before);
    expect(registered.verifyRecovery).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
    await server.stop();
  }
});

test("an observed replacement initialize exit reaches fallback even while native PID probes still see its zombie", async () => {
  const { root, project, registered, env, logged, calls } = await savedRecovery("handoff");
  env.TEST_RESUME_FAILURE = "initialize:exit";
  let replacementPid = 0;
  const exists = systemProcesses.exists;
  const read = vi
    .spyOn(systemProcesses, "read")
    .mockReturnValue([
      { pid: process.pid, group: process.pid, identity: "server-start", command: "server" },
    ]);
  const probe = vi
    .spyOn(systemProcesses, "exists")
    .mockImplementation((pid) =>
      replacementPid && Math.abs(pid) === replacementPid ? true : exists(pid),
    );
  const launch = registered.launch;
  registered.launch = vi.fn((options) =>
    launch({
      ...options,
      onProcess(attempt) {
        // Reproduce native identity recording without requiring this sandbox's blocked ps.
        attempt.identity = "replacement-start";
        attempt.processGroup = true;
        replacementPid = attempt.pid;
        options.onProcess?.(attempt);
      },
    }),
  );
  const server = project({ agentRegistry: createAgentRegistry([registered]) });
  try {
    await writeFile(join(logged.worktree.path, "partial.txt"), "Preserved before initialize exit");
    await server.app.request("/api/health");
    const stint = await waitForEnding(root);
    expect(stint).toMatchObject({
      status: "interrupted",
      checkpointCommit: expect.any(String),
      recovery: { state: "fallback" },
    });
    expect(stint.recovery?.reason).toMatch(/exited before|ACP transport closed/);
    expect(
      execFileSync("git", ["show", `${stint.checkpointCommit}:partial.txt`], {
        cwd: root,
        encoding: "utf8",
      }),
    ).toBe("Preserved before initialize exit");
    expect(
      (await readFile(logged.path, "utf8"))
        .split("\n")
        .filter((line) => line.includes('"type":"ended"')),
    ).toHaveLength(1);
    expect((await calls()).map((call) => call.method)).toEqual(["initialize"]);
    expect(registered.launch).toHaveBeenCalledOnce();
  } finally {
    read.mockRestore();
    probe.mockRestore();
    await server.stop();
  }
});

test.each([false, true])(
  "suspension proof survives repeated startup crashes but never covers a later attempt (uncovered: %s)",
  async (uncovered) => {
    const { root, project, registered, logged, entries, started } =
      await savedRecovery("finalization");
    const old = entries.find((entry) => entry.type === "recovery" && entry.kind === "attempt");
    if (old?.type !== "recovery" || old.kind !== "attempt") throw new Error("Expected attempt");
    old.attempt.pid = process.pid; // Reused by an unrelated process after its completed cleanup.
    old.attempt.identity = "previous-start";
    const at = "2026-10-26T12:00:00Z";
    const resume = (state: "suspended" | "resuming"): StintLogEntry => ({
      type: "recovery",
      version: 1,
      at,
      kind: "resume",
      state,
    });
    entries.push(resume("suspended"), resume("resuming"), resume("resuming"));
    for (const id of ["second-attempt", ...(uncovered ? ["uncleaned-attempt"] : [])]) {
      const attempt = { ...old.attempt, id, marker: `stintwork-${id}` };
      entries.push(
        { type: "recovery", version: 1, at, kind: "attempt", attempt },
        {
          type: "recovery",
          version: 1,
          at,
          kind: "session",
          attemptId: id,
          sessionId: "fake-session",
        },
        {
          type: "recovery",
          version: 1,
          at,
          kind: "phase",
          attemptId: id,
          progress: { phase: "finalization", status: "finished" },
        },
      );
      if (id !== "uncleaned-attempt")
        entries.push(resume("suspended"), resume("resuming"), resume("resuming"));
    }
    await writeFile(logged.path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    const read = vi
      .spyOn(systemProcesses, "read")
      .mockReturnValue([
        { pid: process.pid, group: process.pid, identity: "unrelated-start", command: "editor" },
      ]);
    const signal = vi.spyOn(systemProcesses, "signal").mockImplementation(() => {
      throw new Error("Must never signal reused PID");
    });
    registered.launch = vi.fn(() => {
      throw new Error("Saved finalization must not launch");
    });
    const server = project({ agentRegistry: createAgentRegistry([registered]) });
    try {
      await server.app.request("/api/health");
      if (uncovered) {
        await expect
          .poll(async () => {
            const snapshot: ProjectSnapshot = await (
              await server.app.request("/api/project")
            ).json();
            return snapshot.warnings.some((warning) =>
              warning.message.includes("uncleaned-attempt"),
            );
          })
          .toBe(true);
        expect(indexStints(createNodeRepoFiles(root)).stints[0]).toMatchObject({
          status: "running",
          checkpointCommit: null,
        });
      } else {
        const ended = await waitForEnding(root);
        expect(ended).toMatchObject({
          status: "finished",
          checkpointCommit: expect.any(String),
          findings: { commit: started.stint.baseCommit, findings: [] },
        });
        expect(
          (await readFile(logged.path, "utf8"))
            .split("\n")
            .filter((line) => line.includes('"type":"ended"')),
        ).toHaveLength(1);
      }
      expect(registered.launch).not.toHaveBeenCalled();
      expect(signal).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      signal.mockRestore();
      await server.stop();
    }
  },
);

test("an exited working replacement with an untraceable detached writer blocks checkpoint and suspension", async () => {
  const { root, project, registered, env, logged, calls } = await savedRecovery("work");
  env.TEST_RESUME_FAILURE = "session/prompt:exit";
  const read = vi.spyOn(systemProcesses, "read").mockReturnValue([
    { pid: process.pid, group: process.pid, identity: "server-start", command: "server" },
    { pid: 123456789, parent: 1, group: 123456789, identity: "tool-start", command: "tool" },
  ]);
  let replacementPid = 0;
  const exists = systemProcesses.exists;
  const probe = vi
    .spyOn(systemProcesses, "exists")
    .mockImplementation((pid) =>
      replacementPid && Math.abs(pid) === replacementPid ? false : exists(pid),
    );
  const signal = vi.spyOn(systemProcesses, "signal").mockImplementation(() => {
    throw new Error("Must never signal an unverified writer");
  });
  const launch = registered.launch;
  registered.launch = vi.fn((options) =>
    launch({
      ...options,
      onProcess(attempt) {
        attempt.identity = "replacement-start";
        attempt.processGroup = true;
        replacementPid = attempt.pid;
        options.onProcess?.(attempt);
      },
    }),
  );
  const server = project({ agentRegistry: createAgentRegistry([registered]) });
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: logged.worktree.path,
      encoding: "utf8",
    });
    await writeFile(join(logged.worktree.path, "partial.txt"), "Still being written");
    await server.app.request("/api/health");
    await expect
      .poll(async () => {
        const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
        return snapshot.warnings.some((warning) =>
          warning.message.includes("adapter/tool ownership"),
        );
      })
      .toBe(true);
    expect(replacementPid).toBeGreaterThan(0);
    expect(systemProcesses.exists(replacementPid)).toBe(false);
    expect(systemProcesses.exists(-replacementPid)).toBe(false);
    expect((await calls()).some((call) => call.method === "session/prompt")).toBe(true);
    expect(indexStints(createNodeRepoFiles(root)).stints[0]).toMatchObject({
      status: "running",
      checkpointCommit: null,
    });
    expect(
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: logged.worktree.path, encoding: "utf8" }),
    ).toBe(head);
    expect(signal).not.toHaveBeenCalled();
    await server.stop();
    const saved = (await readFile(logged.path, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(saved.filter((entry) => entry.type === "ended")).toEqual([]);
    // Only the fixture's original cleanup proof exists; the replacement never completed suspension.
    expect(
      saved.filter((entry) => entry.kind === "resume" && entry.state === "suspended"),
    ).toHaveLength(1);
    expect(registered.launch).toHaveBeenCalledOnce();
  } finally {
    read.mockRestore();
    signal.mockRestore();
    probe.mockRestore();
    await server.stop();
  }
});

test("cleanup during recovery stays proven through successive crashes and reused adapter PIDs", async () => {
  const { root, project, registered, logged } = await savedRecovery("finalization");
  const table = new Map<number, ReturnType<typeof systemProcesses.read>[number]>([
    [
      process.pid,
      { pid: process.pid, group: process.pid, identity: "server-start", command: "server" },
    ],
  ]);
  const read = vi.spyOn(systemProcesses, "read").mockImplementation(() => [...table.values()]);
  const exists = vi
    .spyOn(systemProcesses, "exists")
    .mockImplementation((pid) =>
      pid < 0 ? [...table.values()].some((row) => row.group === -pid) : table.has(pid),
    );
  const signal = vi.spyOn(systemProcesses, "signal").mockImplementation((pid, value) => {
    for (const row of table.values())
      if (pid === row.pid || -pid === row.group) {
        if (value === "SIGSTOP") row.state = "T";
        else table.delete(row.pid);
      }
  });
  registered.launch = vi.fn(() => {
    throw new Error("Saved finalization must not launch");
  });
  try {
    for (let cycle = 1; cycle <= 3; cycle++) {
      const id = `cycle-${cycle}`;
      const pid = 123450 + cycle;
      const at = `2026-10-26T12:00:0${cycle}Z`;
      const attempt: StintProcessAttempt = {
        id,
        pid,
        marker: `stintwork-${id}`,
        identity: `start-${cycle}`,
        processGroup: true,
        owner: { pid: 10, identity: "old-server", startedAt: at },
      };
      table.set(pid, {
        pid,
        group: pid,
        identity: attempt.identity as string,
        command: attempt.marker as string,
      });
      // Crash after finalization but before ended is durable; the next attempt has no suspension yet.
      const entries = (await readFile(logged.path, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter((entry) => entry.type !== "ended");
      entries.push(
        { type: "recovery", version: 1, at, kind: "attempt", attempt },
        {
          type: "recovery",
          version: 1,
          at,
          kind: "session",
          attemptId: id,
          sessionId: "fake-session",
        },
        {
          type: "recovery",
          version: 1,
          at,
          kind: "phase",
          attemptId: id,
          progress: { phase: "finalization", status: "finished" },
        },
      );
      await writeFile(logged.path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
      const server = project({ agentRegistry: createAgentRegistry([registered]) });
      await server.app.request("/api/health");
      expect(await waitForEnding(root)).toMatchObject({
        status: "finished",
        checkpointCommit: expect.any(String),
      });
      await server.stop();
      expect(table.has(pid)).toBe(false);
      expect(signal.mock.calls.slice(-2)).toEqual([
        [-pid, "SIGSTOP"],
        [-pid, "SIGKILL"],
      ]);
      // Its numeric PID is immediately reused by an unrelated writer before the next crash recovery.
      table.set(pid, { pid, group: pid, identity: "reused-start", command: "editor" });
      expect(table.get(process.pid)?.identity).toBe("server-start");
    }
    expect(signal).toHaveBeenCalledTimes(6);
    expect(registered.launch).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
    exists.mockRestore();
    signal.mockRestore();
  }
});

test.each(["finish", "Stop", "failure", "fallback"] as const)(
  "a crash during %s checkpoint reuses durable cleanup proof and only finalizes",
  async (outcome) => {
    const { root, project, registered, selected, logged } = await savedRecovery("work");
    registered.verifyRecovery = async () => selected;
    const read = vi
      .spyOn(systemProcesses, "read")
      .mockReturnValue([
        { pid: process.pid, group: process.pid, identity: "server-start", command: "server" },
      ]);
    const signal = vi.spyOn(systemProcesses, "signal").mockImplementation(() => {
      throw new Error("An already cleaned attempt must never be signalled");
    });
    let launched!: () => void;
    const launching = new Promise<void>((resolve) => {
      launched = resolve;
    });
    let complete!: () => void;
    let fail!: () => void;
    registered.launch = vi.fn((options) => {
      const attempt: StintProcessAttempt = {
        id: "ending-attempt",
        pid: 123456789,
        marker: "stintwork-ending-attempt",
        identity: "adapter-start",
        processGroup: true,
        owner: { pid: process.pid, startedAt: "2026-10-26T12:00:00Z", identity: "server-start" },
      };
      options.onProcess?.(attempt);
      options.onSession?.("fake-session");
      let finish!: (result: { stopReason: string }) => void;
      let rejectDone!: (error: Error) => void;
      let rejectReady!: (error: Error) => void;
      const ready =
        outcome === "fallback"
          ? new Promise<void>((_resolve, reject) => {
              rejectReady = reject;
            })
          : Promise.resolve();
      const done = new Promise<{ stopReason: string }>((resolve, reject) => {
        finish = resolve;
        rejectDone = reject;
      });
      // This fake explicitly proves owned process-tree cleanup, before settling done in either direction.
      complete = () => {
        options.onCleanup?.(attempt.id);
        finish({ stopReason: "end_turn" });
      };
      fail = () => {
        options.onCleanup?.(attempt.id);
        const error = new Error("Controlled agent failure");
        rejectDone(error);
        rejectReady?.(error);
      };
      launched();
      return { ready, done, cancel: async () => complete() };
    });
    let atCheckpoint!: () => void;
    const checkpointing = new Promise<void>((resolve) => {
      atCheckpoint = resolve;
    });
    let continueCheckpoint!: () => void;
    const held = new Promise<void>((resolve) => {
      continueCheckpoint = resolve;
    });
    let crashLog = "";
    const realCheckpoint = git.createCheckpoint;
    const checkpoint = vi.spyOn(git, "createCheckpoint").mockImplementationOnce(async (...args) => {
      crashLog = await readFile(logged.path, "utf8");
      atCheckpoint();
      await held;
      return realCheckpoint(...args);
    });
    const first = project({ agentRegistry: createAgentRegistry([registered]) });
    try {
      await first.app.request("/api/health");
      await launching;
      if (outcome !== "fallback")
        await expect
          .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].recovery?.state)
          .toBe("resumed");
      if (outcome === "Stop")
        expect(
          (await first.app.request("/api/stints/saved-phase/stop", { method: "POST" })).status,
        ).toBe(202);
      else if (outcome === "finish") complete();
      else fail();
      await checkpointing;
      expect(crashLog).not.toContain('"type":"ended"');
      continueCheckpoint();
      await waitForEnding(root);
      await first.stop();
      // Restore exactly the durable prefix captured between done and checkpoint/ended.
      await writeFile(logged.path, crashLog);
      registered.verifyRecovery = vi.fn(() => {
        throw new Error("Finalization must not verify or load");
      });
      registered.launch = vi.fn(() => {
        throw new Error("Finalization must not start a writer");
      });
      const restarted = project({ agentRegistry: createAgentRegistry([registered]) });
      await restarted.app.request("/api/health");
      await expect
        .poll(async () => {
          const snapshot: ProjectSnapshot = await (
            await restarted.app.request("/api/project")
          ).json();
          return (
            indexStints(createNodeRepoFiles(root)).stints[0].status !== "running" ||
            snapshot.warnings.some((warning) => warning.message.includes("adapter/tool ownership"))
          );
        })
        .toBe(true);
      expect(indexStints(createNodeRepoFiles(root)).stints[0]).toMatchObject({
        status: { finish: "finished", Stop: "stopped", failure: "failed", fallback: "interrupted" }[
          outcome
        ],
        checkpointCommit: expect.any(String),
      });
      expect(crashLog).toContain('"kind":"cleanup","attemptId":"ending-attempt"');
      expect(registered.launch).not.toHaveBeenCalled();
      expect(registered.verifyRecovery).not.toHaveBeenCalled();
      expect(signal).not.toHaveBeenCalled();
      expect(
        (await readFile(logged.path, "utf8"))
          .split("\n")
          .filter((line) => line.includes('"type":"ended"')),
      ).toHaveLength(1);
    } finally {
      continueCheckpoint();
      checkpoint.mockRestore();
      await first.stop();
      read.mockRestore();
      signal.mockRestore();
    }
  },
);

test.each(["win32", "uncertified-launcher"] as const)(
  "shutdown with injected %s cleanup cannot certify suspension or checkpoint beside a tool",
  async (capability) => {
    const { root, project, registered, selected, logged, env } = await savedRecovery("work");
    env.TEST_RECOVERY = "crash";
    registered.verifyRecovery = async () => selected;
    let working!: () => void;
    const work = new Promise<void>((resolve) => {
      working = resolve;
    });
    const launch = createAgentLauncher(
      () => {
        throw new Error("Prepared launch expected");
      },
      fakeAgentProfiles.codex,
      env,
      "win32",
    );
    registered.launch = (options) =>
      launch({
        ...options,
        onEvent(event) {
          options.onEvent(event);
          if ("text" in event && event.text === "Before crash") working();
        },
      });
    if (capability === "uncertified-launcher")
      registered.launch = (options) => {
        options.onProcess?.({
          id: "uncertified",
          pid: 123456789,
          marker: "stintwork-uncertified",
          owner: { pid: process.pid, startedAt: "2026-10-26T12:00:00Z" },
        });
        options.onSession?.("fake-session");
        let finish!: (result: { stopReason: string }) => void;
        const done = new Promise<{ stopReason: string }>((resolve) => {
          finish = resolve;
        });
        queueMicrotask(working);
        return {
          ready: Promise.resolve(),
          done,
          cancel: async () => finish({ stopReason: "cancelled" }),
          suspend: async () => finish({ stopReason: "cancelled" }),
        };
      };
    const read = vi.spyOn(systemProcesses, "read").mockReturnValue([
      { pid: process.pid, group: process.pid, identity: "server-start", command: "server" },
      { pid: 123456790, parent: 1, group: 123456790, identity: "tool-start", command: "tool" },
    ]);
    const signal = vi.spyOn(systemProcesses, "signal").mockImplementation(() => {
      throw new Error("Unverified tool must never be signalled");
    });
    const checkpoint = vi.spyOn(git, "createCheckpoint");
    const server = project({ agentRegistry: createAgentRegistry([registered]) });
    try {
      await server.app.request("/api/health");
      await work;
      const head = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: logged.worktree.path,
        encoding: "utf8",
      });
      const before = await readFile(logged.path, "utf8");
      await server.stop();
      const after = await readFile(logged.path, "utf8");
      expect(indexStints(createNodeRepoFiles(root)).stints[0]).toMatchObject({
        status: "running",
        checkpointCommit: null,
        recovery: { state: "suspending" },
      });
      expect(after.slice(before.length)).not.toMatch(
        /"kind":"cleanup"|"state":"suspended"|"type":"ended"/,
      );
      const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
      expect(
        snapshot.warnings.some((warning) =>
          warning.message.includes("Verified process-tree cleanup is unavailable"),
        ),
      ).toBe(true);
      expect(
        execFileSync("git", ["rev-parse", "HEAD"], { cwd: logged.worktree.path, encoding: "utf8" }),
      ).toBe(head);
      expect(checkpoint).not.toHaveBeenCalled();
      expect(signal).not.toHaveBeenCalled();
    } finally {
      await server.stop();
      checkpoint.mockRestore();
      read.mockRestore();
      signal.mockRestore();
    }
  },
);

test("a cleanup-proof write failure blocks checkpoint even though the fake adapter is gone", async () => {
  const { root, project, registered, selected, logged } = await savedRecovery("work");
  registered.verifyRecovery = async () => selected;
  let launched!: () => void;
  const launching = new Promise<void>((resolve) => {
    launched = resolve;
  });
  let finish!: () => void;
  registered.launch = (options) => {
    options.onProcess?.({
      id: "cleaned",
      pid: 123456789,
      marker: "stintwork-cleaned",
      identity: "adapter-start",
      processGroup: true,
      owner: { pid: process.pid, startedAt: "2026-10-26T12:00:00Z" },
    });
    const done = new Promise<{ stopReason: string }>((resolve, reject) => {
      finish = () => {
        try {
          options.onCleanup?.("cleaned");
          resolve({ stopReason: "end_turn" });
        } catch (error) {
          reject(error);
        }
      };
    });
    launched();
    return { ready: Promise.resolve(), done, cancel: async () => {} };
  };
  const checkpoint = vi.spyOn(git, "createCheckpoint");
  const server = project({ agentRegistry: createAgentRegistry([registered]) });
  try {
    await server.app.request("/api/health");
    await launching;
    await expect
      .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].recovery?.state)
      .toBe("resumed");
    await rename(logged.path, `${logged.path}.saved`);
    await mkdir(logged.path);
    try {
      finish();
    } finally {
      await rm(logged.path, { recursive: true });
      await rename(`${logged.path}.saved`, logged.path);
    }
    await expect
      .poll(async () => {
        const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
        return snapshot.warnings.some((warning) =>
          warning.message.includes("Cannot persist verified process cleanup"),
        );
      })
      .toBe(true);
    expect(indexStints(createNodeRepoFiles(root)).stints[0]).toMatchObject({
      status: "running",
      checkpointCommit: null,
    });
    expect(checkpoint).not.toHaveBeenCalled();
    expect(await readFile(logged.path, "utf8")).not.toContain('"kind":"cleanup"');
  } finally {
    await server.stop();
    checkpoint.mockRestore();
  }
});

test("a failed suspending append still tears down the writer and server resources without certifying or checkpointing", async () => {
  const { root, project, registered, selected, logged } = await savedRecovery("work");
  registered.verifyRecovery = async () => selected;
  let launched!: () => void;
  const launching = new Promise<void>((resolve) => {
    launched = resolve;
  });
  let teardownStarted!: () => void;
  const tearingDown = new Promise<void>((resolve) => {
    teardownStarted = resolve;
  });
  let release!: () => void;
  const cleanupAllowed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let finish!: (result: { stopReason: string }) => void;
  let alive = true;
  const suspend = vi.fn(async () => {
    teardownStarted();
    await cleanupAllowed;
    alive = false;
    cleanupCallback?.();
    finish({ stopReason: "cancelled" });
  });
  let cleanupCallback: (() => void) | undefined;
  registered.launch = (options) => {
    options.onProcess?.({
      id: "writer",
      pid: 123456789,
      marker: "stintwork-writer",
      identity: "writer-start",
      processGroup: true,
      owner: { pid: process.pid, startedAt: "2026-10-26T12:00:00Z" },
    });
    options.onSession?.("fake-session");
    cleanupCallback = () => options.onCleanup?.("writer");
    const done = new Promise<{ stopReason: string }>((resolve) => {
      finish = resolve;
    });
    launched();
    return { ready: Promise.resolve(), done, suspend, cancel: async () => {} };
  };
  const checkpoint = vi.spyOn(git, "createCheckpoint");
  const watcherClose = vi.spyOn(FSWatcher.prototype, "close");
  const websocketClose = vi.spyOn(WebSocketServer.prototype, "close");
  const server = project({ agentRegistry: createAgentRegistry([registered]) });
  const listener = (await server.start()) as Server;
  await launching;
  await expect
    .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].recovery?.state)
    .toBe("resumed");
  let listening = true;
  const listeningState = vi.spyOn(listener, "listening", "get").mockImplementation(() => listening);
  const httpClose = vi.spyOn(listener, "close").mockImplementation((callback) => {
    listening = false;
    callback?.();
    return listener;
  });
  let stopping: Promise<unknown> | undefined;
  let displaced = false;
  try {
    await rename(logged.path, `${logged.path}.saved`);
    displaced = true;
    await mkdir(logged.path);
    stopping = server.stop().then(
      () => "stopped",
      (error) => error,
    );
    const reachedTeardown = await Promise.race([
      tearingDown.then(() => true),
      stopping.then(() => false),
    ]);
    expect(reachedTeardown).toBe(true);
    expect(alive).toBe(true);
    // Repair storage before cleanup finishes: failure of the intent append must still withhold proof.
    await rm(logged.path, { recursive: true });
    await rename(`${logged.path}.saved`, logged.path);
    displaced = false;
    release();
    expect(await stopping).toBe("stopped");
    expect(alive).toBe(false);
    expect(suspend).toHaveBeenCalledOnce();
    expect(watcherClose).toHaveBeenCalled();
    expect(websocketClose).toHaveBeenCalled();
    expect(httpClose).toHaveBeenCalledOnce();
    expect(checkpoint).not.toHaveBeenCalled();
    const text = await readFile(logged.path, "utf8");
    expect(text).not.toMatch(/"kind":"cleanup"|"type":"ended"/);
    expect(
      text
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter((entry) => entry.state === "suspended"),
    ).toHaveLength(1); // Original fixture proof only.
    expect(indexStints(createNodeRepoFiles(root)).stints[0]).toMatchObject({
      status: "running",
      checkpointCommit: null,
    });
    await expect(server.stop()).resolves.toBeUndefined();
  } finally {
    if (displaced) {
      await rm(logged.path, { recursive: true });
      await rename(`${logged.path}.saved`, logged.path);
    }
    cleanupCallback = undefined;
    release();
    finish({ stopReason: "cancelled" });
    await stopping;
    await server.stop().catch(() => {});
    checkpoint.mockRestore();
    watcherClose.mockRestore();
    websocketClose.mockRestore();
    httpClose.mockRestore();
    listeningState.mockRestore();
    // Baseline caches the rejected stop; avoid repeating that intentional failure in fixture teardown.
    server.stop = async () => {};
  }
});

test("a rejected shutdown closes server resources and a later stop retries successfully", async () => {
  const { project } = await fixture();
  const original = checkModule.createChecks;
  const stopChecks = vi
    .fn()
    .mockRejectedValueOnce(new Error("Controlled shutdown failure"))
    .mockResolvedValue(undefined);
  const checks = vi
    .spyOn(checkModule, "createChecks")
    .mockImplementation((...args) => ({ ...original(...args), stop: stopChecks }));
  const watcherClose = vi.spyOn(FSWatcher.prototype, "close");
  const websocketClose = vi.spyOn(WebSocketServer.prototype, "close");
  const server = project();
  const listener = (await server.start()) as Server;
  let listening = true;
  const listeningState = vi.spyOn(listener, "listening", "get").mockImplementation(() => listening);
  const httpClose = vi.spyOn(listener, "close").mockImplementation((callback) => {
    listening = false;
    callback?.();
    return listener;
  });
  try {
    await expect(server.stop()).rejects.toThrow("Controlled shutdown failure");
    expect(watcherClose).toHaveBeenCalled();
    expect(websocketClose).toHaveBeenCalledOnce();
    expect(httpClose).toHaveBeenCalledOnce();
    await expect(server.stop()).resolves.toBeUndefined();
    expect(stopChecks).toHaveBeenCalledTimes(2);
    await expect(server.start()).rejects.toThrow("Project server is stopped");
  } finally {
    await server.stop().catch(() => {});
    checks.mockRestore();
    watcherClose.mockRestore();
    websocketClose.mockRestore();
    httpClose.mockRestore();
    listeningState.mockRestore();
    server.stop = async () => {};
  }
});

test.each(["resume", "fallback", "detached-writer", "missing-worktree"] as const)(
  "startup after an EOF-exited adapter uses a complete fake native writer scan: %s",
  async (scenario) => {
    const { root, project, registered, selected, logged, entries } = await savedRecovery("work");
    const old = entries.find((entry) => entry.type === "recovery" && entry.kind === "attempt");
    if (old?.type !== "recovery" || old.kind !== "attempt") throw new Error("Expected attempt");
    const uid = process.getuid?.() as number;
    Object.assign(old.attempt, {
      pid: 20,
      identity: `${uid}:old-adapter`,
      processGroup: true,
      owner: { pid: 10, identity: `${uid}:old-owner`, startedAt: old.attempt.owner.startedAt },
    });
    await writeFile(
      logged.path,
      `${entries
        .filter((entry) => !(entry.type === "recovery" && entry.kind === "resume"))
        .map((entry) => JSON.stringify(entry))
        .join("\n")}\n`,
    );
    await writeFile(join(logged.worktree.path, "partial.txt"), "Before EOF");
    if (scenario === "missing-worktree") {
      // Keep the stage current in the checkout too, so the fallback specifically diagnoses the missing worktree.
      await writeFile(
        join(root, ".scratch/first/workflow.yaml"),
        "workflow: feature\nstage: review\n",
      );
      await rm(logged.worktree.path, { recursive: true });
    }
    const before = await readFile(logged.path, "utf8");
    const rows = [
      { pid: process.pid, group: process.pid, uid, identity: `${uid}:server`, command: "server" },
      ...(scenario === "detached-writer"
        ? [
            {
              pid: 21,
              parent: 1,
              group: 21,
              uid,
              identity: `${uid}:tool`,
              command: "detached tool",
            },
          ]
        : []),
    ];
    const read = vi.spyOn(systemProcesses, "read").mockImplementation(() => rows);
    const exists = vi
      .spyOn(systemProcesses, "exists")
      .mockImplementation((pid) => rows.some((row) => row.pid === pid));
    const directories = vi.spyOn(systemProcesses, "workingDirectories").mockReturnValue(
      new Map([
        [process.pid, "/outside"],
        [21, join(logged.worktree.path, "subdirectory")],
      ]),
    );
    const checkpoint = vi.spyOn(git, "createCheckpoint");
    const signal = vi.spyOn(systemProcesses, "signal").mockImplementation(() => {
      throw new Error("No process in this fixture is owned by the vanished adapter");
    });
    registered.verifyRecovery = vi.fn(async () => {
      expect(await readFile(logged.path, "utf8")).toContain('"state":"suspended"');
      if (scenario === "fallback") throw new Error("Controlled warm verification failure");
      return selected;
    });
    let complete: () => void = () => {};
    registered.launch = vi.fn((options) => {
      expect(options.resume?.sessionId).toBe("fake-session");
      options.onProcess?.({
        id: "replacement",
        pid: 30,
        marker: "stintwork-replacement",
        identity: `${uid}:replacement`,
        processGroup: true,
        owner: { pid: process.pid, identity: `${uid}:server`, startedAt: "2026-10-26T12:00:00Z" },
      });
      options.onSession?.("fake-session");
      return {
        ready: Promise.resolve(),
        done: new Promise<AgentStintResult>((resolve) => {
          complete = () => {
            options.onCleanup?.("replacement");
            resolve({
              stopReason: "end_turn",
              handoff: { stoppedAt: "Recovered work.", unresolved: "None", nextStep: "Review." },
            });
          };
        }),
        cancel: async () => {},
      };
    });
    const server = project({
      agentRegistry: createAgentRegistry([registered]),
      recoveryProcessScan: { wait: async () => {} },
    });
    try {
      await server.app.request("/api/health");
      if (scenario === "detached-writer") {
        await expect
          .poll(async () => {
            const snapshot: ProjectSnapshot = await (
              await server.app.request("/api/project")
            ).json();
            return snapshot.warnings.map((warning) => warning.message).join("\n");
          })
          .toContain("PID 21 (detached tool)");
        expect(await readFile(logged.path, "utf8")).toBe(before);
        expect(registered.verifyRecovery).not.toHaveBeenCalled();
        expect(registered.launch).not.toHaveBeenCalled();
        expect(
          (await server.app.request("/api/work-items/first/checks", { method: "POST" })).status,
        ).toBe(409);
      } else if (scenario === "missing-worktree") {
        const ended = await waitForEnding(root);
        expect(ended).toMatchObject({ status: "interrupted", checkpointCommit: null });
        expect(ended.error).toMatch(/Checkpoint failed.*ENOENT/);
        expect(checkpoint).not.toHaveBeenCalled();
        expect(registered.verifyRecovery).not.toHaveBeenCalled();
        expect(registered.launch).not.toHaveBeenCalled();
        const after = await readFile(logged.path, "utf8");
        expect(after.startsWith(before)).toBe(true);
        expect(after.split("\n").filter((line) => line.includes('"type":"ended"'))).toHaveLength(1);
        const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
        expect(snapshot.workItems[0].activeStint).toBeNull();
      } else {
        if (scenario === "resume") {
          await expect
            .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].recovery?.state)
            .toBe("resumed");
          complete();
        }
        const ended = await waitForEnding(root);
        expect(ended, JSON.stringify(ended.recovery)).toMatchObject({
          id: "saved-phase",
          status: scenario === "resume" ? "finished" : "interrupted",
          checkpointCommit: expect.any(String),
        });
        expect(
          execFileSync("git", ["show", `${ended.checkpointCommit}:partial.txt`], {
            cwd: root,
            encoding: "utf8",
          }),
        ).toBe("Before EOF");
        const after = await readFile(logged.path, "utf8");
        expect(after.startsWith(before)).toBe(true);
        expect(after.split("\n").filter((line) => line.includes('"type":"ended"'))).toHaveLength(1);
        expect(registered.launch).toHaveBeenCalledTimes(scenario === "resume" ? 1 : 0);
      }
      expect(directories).toHaveBeenCalledTimes(scenario === "detached-writer" ? 4 : 1);
      expect(signal).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      exists.mockRestore();
      directories.mockRestore();
      signal.mockRestore();
      checkpoint.mockRestore();
      await server.stop();
    }
  },
);

test("the crash fixture adapter really exits when its server closes stdin mid-work", async () => {
  const { tracked, selected, env, cache } = await warmRecovery("claude", "installed");
  const child = spawn(process.execPath, [selected.adapterEntry], {
    cwd: cache.options.cwd,
    env: { ...env, TEST_RECOVERY: "crash", TEST_EXIT_ON_EOF: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  tracked.children.push(child);
  let output = "";
  const working = new Promise<void>((resolve) => {
    child.stdout.on("data", (bytes) => {
      output += String(bytes);
      if (output.includes("Before crash")) resolve();
    });
  });
  child.stdin.write(
    `${[
      { method: "initialize", params: { protocolVersion: 1 } },
      { method: "session/new", params: { cwd: cache.options.cwd, mcpServers: [] } },
      {
        method: "session/prompt",
        params: { sessionId: "fake-session", prompt: [{ type: "text", text: "Work" }] },
      },
    ]
      .map((request, id) => JSON.stringify({ jsonrpc: "2.0", id, ...request }))
      .join("\n")}\n`,
  );
  await working;
  const exited = once(child, "exit");
  child.stdin.end(); // The only exit trigger: no native inspection, timer or signal kills this adapter.
  expect(await exited).toEqual([0, null]);
});

test.each(["grok", "grok-writer", "pre-patch", "legacy-no-attempt"] as const)(
  "compatible native crash cleanup reaches fallback or names a live writer: %s",
  async (kind) => {
    const { root, project } = await fixture();
    const logged = await log(root, "compatible-native", "2026-10-26T11:08:55.000Z");
    const started = JSON.parse(logged.text) as Extract<StintLogEntry, { type: "started" }>;
    started.stint.agent = kind.startsWith("grok") ? "grok" : "codex";
    const attempt: StintProcessAttempt = {
      id: "old-attempt",
      pid: 20,
      owner: { pid: 10, startedAt: "2026-10-26T11:00:00.000Z" },
      marker: kind === "pre-patch" ? "stintwork-old-attempt" : null,
    };
    const entries: StintLogEntry[] = [started];
    if (kind !== "legacy-no-attempt")
      entries.push({ type: "recovery", version: 1, at: started.at, kind: "attempt", attempt });
    const before = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
    await writeFile(logged.path, before);
    await writeFile(join(logged.worktree.path, "partial.txt"), "Unfinished native work");
    const uid = process.getuid?.() as number;
    const rows = [
      { pid: process.pid, group: process.pid, uid, identity: `${uid}:server`, command: "server" },
      ...(kind === "grok-writer"
        ? [{ pid: 21, group: 21, uid, identity: `${uid}:tool`, command: "live tool" }]
        : []),
    ];
    const read = vi.spyOn(systemProcesses, "read").mockImplementation(() => rows);
    const exists = vi
      .spyOn(systemProcesses, "exists")
      .mockImplementation((pid) => rows.some((row) => row.pid === pid));
    const directories = vi
      .spyOn(systemProcesses, "workingDirectories")
      .mockReturnValue(new Map([[21, logged.worktree.path]]));
    const signal = vi.spyOn(systemProcesses, "signal").mockImplementation(() => {
      throw new Error("Unverified native attempts must never authorize a signal");
    });
    const checkpoint = vi.spyOn(git, "createCheckpoint");
    const launch = vi.fn(() => {
      throw new Error("Grok/legacy recovery must use fallback");
    });
    const server = project({
      recoveryProcessScan: { wait: async () => {} },
      agentRegistry: createAgentRegistry([
        { ...fakeAgentProfiles.grok, launch },
        { ...fakeAgentProfiles.codex, launch },
      ]),
    });
    try {
      await server.app.request("/api/health");
      if (kind === "grok-writer") {
        await expect
          .poll(
            async () => {
              const snapshot: ProjectSnapshot = await (
                await server.app.request("/api/project")
              ).json();
              return snapshot.warnings.map((warning) => warning.message).join("\n");
            },
            { message: "Grok crash must name the surviving native writer" },
          )
          .toContain("PID 21 (live tool)");
        expect(await readFile(logged.path, "utf8")).toBe(before);
        expect(checkpoint).not.toHaveBeenCalled();
        expect(
          (await server.app.request("/api/work-items/first/checks", { method: "POST" })).status,
        ).toBe(409);
      } else {
        const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
        expect(snapshot.warnings.map((warning) => warning.message).join("\n")).not.toContain(
          "Cannot recover stint",
        );
        const ended = await waitForEnding(root);
        expect(ended).toMatchObject({
          id: "compatible-native",
          status: "interrupted",
          checkpointCommit: expect.any(String),
          handoff: null,
        });
        expect(ended.error).toContain(
          kind === "grok" ? "Grok Build is experimental" : "Missing recovery metadata",
        );
        expect(
          execFileSync("git", ["show", `${ended.checkpointCommit}:partial.txt`], {
            cwd: root,
            encoding: "utf8",
          }),
        ).toBe("Unfinished native work");
        const after = await readFile(logged.path, "utf8");
        expect(after.startsWith(before)).toBe(true);
        expect(after.split("\n").filter((line) => line.includes('"type":"ended"'))).toHaveLength(1);
        expect(checkpoint).toHaveBeenCalledOnce();
        if (kind !== "legacy-no-attempt") expect(after).toContain('"state":"suspended"');
        const finished: ProjectSnapshot = await (await server.app.request("/api/project")).json();
        expect(finished.workItems[0].activeStint).toBeNull();
      }
      expect(directories).toHaveBeenCalledTimes(
        kind === "legacy-no-attempt" ? 0 : kind === "grok-writer" ? 4 : 1,
      );
      expect(signal).not.toHaveBeenCalled();
      expect(launch).not.toHaveBeenCalled();
    } finally {
      await server.stop();
      checkpoint.mockRestore();
      signal.mockRestore();
      directories.mockRestore();
      exists.mockRestore();
      read.mockRestore();
    }
  },
);

test.each(["work", "finalization"] as const)(
  "a pre-patch session with incomplete ownership finalizes %s after inspection without loading work",
  async (phase) => {
    const { root, project, registered, logged, entries } = await savedRecovery(phase);
    const entry = entries.find((entry) => entry.type === "recovery" && entry.kind === "attempt");
    if (entry?.type !== "recovery" || entry.kind !== "attempt") throw new Error("Expected attempt");
    entry.attempt.pid = 20;
    entry.attempt.owner.pid = 10;
    delete entry.attempt.identity;
    delete entry.attempt.processGroup;
    delete entry.attempt.owner.identity;
    const before = `${entries
      .filter((entry) => !(entry.type === "recovery" && entry.kind === "resume"))
      .map((entry) => JSON.stringify(entry))
      .join("\n")}\n`;
    await writeFile(logged.path, before);
    await writeFile(join(logged.worktree.path, "partial.txt"), "Before ownership metadata");
    registered.verifyRecovery = vi.fn(async () => {
      throw new Error("Must not verify/load a legacy attempt");
    });
    registered.launch = vi.fn(() => {
      throw new Error("Must not relaunch a legacy attempt");
    });
    const uid = process.getuid?.() as number;
    const read = vi
      .spyOn(systemProcesses, "read")
      .mockReturnValue([
        { pid: process.pid, group: process.pid, uid, identity: `${uid}:server`, command: "server" },
      ]);
    const exists = vi
      .spyOn(systemProcesses, "exists")
      .mockImplementation((pid) => pid === process.pid);
    const cwd = vi.spyOn(systemProcesses, "workingDirectories").mockReturnValue(new Map());
    const signal = vi.spyOn(systemProcesses, "signal").mockImplementation(() => {
      throw new Error("No signal is owned");
    });
    const server = project({ agentRegistry: createAgentRegistry([registered]) });
    try {
      await server.app.request("/api/health");
      const ended = await waitForEnding(root);
      expect(ended).toMatchObject({
        status: phase === "work" ? "interrupted" : "finished",
        checkpointCommit: expect.any(String),
      });
      if (phase === "work") expect(ended.error).toMatch(/ownership metadata/);
      expect(registered.verifyRecovery).not.toHaveBeenCalled();
      expect(registered.launch).not.toHaveBeenCalled();
      const after = await readFile(logged.path, "utf8");
      expect(after.startsWith(before)).toBe(true);
      expect(after).toContain('"state":"suspended"');
      expect(
        execFileSync("git", ["show", `${ended.checkpointCommit}:partial.txt`], {
          cwd: root,
          encoding: "utf8",
        }),
      ).toBe("Before ownership metadata");
      expect(cwd).toHaveBeenCalledOnce();
      expect(signal).not.toHaveBeenCalled();
      if (phase === "work") {
        // Replay a crash immediately after durable cleanup, before fallback finalization.
        const lines = after.trim().split("\n");
        const proof = lines.findIndex((line) => line.includes('"state":"suspended"'));
        await server.stop();
        await writeFile(logged.path, `${lines.slice(0, proof + 1).join("\n")}\n`);
        const restarted = project({ agentRegistry: createAgentRegistry([registered]) });
        await restarted.app.request("/api/health");
        const recovered = await waitForEnding(root);
        expect(recovered).toMatchObject({
          status: "interrupted",
          checkpointCommit: expect.any(String),
        });
        expect(recovered.error).toMatch(/ownership metadata/);
        expect(registered.verifyRecovery).not.toHaveBeenCalled();
        expect(registered.launch).not.toHaveBeenCalled();
        expect(cwd).toHaveBeenCalledOnce();
        await restarted.stop();
      }
    } finally {
      await server.stop();
      signal.mockRestore();
      cwd.mockRestore();
      exists.mockRestore();
      read.mockRestore();
    }
  },
);

test.each([false, true])(
  "orphan scan retries stay in the background while transient cwd inspection settles (permission: %s)",
  async (permission) => {
    const { root, project } = await fixture();
    const logged = await log(root, "retry-native", "2026-10-26T11:08:55Z");
    const started = JSON.parse(logged.text) as Extract<StintLogEntry, { type: "started" }>;
    started.stint.agent = "grok";
    const attempt: StintProcessAttempt = {
      id: "native",
      pid: 20,
      marker: null,
      owner: { pid: 10, startedAt: "2026-10-26T11:00:00Z" },
    };
    const savedPermission = {
      type: "event",
      at: started.at,
      event: {
        type: "permission_request",
        requestId: "saved-before-scan",
        attemptId: "native",
        binding: "live",
        toolCallId: "tool",
        title: "Manual tool",
        kind: "execute",
        automatic: false,
        details: "Saved details",
        options: [{ optionId: "yes", name: "Yes", kind: "allow_once" }],
      },
    };
    const before = `${JSON.stringify(started)}\n${JSON.stringify({ type: "recovery", version: 1, at: started.at, kind: "attempt", attempt })}\n${permission ? `${JSON.stringify(savedPermission)}\n` : ""}`;
    await writeFile(logged.path, before);
    await writeFile(join(logged.worktree.path, "partial.txt"), "Native partial work");
    const uid = process.getuid?.() as number;
    let transient = true;
    let now = 0;
    let release = () => {};
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const wait = vi.fn(async (milliseconds: number) => {
      await waiting;
      now += milliseconds;
      transient = false;
    });
    const read = vi.spyOn(systemProcesses, "read").mockImplementation(() => [
      { pid: process.pid, group: process.pid, uid, identity: `${uid}:server`, command: "server" },
      ...(transient
        ? [
            {
              pid: 21,
              group: 21,
              uid,
              identity: `${uid}:transient`,
              command: "unrelated transient job",
            },
          ]
        : []),
    ]);
    const exists = vi
      .spyOn(systemProcesses, "exists")
      .mockImplementation((pid) => pid === process.pid || (pid === 21 && transient));
    const cwd = vi.spyOn(systemProcesses, "workingDirectories").mockReturnValue(new Map());
    const signal = vi.spyOn(systemProcesses, "signal").mockImplementation(() => {
      throw new Error("No signal is verified");
    });
    const server = project({ recoveryProcessScan: { now: () => now, wait } });
    try {
      const starting = server.start();
      void starting.catch(() => {});
      expect((await server.app.request("/api/health")).status).toBe(200);
      expect(wait).toHaveBeenCalledOnce();
      await crashStep("server ready while orphan re-inspection waits", () => starting);
      const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
      expect(snapshot.workItems[0].activeStint?.id).toBe("retry-native");
      expect(snapshot.warnings.map((warning) => warning.message).join("\n")).not.toContain(
        "Cannot recover stint",
      );
      expect(
        (await server.app.request("/api/work-items/first/checks", { method: "POST" })).status,
      ).toBe(409);
      if (permission) {
        expect(snapshot.attentionItems).toContainEqual(
          expect.objectContaining({
            kind: "permission",
            requestId: "saved-before-scan",
            binding: "reconnecting",
          }),
        );
        expect((await readFile(logged.path, "utf8")).startsWith(before)).toBe(true);
      } else expect(await readFile(logged.path, "utf8")).toBe(before);
      release();
      expect(await waitForEnding(root)).toMatchObject({
        status: "interrupted",
        checkpointCommit: expect.any(String),
      });
      expect(cwd).toHaveBeenCalledTimes(2);
      expect(signal).not.toHaveBeenCalled();
    } finally {
      release();
      await server.stop();
      signal.mockRestore();
      cwd.mockRestore();
      exists.mockRestore();
      read.mockRestore();
    }
  },
);

function permissionSignal<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test.each(
  [true, false].flatMap((matching) =>
    ["allow-once", "reject"].map((optionId) => ({ matching, optionId })),
  ),
)(
  "real-shaped continuation reissue is HTTP-answerable ($optionId, matching: $matching)",
  async ({ matching, optionId }) => {
    const { root, project, registered, selected, logged, entries } = await savedRecovery("work");
    // Shape copied from the coordinator's installed Claude 2.1.295 evidence; no provider calls.
    const command = "git log --stat -6 --format='--- %h %s%n%b' && git status --short && ls -la";
    const description = "Show recent commits with files and working tree";
    const tool = {
      toolCallId: "toolu_01E3ytkqXqGDuEA7aHV7FiQP",
      kind: "execute" as const,
      status: "pending" as const,
      title: command,
      name: "Bash",
      content: [
        { content: { text: description, type: "text" as const }, type: "content" as const },
      ],
      rawInput: { command, description },
    };
    const options = [
      { optionId: "allow-once", name: "Yes", kind: "allow_once" as const },
      {
        optionId: "allow-with-updates",
        name: "Yes, and don't ask again for git log * commands",
        kind: "allow_always" as const,
      },
      { optionId: "reject", name: "No", kind: "reject_once" as const },
    ];
    const raisedAt = "2026-10-26T23:22:16.126Z";
    entries.push({
      type: "event",
      at: raisedAt,
      event: {
        type: "permission_request",
        requestId: "old-request",
        attemptId: "old-attempt",
        binding: "live",
        toolCallId: tool.toolCallId,
        title: command,
        kind: "execute",
        automatic: false,
        details: JSON.stringify(tool),
        options,
      },
    });
    await writeFile(logged.path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    const input = new PassThrough();
    const child = Object.assign(new EventEmitter(), {
      stdin: input,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      pid: 20,
      exitCode: null,
      signalCode: null,
      kill() {
        queueMicrotask(() => child.emit("exit", 0, "SIGTERM"));
        return true;
      },
      unref() {},
    });
    const published = permissionSignal();
    const received = permissionSignal<RequestPermissionResponse>();
    const finish = permissionSignal();
    const effects: string[] = [];
    new AgentSideConnection(
      (client) => ({
        async initialize() {
          return {
            protocolVersion: PROTOCOL_VERSION,
            agentCapabilities: {
              loadSession: true,
              sessionCapabilities: { additionalDirectories: {} },
            },
          };
        },
        async newSession() {
          throw new Error("Must restore the existing session");
        },
        async authenticate() {
          throw new Error("Must use the developer's existing login");
        },
        async loadSession({ sessionId }) {
          expect(sessionId).toBe("fake-session");
          return {
            modes: {
              currentModeId: "read-only",
              availableModes: [{ id: "read-only", name: "Ask" }],
            },
          };
        },
        async setSessionMode() {
          return {};
        },
        async prompt({ prompt }) {
          expect(prompt).toEqual([{ type: "text", text: continuationInstruction }]);
          const answer = await client.requestPermission({
            sessionId: "fake-session",
            toolCall: {
              ...tool,
              toolCallId: "toolu_01EyJv6wRio7EAEaWvFV1ACE",
              ...(!matching
                ? { rawInput: { ...tool.rawInput, command: "changed operation" } }
                : {}),
            },
            options,
          });
          if (answer.outcome.outcome === "selected" && answer.outcome.optionId === "allow-once")
            effects.push("execute");
          received.resolve(answer);
          await finish.promise;
          return { stopReason: "end_turn" as const };
        },
        async cancel() {
          finish.resolve();
        },
      }),
      ndJsonStream(Writable.toWeb(child.stdout), toAcpReadable(input)),
    );
    const launch = createAgentLauncher(
      () => child as unknown as ChildProcessWithoutNullStreams,
      fakeAgentProfiles.codex,
    );
    registered.verifyRecovery = async () => selected;
    registered.launch = (options) => {
      let attemptId = "";
      const running = launch({
        ...options,
        preparedAgent: undefined,
        afterTurnRequests: [],
        onProcess(attempt) {
          attemptId = attempt.id;
          options.onProcess?.(attempt);
        },
        onEvent(event) {
          options.onEvent(event);
          if (event.type === "permission_request") published.resolve();
        },
      });
      // This in-memory process has no native writers; explicitly certify its fake cleanup.
      return {
        ...running,
        done: running.done.then((result) => {
          options.onCleanup?.(attemptId);
          return result;
        }),
      };
    };
    const server = project({ agentRegistry: createAgentRegistry([registered]) });
    try {
      await server.app.request("/api/health");
      await permissionStep(
        root,
        server,
        "continuation permission published",
        () => published.promise,
      );
      const restartEntries = (await readFile(logged.path, "utf8"))
        .trim()
        .split("\n")
        .slice(entries.length)
        .map((line) => JSON.parse(line));
      expect(
        restartEntries.filter(
          (entry) =>
            entry.type === "recovery" && entry.kind === "resume" && entry.state === "resuming",
        ),
      ).toHaveLength(1);
      const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
      const items = snapshot.attentionItems.filter((item) => item.kind === "permission");
      const live = items.find((item) => item.binding === "live");
      expect(live).toBeDefined();
      if (!live) throw new Error("Expected live permission");
      expect(items).toHaveLength(1);
      if (matching)
        expect(live).toMatchObject({ raisedAt, id: 'permission:["saved-phase","old-request"]' });
      const observer = project({ agentRegistry: createAgentRegistry([registered]) });
      const observerSnapshot: ProjectSnapshot = await (
        await observer.app.request("/api/project")
      ).json();
      expect(
        observerSnapshot.attentionItems.find(
          (item) => item.kind === "permission" && item.requestId === live.requestId,
        ),
      ).toMatchObject({ binding: "reconnecting" });
      expect(
        observerSnapshot.workItems[0].activeStint?.events.find(
          (event) => event.type === "permission_request" && event.requestId === live.requestId,
        ),
      ).toMatchObject({ binding: "reconnecting" });
      const observerHistory: { stint: Stint } = await (
        await observer.app.request("/api/stints/saved-phase")
      ).json();
      expect(
        observerHistory.stint.events.find(
          (event) => event.type === "permission_request" && event.requestId === live.requestId,
        ),
      ).toMatchObject({ binding: "reconnecting" });
      const post = (
        target: typeof server,
        requestId: string,
        body: unknown,
        origin = "http://localhost",
      ) =>
        target.app.request(`/api/stints/saved-phase/permissions/${requestId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", origin },
          body: JSON.stringify(body),
        });
      const body = { optionId, attemptId: live.attemptId };
      const beforeRefusals = await readFile(logged.path, "utf8");
      expect((await post(observer, live.requestId, body)).status).toBe(409);
      expect((await post(server, live.requestId, { optionId })).status).toBe(400);
      expect(
        (await post(server, live.requestId, { optionId, attemptId: "old-attempt" })).status,
      ).toBe(409);
      expect(
        (await post(server, "old-request", { optionId, attemptId: "old-attempt" })).status,
      ).toBe(409);
      expect((await post(server, live.requestId, body, "http://foreign.invalid")).status).toBe(403);
      expect((await post(server, live.requestId, { ...body, optionId: "invalid" })).status).toBe(
        400,
      );
      expect(await readFile(logged.path, "utf8")).toBe(beforeRefusals);
      expect(effects).toEqual([]);
      const answer = await permissionStep(
        root,
        server,
        "HTTP delivers current continuation permission",
        () => post(server, live.requestId, body),
      );
      expect(await answer.json()).toMatchObject({ requestId: live.requestId, optionId });
      expect(answer.status).toBe(200);
      expect(
        await permissionStep(
          root,
          server,
          "fake ACP receives selected response",
          () => received.promise,
        ),
      ).toEqual({ outcome: { outcome: "selected", optionId } });
      expect(effects).toEqual(optionId === "allow-once" ? ["execute"] : []);
      expect((await post(server, live.requestId, body)).status).toBe(409);
      expect(indexStints(createNodeRepoFiles(root)).stints[0].recovery?.state).toBe("resumed");
      finish.resolve();
      const ended = await permissionStep(
        root,
        server,
        "continuation ends after current answer",
        () => waitForEnding(root),
      );
      expect(ended.events.filter((event) => event.type === "permission")).toEqual([
        expect.objectContaining({
          requestId: live.requestId,
          attemptId: live.attemptId,
          decision: {
            outcome: "selected",
            optionId,
            kind: optionId === "reject" ? "reject_once" : "allow_once",
          },
        }),
      ]);
      expect(
        ended.events.filter(
          (event) => event.type === "permission_delivery" && event.outcome === "written",
        ),
      ).toEqual([
        {
          type: "permission_delivery",
          requestId: live.requestId,
          attemptId: live.attemptId,
          outcome: "written",
        },
      ]);
    } finally {
      finish.resolve();
    }
  },
);

async function permissionStep<T>(
  root: string,
  server: ReturnType<typeof createProjectServer>,
  name: string,
  work: () => T | Promise<T>,
) {
  try {
    return await crashStep(name, work);
  } catch (error) {
    const snapshot = await Promise.resolve(server.app.request("/api/project"))
      .then((response) => response.json())
      .catch(String);
    const stint = indexStints(createNodeRepoFiles(root)).stints[0];
    const tail = await readFile(join(root, ".stintwork/local/stints", `${stint?.id}.jsonl`), "utf8")
      .then((text) => text.trim().split("\n").slice(-12).join("\n"))
      .catch(String);
    throw new Error(
      `${String(error)}\nWarnings: ${JSON.stringify(snapshot.warnings)}\nStint log tail:\n${tail}`,
      { cause: error },
    );
  }
}

test.each(
  ["allow", "reject"].flatMap((optionId) =>
    [false, true].map((ambiguous) => ({ optionId, ambiguous })),
  ),
)(
  "restored permission keeps age, waits during load and writes fresh $optionId once (ambiguous: $ambiguous)",
  async ({ optionId, ambiguous }) => {
    const { root, project, registered, selected, logged, entries } = await savedRecovery("work");
    const saved = {
      type: "permission_request" as const,
      requestId: "old-request",
      attemptId: "old-attempt",
      binding: "live" as const,
      toolCallId: "old-attempt:tool",
      title: "Manual edit",
      kind: "edit",
      automatic: false,
      details: '{"toolCallId":"tool","title":"Manual edit"}',
      options: [
        { optionId: "allow", name: "Allow", kind: "allow_once" },
        { optionId: "reject", name: "Reject", kind: "reject_once" },
      ],
    };
    entries.push({ type: "event", at: "2026-01-01T00:01:00Z", event: saved });
    if (ambiguous)
      entries.push({
        type: "event",
        at: "2026-01-01T00:02:00Z",
        event: {
          type: "permission",
          requestId: saved.requestId,
          attemptId: saved.attemptId,
          toolCallId: saved.toolCallId,
          title: saved.title,
          kind: saved.kind,
          automatic: false,
          decision: { outcome: "selected", optionId: "allow", kind: "allow_once" },
        },
      });
    await writeFile(logged.path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    const verify = permissionSignal<typeof selected>();
    const verifying = permissionSignal();
    registered.verifyRecovery = async () => {
      verifying.resolve();
      return verify.promise;
    };
    const published = permissionSignal();
    const selectedAnswer = permissionSignal();
    const write = permissionSignal();
    const ready = permissionSignal();
    const finish = permissionSignal<AgentStintResult>();
    registered.launch = (options) => {
      expect(options.resume?.permissions).toEqual([
        expect.objectContaining({ requestId: "old-request" }),
      ]);
      options.onProcess?.({
        id: "new-attempt",
        owner: { pid: process.pid, startedAt: "2026-01-02T00:00:00Z" },
        pid: process.pid,
        marker: null,
      });
      const forwarded = write.promise.then(() => {
        options.onEvent({
          type: "permission_delivery",
          requestId: "new-request",
          attemptId: "new-attempt",
          outcome: "written",
        });
      });
      void options
        .onPermission?.({
          sessionId: "fake-session",
          requestId: "new-request",
          attemptId: "new-attempt",
          forwarded,
          toolCall: { toolCallId: "tool" },
          options: saved.options as Parameters<
            NonNullable<typeof options.onPermission>
          >[0]["options"],
        })
        .then((answer) => {
          expect(answer).toMatchObject({ outcome: { outcome: "selected", optionId } });
          options.onEvent({
            type: "permission",
            requestId: "new-request",
            attemptId: "new-attempt",
            toolCallId: "new-attempt:tool",
            title: saved.title,
            kind: "edit",
            automatic: false,
            decision: {
              outcome: "selected",
              optionId,
              kind: optionId === "allow" ? "allow_once" : "reject_once",
            },
          });
          selectedAnswer.resolve();
        });
      options.onEvent({
        ...saved,
        requestId: "new-request",
        attemptId: "new-attempt",
        logicalRequestId: "old-request",
        raisedAt: "2026-01-01T00:01:00Z",
      });
      published.resolve();
      return {
        ready: ready.promise,
        done: finish.promise,
        cancel: async () => {
          finish.resolve({ stopReason: "cancelled" });
        },
      };
    };
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    try {
      const server = project({ agentRegistry: createAgentRegistry([registered]) });
      await server.app.request("/api/health");
      await permissionStep(root, server, "warm verification entered", () => verifying.promise);
      const snapshot = async (): Promise<ProjectSnapshot> =>
        (await server.app.request("/api/project")).json();
      expect(
        (await snapshot()).attentionItems.filter((item) => item.kind === "permission"),
      ).toEqual([
        expect.objectContaining({
          requestId: "old-request",
          binding: "reconnecting",
          raisedAt: "2026-01-01T00:01:00Z",
          details: saved.details,
          options: saved.options,
        }),
      ]);
      verify.resolve(selected);
      await permissionStep(root, server, "live load permission published", () => published.promise);
      expect(
        (await snapshot()).attentionItems.filter((item) => item.kind === "permission"),
      ).toEqual([
        expect.objectContaining({
          requestId: "new-request",
          binding: "live",
          attemptId: "new-attempt",
        }),
      ]);
      await vi.advanceTimersByTimeAsync(120_001);
      expect(indexStints(createNodeRepoFiles(root)).stints[0]).toMatchObject({
        status: "running",
        recovery: { state: "resuming" },
      });
      const post = (requestId: string, attemptId: string) =>
        server.app.request(`/api/stints/saved-phase/permissions/${requestId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId, attemptId }),
        });
      expect((await post("old-request", "old-attempt")).status).toBe(409);
      const answer = post("new-request", "new-attempt");
      await permissionStep(root, server, "fresh decision selected", () => selectedAnswer.promise);
      expect(
        (await snapshot()).attentionItems.filter((item) => item.kind === "permission"),
      ).toHaveLength(1);
      expect((await post("new-request", "new-attempt")).status).toBe(409);
      write.resolve();
      expect(
        (await permissionStep(root, server, "current receipt written", () => answer)).status,
      ).toBe(200);
      expect(
        (await snapshot()).attentionItems.filter((item) => item.kind === "permission"),
      ).toEqual([]);
      ready.resolve();
      finish.resolve({ stopReason: "end_turn" });
      expect(
        (await permissionStep(root, server, "checkpoint and ending", () => waitForEnding(root)))
          .events,
      ).toContainEqual(
        expect.objectContaining({ type: "permission_delivery", outcome: "written" }),
      );
    } finally {
      vi.useRealTimers();
    }
  },
);

test.each(["completion", "failure"] as const)(
  "terminal %s before permission reconciliation releases preparation and shutdown during fallback checkpointing",
  async (terminal) => {
    const { root, project, registered, selected, logged, entries } = await savedRecovery("work");
    entries.push({
      type: "event",
      at: "2026-01-01T00:01:00Z",
      event: {
        type: "permission_request",
        requestId: "saved",
        attemptId: "old-attempt",
        toolCallId: "tool",
        title: "Manual request",
        kind: "execute",
        automatic: false,
        options: [{ optionId: "allow", kind: "allow_once", name: "Allow" }],
      },
    });
    await writeFile(logged.path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    registered.verifyRecovery = async () => selected;
    const launched = permissionSignal();
    const finish = permissionSignal();
    const shutdownCaptured = permissionSignal();
    registered.launch = () => {
      launched.resolve();
      return {
        ready: Promise.resolve(),
        done: finish.promise.then(() => {
          if (terminal === "failure") throw new Error("Controlled continuation failure");
          return { stopReason: "end_turn" };
        }),
        cancel: async () => {
          shutdownCaptured.resolve();
        },
      };
    };
    const checkpointing = permissionSignal();
    const releaseCheckpoint = permissionSignal();
    const realCheckpoint = git.createCheckpoint;
    const checkpoint = vi.spyOn(git, "createCheckpoint").mockImplementationOnce(async (...args) => {
      checkpointing.resolve();
      await releaseCheckpoint.promise;
      return realCheckpoint(...args);
    });
    const server = project({ agentRegistry: createAgentRegistry([registered]) });
    let shutdown: Promise<void> | undefined;
    let shutdownFinished = false;
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await server.app.request("/api/health");
      await permissionStep(
        root,
        server,
        "ready replacement awaiting saved callback",
        () => launched.promise,
      );
      finish.resolve();
      await permissionStep(
        root,
        server,
        "terminal recovery enters fallback checkpoint",
        () => checkpointing.promise,
      );
      shutdown = server.stop().then(() => {
        shutdownFinished = true;
      });
      await permissionStep(
        root,
        server,
        "shutdown captures ending state",
        () => shutdownCaptured.promise,
      );
      releaseCheckpoint.resolve();
      vi.useRealTimers();
      await permissionStep(root, server, "fallback interrupted ending recorded", () =>
        waitForEnding(root),
      );
      await permissionStep(
        root,
        server,
        "shutdown releases terminal preparation without reconciliation",
        () => shutdown,
      );
      const log = (await readFile(logged.path, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(log.filter((entry) => entry.type === "ended")).toEqual([
        expect.objectContaining({ status: "interrupted", checkpointCommit: expect.any(String) }),
      ]);
      expect(
        log
          .slice(entries.length)
          .filter((entry) => entry.kind === "resume" && entry.state === "resumed"),
      ).toEqual([]);
    } finally {
      finish.resolve();
      releaseCheckpoint.resolve();
      vi.useRealTimers();
      // No listener or real writer was started. A regression leaves an irrecoverable
      // preparation promise; do not hide its named failure by hanging fixture teardown too.
      if (shutdown && !shutdownFinished) server.stop = async () => {};
      else await server.stop();
      checkpoint.mockRestore();
    }
  },
);

test.each(["timeout", "turn", "stop", "shutdown"] as const)(
  "saved callback reconciliation: %s retires attention without replaying consent",
  async (outcome) => {
    const { root, project, registered, selected, logged, entries } = await savedRecovery("work");
    const request = {
      type: "permission_request" as const,
      requestId: "saved",
      attemptId: "old-attempt",
      binding: "live" as const,
      toolCallId: "tool",
      title: "Manual request",
      kind: "execute",
      automatic: false,
      details: "Full saved tool details",
      options: [{ optionId: "allow", kind: "allow_once", name: "Allow" }],
    };
    entries.push({ type: "event", at: "2026-01-01T00:01:00Z", event: request });
    // The selected record is deliberately ambiguous: there is no written receipt.
    entries.push({
      type: "event",
      at: "2026-01-01T00:02:00Z",
      event: {
        type: "permission",
        requestId: "saved",
        attemptId: "old-attempt",
        toolCallId: "tool",
        title: request.title,
        kind: request.kind,
        automatic: false,
        decision: { outcome: "selected", optionId: "allow", kind: "allow_once" },
      },
    });
    await writeFile(logged.path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    registered.verifyRecovery = async () => selected;
    const entered = permissionSignal();
    const done = permissionSignal<AgentStintResult>();
    let retire!: () => void;
    registered.launch = (options) => {
      options.onProcess?.({
        id: "new",
        owner: { pid: process.pid, startedAt: "2026-01-02T00:00:00Z" },
        pid: process.pid,
        marker: null,
      });
      retire = () =>
        options.onEvent({
          type: "permission_delivery",
          requestId: "saved",
          attemptId: "old-attempt",
          outcome: "retired",
        });
      entered.resolve();
      return {
        ready: Promise.resolve(),
        done: done.promise,
        cancel: async () => {
          done.resolve({ stopReason: "cancelled" });
        },
        suspend: async () => {
          options.onCleanup?.("new");
          done.resolve({ stopReason: "cancelled" });
        },
      };
    };
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    try {
      const server = project({
        agentRegistry: createAgentRegistry([registered]),
        recoverySetupTimeoutMs: 60_000,
      });
      await server.app.request("/api/health");
      await permissionStep(
        root,
        server,
        "replacement launched for reconciliation",
        () => entered.promise,
      );
      const queue = async () =>
        (
          (await (await server.app.request("/api/project")).json()) as ProjectSnapshot
        ).attentionItems.filter((item) => item.kind === "permission");
      expect(await queue()).toEqual([
        expect.objectContaining({ requestId: "saved", binding: "reconnecting" }),
      ]);
      expect(
        (
          await server.app.request("/api/stints/saved-phase/permissions/saved", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"optionId":"allow","attemptId":"old-attempt"}',
          })
        ).status,
      ).toBe(409);
      if (outcome === "timeout") await vi.advanceTimersByTimeAsync(60_001);
      if (outcome === "turn") {
        retire();
        await vi.advanceTimersByTimeAsync(0);
        expect(await queue()).toEqual([]);
        await vi.advanceTimersByTimeAsync(120_000);
        expect(indexStints(createNodeRepoFiles(root)).stints[0].status).toBe("running");
        done.resolve({ stopReason: "end_turn" });
      }
      if (outcome === "stop")
        expect(
          (await server.app.request("/api/stints/saved-phase/stop", { method: "POST" })).status,
        ).toBe(202);
      if (outcome === "shutdown") {
        await server.stop();
        const suspended = indexStints(createNodeRepoFiles(root)).stints[0];
        expect(suspended).toMatchObject({ status: "running", recovery: { state: "suspended" } });
        expect(suspended.events.filter((event) => event.type === "permission")).toHaveLength(1);
        return;
      }
      const ended = await permissionStep(root, server, "reconciled ending and checkpoint", () =>
        waitForEnding(root),
      );
      expect(ended.status).toBe(
        outcome === "timeout" ? "interrupted" : outcome === "stop" ? "stopped" : "finished",
      );
      if (outcome === "timeout")
        expect(ended.error).toContain("Recovery setup exceeded 60 seconds");
      expect(await queue()).toEqual([]);
      expect(ended.events.filter((event) => event.type === "permission")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  },
);
