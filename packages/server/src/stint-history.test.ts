// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { adapterCacheFixture } from "../../agents/test/adapter-cache-fixture.js";
import { verifyRecordedAgent } from "../../agents/src/adapter-cache.js";
import {
  createAgentRegistry,
  createClaudeCodeAgent,
  createCodexAgent,
  prepareAgent,
  adapterHost,
  continuationInstruction,
} from "@stintwork/agents";
import {
  createFakeAgentLauncher,
  fakeAgentProfiles,
  sourceNodeArgs,
} from "@stintwork/agents/testing";
import {
  indexStints,
  summarizeStint,
  type ProjectSnapshot,
  type Stint,
  type StintLogEntry,
  type StintProgress,
  type StintLiveMessage,
  isStintLogEntry,
} from "@stintwork/core";
import { ensureWorktree } from "@stintwork/git";
import { WebSocket } from "ws";
import { afterEach, expect, test } from "vitest";
import { createProjectServer, createNodeRepoFiles } from "./index.js";

const fixtures: {
  parent: string;
  projects: ReturnType<typeof createProjectServer>[];
  children: ChildProcess[];
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
  for (const { parent, projects, children, cache } of fixtures.splice(0)) {
    for (const child of children) kill(child);
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
  "SIGKILL leaves an unfinished log; restart checkpoints edits before accepting a new stint (TCP: %s)",
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
         launchAgent: createFakeAgentLauncher([{type:'message',text:'Before crash'}, {type:'write',path:'partial.txt',content:'Uncommitted work'}, {type:'hang'}])
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
  const { stint }: { stint: Stint } = await (
    await project().app.request("/api/stints/torn")
  ).json();
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
  const history = await Promise.all(responses.map((response) => response.json()));
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

test.each(
  (["claude", "codex"] as const).flatMap((agent) =>
    (["installed", "bundled"] as const).flatMap((source) =>
      [false, true].map((tcp) => ({ agent, source, tcp })),
    ),
  ),
)(
  "$agent/$source: SIGKILL resumes the same stint/session through loadSession (TCP: $tcp)",
  async ({ agent, source, tcp }) => {
    const { root, project, tracked, selected, env, registered, calls, cache } = await warmRecovery(
      agent,
      source,
    );
    const child = spawn(
      process.execPath,
      sourceNodeArgs(
        "--input-type=module",
        "--eval",
        `
      import { once } from 'node:events';
      import { createProjectServer } from ${JSON.stringify(new URL("./index.ts", import.meta.url).href)};
      import { createAgentRegistry, createClaudeCodeAgent, createCodexAgent } from ${JSON.stringify(new URL("../../agents/src/index.ts", import.meta.url).href)};
      const env = ${JSON.stringify({ ...env, TEST_RECOVERY: "crash" })};
      const agent = ${JSON.stringify(agent)} === 'claude' ? createClaudeCodeAgent(env) : createCodexAgent({ env });
      agent.prepare = async () => (${JSON.stringify(selected)});
      const project = createProjectServer(${JSON.stringify(root)}, ${JSON.stringify(join(root, "web"))}, {agentRegistry:createAgentRegistry([agent]),handoffTimeoutMs:3000});
      let url;
      if (${tcp}) {
        const server = await project.start(); server.listen(0,'127.0.0.1'); await once(server,'listening');
        url = 'http://127.0.0.1:' + server.address().port;
      }
      const request = {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workItem:'first',ticket:1,agent:agent.id})};
      const response = url ? await fetch(url+'/api/stints',request) : await project.app.request('/api/stints',request);
      process.send({status:response.status,body:await response.json()});
    `,
      ),
      { detached: process.platform !== "win32", stdio: ["ignore", "ignore", "pipe", "ipc"] },
    );
    tracked.children.push(child);
    const message = await new Promise<{ status: number; body: { stint: Stint } }>(
      (resolve, reject) => {
        child.once("message", (message) =>
          resolve(message as { status: number; body: { stint: Stint } }),
        );
        child.once("error", reject);
        child.once("exit", (code, signal) => reject(new Error(`Server exited: ${code ?? signal}`)));
      },
    );
    expect(message.status).toBe(201);
    const stint = message.body.stint;
    const path = join(root, ".stintwork/local/stints", `${stint.id}.jsonl`);
    await expect.poll(() => readFile(path, "utf8")).toContain("Before crash");
    const before = await readFile(path, "utf8");
    const original = indexStints(createNodeRepoFiles(root)).stints[0];
    expect(original.recovery?.sessionId).toBe("fake-session");
    const exited = once(child, "exit");
    // Ticket 03 establishes the old writer is gone; server-only orphan cleanup is ticket 05.
    kill(child);
    await exited;
    await expect
      .poll(() => {
        try {
          process.kill(original.recovery?.attempt?.pid ?? 0, 0);
          return false;
        } catch (error) {
          return (error as NodeJS.ErrnoException).code === "ESRCH";
        }
      })
      .toBe(true);
    const npmCalls = await cache.calls();
    let release: () => void = () => {};
    const verified = registered.verifyRecovery;
    if (!verified) throw new Error("Expected recovery verifier");
    registered.verifyRecovery = async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return verified(...args);
    };
    const restarted = project({
      agentRegistry: createAgentRegistry([registered]),
      handoffTimeoutMs: 3000,
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
    let socket: WebSocket | undefined;
    const frames: StintLiveMessage[] = [];
    if (url) {
      socket = new WebSocket(`${url.replace("http:", "ws:")}/api/live`);
      socket.on("message", (bytes) => {
        const message = JSON.parse(String(bytes));
        if (message.type === "stint") frames.push(message);
      });
      await once(socket, "message");
    }
    const request = (path: string, init?: RequestInit) =>
      url ? fetch(`${url}${path}`, init) : restarted.app.request(path, init);
    expect((await request("/api/health")).status).toBe(200);
    const current = await (await request(`/api/stints/${stint.id}`)).json();
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
    release();
    await expect
      .poll(() => indexStints(createNodeRepoFiles(root)).stints[0].status)
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
    const after = await readFile(path, "utf8");
    expect(after.startsWith(before)).toBe(true);
    expect(after).not.toContain("REPLAY MUST NOT APPEND");
    expect(after.split("\n").filter((line) => line.includes('"type":"ended"'))).toHaveLength(1);
    const entries = after
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entries.every(isStintLogEntry)).toBe(true);
    if (socket) {
      await expect.poll(() => frames.at(-1)?.entry.type).toBe("ended");
      const previousEntries = before.trim().split("\n").length;
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
    for (const name of ["partial.txt", "resumed.txt", "handoff.txt"]) {
      expect(
        execFileSync("git", ["show", `${recovered.checkpointCommit}:${name}`], {
          cwd: root,
          encoding: "utf8",
        }),
      ).toBeTruthy();
    }
    const trace = await calls();
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
    expect(await cache.calls()).toEqual(npmCalls);
    expect((await request(`/api/stints/${stint.id}`)).status).toBe(200);
    expect((await calls()).filter((call) => call.method === "session/load")).toHaveLength(1);
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
  if (phase !== "handoff")
    progress.handoff = {
      stint: "saved-phase",
      agent: "codex",
      stoppedAt: "Saved handoff",
      unresolved: "None",
      nextStep: "Review",
    };
  if (phase === "finalization")
    progress.findings = { commit: started.stint.baseCommit, findings: [], rawReply: "No findings" };
  // Real exited processes supply unambiguous dead identities without guessing a free PID.
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

test("a live recorded owner reserves the work item without launching or checkpointing", async () => {
  const { project, root, registered, logged, entries, calls } = await savedRecovery("finalization");
  const attempt = entries.find((entry) => entry.type === "recovery" && entry.kind === "attempt");
  if (attempt?.type !== "recovery" || attempt.kind !== "attempt")
    throw new Error("Expected attempt");
  attempt.attempt.owner.pid = process.pid;
  await writeFile(logged.path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  const before = await readFile(logged.path, "utf8");
  const server = project({ agentRegistry: createAgentRegistry([registered]) });
  const snapshot: ProjectSnapshot = await (await server.app.request("/api/project")).json();
  expect(snapshot.warnings.some((warning) => warning.message.includes("previous owner"))).toBe(
    true,
  );
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
  await expect.poll(() => indexStints(createNodeRepoFiles(root)).stints[0].status).toBe("failed");
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
