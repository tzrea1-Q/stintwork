// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAgentRegistry } from "@stintwork/agents";
import { createFakeAgentLauncher, fakeAgentProfiles } from "@stintwork/agents/testing";
import type { CheckExecution, ProjectSnapshot, WorkItemChecks } from "@stintwork/core";
import { ensureWorktree } from "@stintwork/git";
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { createProjectServer, type StintServerOptions } from "./index.js";

const fixtures: {
  parent: string;
  project: ReturnType<typeof createProjectServer>;
  socket?: WebSocket;
}[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function write(root: string, path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}
async function fixture(config?: string, options: StintServerOptions = {}) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-checks-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  git(root, "config", "user.name", "Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  await write(root, ".scratch/first/spec.md", "# First");
  await write(root, ".gitignore", ".stintwork/local/\norder.txt\ncancel-proof.txt\n");
  await write(root, "web/index.html", "<!doctype html><title>Stintwork</title>");
  await write(
    root,
    "check.cjs",
    "const fs = require('node:fs'); fs.appendFileSync('order.txt', process.argv[2] + '\\n'); console.log(process.cwd()); console.log(process.argv[2]);\n",
  );
  await write(
    root,
    "package.json",
    JSON.stringify({
      scripts: Object.fromEntries(
        ["build", "lint", "test", "format:check", "typecheck", "start"].map((name) => [
          name,
          `node check.cjs ${name}`,
        ]),
      ),
    }),
  );
  if (config !== undefined) await write(root, ".stintwork/config", config);
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const worktree = (await ensureWorktree(root, "first")).path;
  const create = () =>
    createProjectServer(root, join(root, "web"), {
      agentRegistry: createAgentRegistry([]),
      ...options,
    });
  const tracked = { parent, project: create(), socket: undefined as WebSocket | undefined };
  fixtures.push(tracked);
  return { root, worktree, tracked, create };
}
afterEach(async () => {
  for (const { parent, project, socket } of fixtures.splice(0)) {
    socket?.terminate();
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});
const endpoint = "/api/work-items/first/checks";
async function state(project: ReturnType<typeof createProjectServer>): Promise<WorkItemChecks> {
  const response = await project.app.request(endpoint);
  expect(response.status).toBe(200);
  return response.json();
}
async function finished(project: ReturnType<typeof createProjectServer>) {
  await expect.poll(async () => (await state(project)).checkExecution).toBeNull();
  return state(project);
}
async function start(project: ReturnType<typeof createProjectServer>) {
  const response = await project.app.request(endpoint, { method: "POST" });
  expect(response.status).toBe(202);
  return (await response.json()).execution as CheckExecution;
}

test("defaults execute sequentially in the worktree, record the commit and survive a restart", async () => {
  const { root, worktree, tracked, create } = await fixture();
  const commit = git(worktree, "rev-parse", "HEAD");
  const execution = await start(tracked.project);
  expect(execution.commit).toBe(commit);
  const evidence = await finished(tracked.project);
  expect(evidence.commands.map(({ name }) => name)).toEqual([
    "test",
    "lint",
    "typecheck",
    "build",
    "format:check",
  ]);
  expect(evidence.checks).toEqual(
    evidence.commands.map((command) =>
      expect.objectContaining({
        ...command,
        commit,
        status: "passed",
        durationMs: expect.any(Number),
        outputExcerpt: expect.stringContaining(worktree),
      }),
    ),
  );
  expect(await readFile(join(worktree, "order.txt"), "utf8")).toBe(
    "test\nlint\ntypecheck\nbuild\nformat:check\n",
  );
  await expect(readFile(join(root, "order.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  const logs = await readdir(join(root, ".stintwork/local/checks"));
  expect(logs).toEqual([`${execution.id}.jsonl`]);
  expect(
    JSON.parse(
      (await readFile(join(root, ".stintwork/local/checks", logs[0]), "utf8"))
        .trim()
        .split("\n")
        .at(-1) ?? "",
    ).results,
  ).toEqual(evidence.checks);
  await tracked.project.stop();
  tracked.project = create();
  expect((await state(tracked.project)).checks).toEqual(evidence.checks);
  git(worktree, "commit", "--allow-empty", "--quiet", "-m", "Next commit");
  const stale = await state(tracked.project);
  expect(stale.headCommit).not.toBe(commit);
  expect(stale.checks.every((check) => check.commit === commit)).toBe(true);
  expect(
    ((await (await tracked.project.app.request("/api/project")).json()) as ProjectSnapshot)
      .workItems[0].checks,
  ).toEqual(evidence.checks);
});

test("configured shell commands replace defaults; failures and bounded excerpts are recorded, and later checks still execute", async () => {
  const { tracked } = await fixture(
    "permissionLevel: ask\nchecks:\n  - name: Fail\n    command: node -e \"process.stdout.write('x'.repeat(10000)); console.error('failure'); process.exit(7)\"\n  - name: Pass\n    command: node check.cjs configured\n",
  );
  await start(tracked.project);
  const evidence = await finished(tracked.project);
  expect(evidence.checks.map(({ name, status }) => ({ name, status }))).toEqual([
    { name: "Fail", status: "failed" },
    { name: "Pass", status: "passed" },
  ]);
  expect(evidence.checks[0].outputExcerpt).toContain("failure");
  expect(evidence.checks[0].outputExcerpt).toContain("status 7");
  expect(evidence.checks[0].outputExcerpt.length).toBeLessThanOrEqual(8192);
  expect(evidence.checks[1].outputExcerpt).toContain("configured");
});

test("default discovery honours the root package manager and only the root's present scripts", async () => {
  const { root, tracked } = await fixture();
  for (const manager of ["pnpm", "yarn", "npm"]) {
    await write(
      root,
      "package.json",
      JSON.stringify({
        packageManager: `${manager}@1.0.0`,
        scripts: { test: "test", build: "build", start: "start" },
      }),
    );
    expect((await state(tracked.project)).commands).toEqual(
      ["test", "build"].map((name) => ({ name, command: `${manager} run ${name}` })),
    );
  }
  await rm(join(root, "package.json"));
  expect((await state(tracked.project)).commands).toEqual([]);
});

test("a commit made during checks cannot turn old evidence into proof for the new head", async () => {
  const { worktree, tracked } = await fixture(
    "checks:\n  - name: Wait\n    command: node -e \"console.log('ready'); setTimeout(() => {}, 500)\"\n",
  );
  const execution = await start(tracked.project);
  const snapshot: ProjectSnapshot = await (
    await tracked.project.app.request("/api/project")
  ).json();
  expect(snapshot.workItems[0].checkExecution?.id).toBe(execution.id);
  await expect
    .poll(async () => (await state(tracked.project)).checks[0].outputExcerpt)
    .toContain("ready");
  git(worktree, "commit", "--allow-empty", "--quiet", "-m", "Concurrent commit");
  const evidence = await finished(tracked.project);
  expect(evidence.headCommit).not.toBe(execution.commit);
  expect(evidence.checks[0]).toMatchObject({
    status: "failed",
    commit: execution.commit,
    outputExcerpt: expect.stringContaining("changed during checks"),
  });
});

test("cancellation terminates the command tree and skips remaining checks", async () => {
  const { root, worktree, tracked } = await fixture(
    "checks:\n  - name: Wait\n    command: node wait.cjs\n  - name: Later\n    command: node check.cjs later\n",
  );
  await write(
    worktree,
    "wait.cjs",
    "const {spawn} = require('node:child_process'); const child = spawn(process.execPath, ['-e', `process.on('SIGTERM', () => {}); setTimeout(() => require('node:fs').writeFileSync('cancel-proof.txt', 'alive'), 1500); setInterval(() => {}, 1000);`], {stdio:'ignore'}); process.on('SIGTERM', () => {}); console.log('waiting'); setInterval(() => {}, 1000);\n",
  );
  git(worktree, "add", "wait.cjs");
  git(worktree, "commit", "--quiet", "-m", "Wait check");
  await start(tracked.project);
  await expect
    .poll(async () => (await state(tracked.project)).checks[0].outputExcerpt)
    .toContain("waiting");
  expect((await tracked.project.app.request(endpoint, { method: "POST" })).status).toBe(409);
  expect((await tracked.project.app.request(`${endpoint}/cancel`, { method: "POST" })).status).toBe(
    202,
  );
  expect((await finished(tracked.project)).checks).toEqual([
    expect.objectContaining({ status: "cancelled" }),
    expect.objectContaining({ status: "cancelled" }),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 1600));
  await expect(readFile(join(worktree, "cancel-proof.txt"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(readFile(join(worktree, "order.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  expect((await tracked.project.app.request(`${endpoint}/cancel`, { method: "POST" })).status).toBe(
    409,
  );
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("shutdown cancels active checks, and unfinished persisted checks are recovered as cancelled", async () => {
  const { root, tracked, create } = await fixture(
    "checks:\n  - name: Wait\n    command: node -e \"console.log('waiting'); setInterval(() => {}, 1000)\"\n",
  );
  const execution = await start(tracked.project);
  await expect
    .poll(async () => (await state(tracked.project)).checks[0].outputExcerpt)
    .toContain("waiting");
  await tracked.project.stop();
  const path = join(root, ".stintwork/local/checks", `${execution.id}.jsonl`);
  await appendFile(
    path,
    `${JSON.stringify({ ...execution, results: execution.results.map((result) => ({ ...result, status: "running" })), endedAt: null })}\n`,
  );
  tracked.project = create();
  const recovered = await state(tracked.project);
  expect(recovered.checkExecution).toBeNull();
  expect(recovered.checks[0]).toMatchObject({
    status: "cancelled",
    commit: execution.commit,
    outputExcerpt: expect.stringContaining("restart"),
  });
});

test("dirty worktrees and changes during a check cannot yield passing commit evidence", async () => {
  const { worktree, tracked } = await fixture(
    "checks:\n  - name: Edit\n    command: node -e \"require('node:fs').writeFileSync('check.cjs', 'changed')\"\n",
  );
  await write(worktree, "dirty.txt", "uncommitted");
  expect((await tracked.project.app.request(endpoint, { method: "POST" })).status).toBe(409);
  await rm(join(worktree, "dirty.txt"));
  await start(tracked.project);
  expect((await finished(tracked.project)).checks[0]).toMatchObject({
    status: "failed",
    outputExcerpt: expect.stringContaining("changed during checks"),
  });
});

test("checks and stints cannot edit the same worktree concurrently", async () => {
  const launch = createFakeAgentLauncher(
    [{ type: "hang" }],
    [
      {
        type: "message",
        text: "# Handoff\n## Where I stopped\nWaiting.\n## Unresolved\nNone.\n## Suggested next\nContinue.",
      },
      { type: "end" },
    ],
  );
  const { worktree, tracked } = await fixture(
    'checks:\n  - name: Wait\n    command: node -e "setInterval(() => {}, 1000)"\n',
    {
      agentRegistry: createAgentRegistry([{ ...fakeAgentProfiles.codex, launch }]),
      handoffTimeoutMs: 1000,
    },
  );
  await write(
    worktree,
    ".scratch/first/workflow.yaml",
    "workflow: feature\nstage: implement\nstages:\n  implement:\n    agent: codex\n",
  );
  await write(
    worktree,
    ".scratch/first/issues/01-first.md",
    "# First\nStatus: ready-for-agent\nBlocked by: none\n",
  );
  git(worktree, "add", ".scratch");
  git(worktree, "commit", "--quiet", "-m", "Ready for a stint");
  const startStint = () =>
    tracked.project.app.request("/api/stints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
    });
  await start(tracked.project);
  const blockedStint = await startStint();
  expect(blockedStint.status).toBe(409);
  expect((await blockedStint.json()).reason).toContain("checks");
  await tracked.project.app.request(`${endpoint}/cancel`, { method: "POST" });
  await finished(tracked.project);
  const stint = await startStint();
  expect(stint.status).toBe(201);
  const blockedChecks = await tracked.project.app.request(endpoint, { method: "POST" });
  expect(blockedChecks.status).toBe(409);
  expect((await blockedChecks.json()).reason).toContain("active stint");
});

test("invalid configuration, disabled checks, unavailable worktrees, and cross-origin writes are refused", async () => {
  const { root, tracked } = await fixture("checks: []\n");
  expect((await state(tracked.project)).commands).toEqual([]);
  expect((await tracked.project.app.request(endpoint, { method: "POST" })).status).toBe(409);
  await write(root, ".stintwork/config", "checks: invalid\n");
  expect((await tracked.project.app.request(endpoint)).status).toBe(503);
  for (const suffix of ["", "/cancel"])
    expect(
      (
        await tracked.project.app.request(`${endpoint}${suffix}`, {
          method: "POST",
          headers: { Origin: "https://other.invalid" },
        })
      ).status,
    ).toBe(403);
  expect((await tracked.project.app.request("/api/work-items/missing/checks")).status).toBe(404);
  await write(root, ".scratch/second/spec.md", "# Second");
  expect((await tracked.project.app.request("/api/work-items/second/checks")).status).toBe(409);
});

test("log directories cannot follow symlinks outside the project", async () => {
  const { root, tracked } = await fixture(
    "checks:\n  - name: Test\n    command: node check.cjs test\n",
  );
  const outside = join(root, "outside");
  await mkdir(outside);
  await symlink(outside, join(root, ".stintwork/local"));
  const response = await tracked.project.app.request(endpoint, { method: "POST" });
  expect(response.status).toBe(409);
  expect((await response.json()).reason).toContain("real directories");
  expect(await readdir(outside)).toEqual([]);
});

test("output is streamed over the existing WebSocket before the check completes", async () => {
  const { tracked } = await fixture(
    "checks:\n  - name: Stream\n    command: node -e \"console.log('early'); setTimeout(() => console.error('late'), 500)\"\n",
  );
  const server = await tracked.project.start();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  const messages: { type?: string; execution?: CheckExecution }[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/live`);
  tracked.socket = socket;
  socket.on("message", (data) => messages.push(JSON.parse(String(data))));
  await once(socket, "open");
  await start(tracked.project);
  await expect
    .poll(() =>
      messages.find(
        (message) =>
          message.type === "checks" &&
          message.execution?.results[0].outputExcerpt.includes("early"),
      ),
    )
    .toMatchObject({
      execution: { endedAt: null, results: [expect.objectContaining({ status: "running" })] },
    });
  await finished(tracked.project);
  await expect
    .poll(() => messages.find((message) => message.execution?.endedAt))
    .toMatchObject({
      execution: {
        results: [
          expect.objectContaining({
            status: "passed",
            outputExcerpt: expect.stringContaining("late"),
          }),
        ],
      },
    });
});
