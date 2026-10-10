import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  indexStints,
  summarizeStint,
  type ProjectSnapshot,
  type Stint,
  type StintLogEntry,
} from "@stintwork/core";
import { ensureWorktree } from "@stintwork/git";
import { afterEach, expect, test } from "vitest";
import { createProjectServer, createNodeRepoFiles } from "./index.js";

const fixtures: {
  parent: string;
  projects: ReturnType<typeof createProjectServer>[];
  children: ChildProcess[];
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
    const result = createProjectServer(root, join(root, "web"), options);
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
  for (const { parent, projects, children } of fixtures.splice(0)) {
    for (const child of children) kill(child);
    await Promise.all(projects.map((project) => project.stop()));
    await rm(parent, { recursive: true, force: true });
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
      [
        "--import",
        createRequire(import.meta.url).resolve("tsx"),
        "--conditions=development",
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
      ],
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
        { timeout: 5000 },
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
