// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher, type FakeAgentStep } from "@stintwork/agents/testing";
import {
  indexProject,
  type Brief,
  type ProjectSnapshot,
  type Stint,
  type StintLogEntry,
} from "@stintwork/core";
import { createCheckpoint, ensureWorktree, listWorkItemWorktrees } from "@stintwork/git";
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { liveUpdateLimitMs, nextSnapshot } from "../test/snapshots.js";
import { createProjectServer } from "./index.js";
import { projectPaths } from "./repo-files.js";
import { createProjectFiles } from "./work-item-files.js";

const specPath = ".scratch/first/spec.md";
const ticketPath = ".scratch/first/issues/01-first.md";
const ticket = (status: string) => `# First\nStatus: ${status}\nBlocked by: none`;
const fixtures: {
  parent: string;
  project: ReturnType<typeof createProjectServer>;
  socket?: WebSocket;
}[] = [];

async function write(root: string, path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
async function traceGit(root: string, action: () => void | Promise<void>) {
  const tracePath = join(root, "git-trace.jsonl");
  const previousTrace = process.env.GIT_TRACE2_EVENT;
  process.env.GIT_TRACE2_EVENT = tracePath;
  try {
    await action();
    const trace = await readFile(tracePath, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return "";
    });
    return trace
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { event: string; argv: string[] })
      .filter((entry) => entry.event === "start");
  } finally {
    if (previousTrace === undefined) delete process.env.GIT_TRACE2_EVENT;
    else process.env.GIT_TRACE2_EVENT = previousTrace;
  }
}
async function fixture(script: FakeAgentStep[] = [], withWorktree = false) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-project-files-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  for (const [path, text] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    "AGENTS.md": "Main conventions",
    [specPath]: "# First",
    [ticketPath]: ticket("ready-for-agent"),
    ".scratch/first/issues/02-next.md": "# Next\nStatus: ready-for-agent\nBlocked by: 01",
    ".scratch/inactive/spec.md": "# Inactive",
  }))
    await write(root, path, text);
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Tests",
      "-c",
      "user.email=tests@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "Fixture",
    ],
    { cwd: root },
  );
  const worktree = withWorktree ? await ensureWorktree(root, "first") : undefined;
  const project = createProjectServer(root, join(root, "web"), {
    launchAgent: createFakeAgentLauncher(script),
  });
  const tracked = { parent, project, socket: undefined as WebSocket | undefined };
  fixtures.push(tracked);
  return { root, project, tracked, worktree };
}
afterEach(async () => {
  for (const { parent, project, socket } of fixtures.splice(0)) {
    socket?.terminate();
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});
async function snapshot(project: ReturnType<typeof createProjectServer>): Promise<ProjectSnapshot> {
  const value: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  const watcherError = value.warnings.find((warning) =>
    warning.message.startsWith("File watcher error:"),
  );
  if (watcherError) throw new Error(watcherError.message);
  return value;
}
async function start(project: ReturnType<typeof createProjectServer>): Promise<Stint> {
  const response = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  const { stint } = await response.json();
  await expect
    .poll(
      async () =>
        (await snapshot(project)).workItems
          .find((item) => item.slug === "first")
          ?.stints.find((entry) => entry.id === stint.id)?.status,
      { timeout: 10_000 },
    )
    .toBe("finished");
  return stint;
}
async function live(
  project: ReturnType<typeof createProjectServer>,
  tracked: (typeof fixtures)[number],
) {
  const server = await project.start();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/live`);
  tracked.socket = socket;
  await nextSnapshot(socket, () => true);
  return socket;
}

test("a fake ACP stint resolves ticket 01 and unblocks 02 in the snapshot without editing main", async () => {
  const { root, project } = await fixture([
    { type: "write", path: ticketPath, content: ticket("resolved") },
  ]);
  const stint = await start(project);
  const value = await snapshot(project);
  expect(value.workItems.find((item) => item.slug === "first")).toMatchObject({
    worktreePath: stint.worktree.path,
    tickets: [
      { number: 1, resolved: true },
      { number: 2, blocked: false },
    ],
  });
  expect(await readFile(join(root, ticketPath), "utf8")).toBe(ticket("ready-for-agent"));
  expect(value.warnings).toEqual([]);
  const preview = await project.app.request("/api/work-items/first/tickets/02/brief-preview");
  expect(preview.status).toBe(200);
});

test("the next brief compares the worktree spec with the last checkpoint, not main", async () => {
  const { root, project } = await fixture();
  const stint = await start(project);
  await write(stint.worktree.path, specPath, "# Updated worktree spec");
  await write(root, ticketPath, ticket("resolved"));
  const response = await project.app.request("/api/work-items/first/tickets/01/brief-preview");
  expect(response.status).toBe(200);
  const brief: Brief = await response.json();
  expect(brief.changedPaths).toEqual([specPath]);
  expect(brief.checkpointCommit).toBeTruthy();
  expect(await readFile(join(root, specPath), "utf8")).toBe("# First");
});

test("server restart uses existing worktrees and warns about main edits against the creation base", async () => {
  const { root, project, tracked } = await fixture();
  const stint = await start(project);
  await write(stint.worktree.path, specPath, "# Agent changes");
  await write(root, specPath, "# Wrong checkout");
  await project.stop();
  tracked.project = createProjectServer(root, join(root, "web"));
  const value = await snapshot(tracked.project);
  expect(value.workItems.find((item) => item.slug === "first")).toMatchObject({
    spec: { text: "# Agent changes" },
    worktreePath: stint.worktree.path,
  });
  expect(value.warnings).toContainEqual({
    path: ".scratch/first/",
    message: expect.stringContaining(join(stint.worktree.path, ".scratch/first")),
  });
});

test("startup recovery checkpoints worktree files before indexing and compiling the next brief", async () => {
  const { root, project, worktree } = await fixture([], true);
  if (!worktree) throw new Error("Expected a worktree");
  const started: StintLogEntry = {
    type: "started",
    at: new Date().toISOString(),
    stint: {
      id: "interrupted-worktree",
      workItem: "first",
      ticket: 1,
      stage: "implement",
      agent: "codex",
      worktree,
      baseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: worktree.path,
        encoding: "utf8",
      }).trim(),
      brief: { skill: null, pointers: [], lastHandoff: null, changedPaths: [], prompt: "Work" },
    },
  };
  await write(
    root,
    ".stintwork/local/stints/interrupted-worktree.jsonl",
    `${JSON.stringify(started)}\n`,
  );
  await write(worktree.path, specPath, "# Recovered work");
  await project.start();
  const value = await snapshot(project);
  const item = value.workItems.find((candidate) => candidate.slug === "first");
  expect(item).toMatchObject({
    title: "Recovered work",
    worktreePath: worktree.path,
    activeStint: null,
    stints: [
      expect.objectContaining({
        status: "interrupted",
        checkpointCommit: expect.stringMatching(/^[a-f\d]{40}$/),
      }),
    ],
  });
  const response = await project.app.request("/api/stints/interrupted-worktree");
  expect(response.status).toBe(200);
  const { stint }: { stint: Stint } = await response.json();
  expect(stint.status).toBe("interrupted");
  expect(
    execFileSync("git", ["show", `${stint.checkpointCommit}:${specPath}`], {
      cwd: worktree.path,
      encoding: "utf8",
    }),
  ).toBe("# Recovered work");
  await write(worktree.path, specPath, "# Edited after recovery");
  const preview = await project.app.request("/api/work-items/first/tickets/1/brief-preview");
  expect(preview.status).toBe(200);
  const brief: Brief = await preview.json();
  expect(brief.checkpointCommit).toBe(stint.checkpointCommit);
  expect(brief.changedPaths).toEqual([specPath]);
  expect(await readFile(join(root, specPath), "utf8")).toBe("# First");
});

test("the watcher reindexes worktree files and main-only work items without an HTTP listener", async () => {
  const { root, project, worktree } = await fixture([], true);
  if (!worktree) throw new Error("Expected a worktree");
  await project.start();
  await write(worktree.path, ticketPath, ticket("resolved"));
  await write(root, ".scratch/inactive/spec.md", "# Updated inactive");
  await expect
    .poll(
      async () => {
        const value = await snapshot(project);
        return value.workItems.map((item) => ({
          slug: item.slug,
          title: item.title,
          resolved: item.tickets[0]?.resolved,
        }));
      },
      { timeout: 10_000 },
    )
    .toEqual([
      { slug: "first", title: "First", resolved: true },
      { slug: "inactive", title: "Updated inactive", resolved: undefined },
    ]);
});

test("the watcher discovers a newly registered worktree and falls back to main when it is removed", async () => {
  const { root, project } = await fixture();
  await project.start();
  const worktree = await ensureWorktree(root, "first");
  await expect
    .poll(async () => (await snapshot(project)).workItems[0]?.worktreePath, { timeout: 10_000 })
    .toBe(worktree.path);
  await write(worktree.path, ticketPath, ticket("resolved"));
  await expect
    .poll(async () => (await snapshot(project)).workItems[0]?.tickets[0]?.resolved, {
      timeout: 10_000,
    })
    .toBe(true);
  execFileSync("git", ["worktree", "remove", "--force", worktree.path], { cwd: root });
  await expect
    .poll(async () => (await snapshot(project)).workItems[0]?.worktreePath, { timeout: 10_000 })
    .toBeUndefined();
  expect((await snapshot(project)).workItems[0].tickets[0].resolved).toBe(false);
});

test.each([true, false])(
  "main file watching discovers new work without an HTTP listener (scratch exists: %s)",
  async (scratchExists) => {
    const { root, project } = await fixture();
    if (!scratchExists) await rm(join(root, ".scratch"), { recursive: true });
    await project.start();
    await write(root, ".scratch/new-work/spec.md", "# New work");
    await expect
      .poll(
        async () =>
          (await snapshot(project)).workItems.find((item) => item.slug === "new-work")?.title,
        { timeout: 10_000 },
      )
      .toBe("New work");
  },
);

test("main file watching includes roadmap, workflow and setup edits without an HTTP listener", async () => {
  const { root, project } = await fixture();
  await project.start();
  await write(root, ".stintwork/roadmap.md", "## First\nId: m1\nStatus: active\n- first");
  await write(root, ".scratch/first/workflow.yaml", "workflow: feature\nstage: review");
  await write(root, "CLAUDE.md", "See AGENTS.md");
  await write(root, "docs/adr/0001-files.md", "# Files");
  await expect
    .poll(
      async () => {
        const value = await snapshot(project);
        return {
          hasClaude: value.setup.hasClaude,
          hasAdrs: value.setup.hasAdrs,
          stage: value.workItems.find((item) => item.slug === "first")?.stage,
          milestone: value.workItems.find((item) => item.slug === "first")?.milestone,
        };
      },
      { timeout: 10_000 },
    )
    .toEqual({ hasClaude: true, hasAdrs: true, stage: "review", milestone: "m1" });
});

test.each([true, false])(
  "worktree ticket edits push a snapshot within 1 second (exists at startup: %s)",
  async (withWorktree) => {
    const { root, project, tracked, worktree } = await fixture([], withWorktree);
    const socket = await live(project, tracked);
    const created = !withWorktree
      ? nextSnapshot(socket, (value) =>
          value.workItems.some((item) => item.slug === "first" && !!item.worktreePath),
        )
      : undefined;
    const active = worktree ?? (await ensureWorktree(root, "first"));
    await created;
    let receivedAt = 0;
    const update = nextSnapshot(socket, (value) => {
      if (value.workItems.find((item) => item.slug === "first")?.tickets[0]?.resolved !== true)
        return false;
      receivedAt = performance.now();
      return true;
    });
    const began = performance.now();
    await write(active.path, ticketPath, ticket("resolved"));
    const value = await update;
    expect(receivedAt - began).toBeLessThan(liveUpdateLimitMs);
    expect(value.workItems.find((item) => item.slug === "first")?.tickets[1].blocked).toBe(false);
    expect(await readFile(join(root, ticketPath), "utf8")).toBe(ticket("ready-for-agent"));
  },
);

test("main spec edits push a divergence warning naming the worktree, and restoring them clears it", async () => {
  const { root, project, tracked, worktree } = await fixture([], true);
  const socket = await live(project, tracked);
  const warning = nextSnapshot(socket, (value) =>
    value.warnings.some((entry) => entry.path === ".scratch/first/"),
  );
  await write(root, specPath, "# Wrong checkout");
  expect((await warning).warnings).toContainEqual({
    path: ".scratch/first/",
    message: expect.stringContaining(worktree?.path ?? "Missing worktree"),
  });
  const cleared = nextSnapshot(
    socket,
    (value) => !value.warnings.some((entry) => entry.path === ".scratch/first/"),
  );
  await write(root, specPath, "# First");
  expect((await cleared).workItems.find((item) => item.slug === "first")?.spec?.text).toBe(
    "# First",
  );
});

test("ordinary file refreshes do not spawn Git again after discovery", async () => {
  const { root, worktree } = await fixture([], true);
  if (!worktree) throw new Error("Expected a worktree");
  const readProjectFiles = createProjectFiles(root);
  readProjectFiles();
  await write(worktree.path, ticketPath, ticket("resolved"));
  await write(root, ".scratch/inactive/spec.md", "# Updated inactive");
  const began = performance.now();
  const starts = await traceGit(root, () => {
    for (let index = 0; index < 10; index++) {
      const files = readProjectFiles([
        join(worktree.path, ticketPath),
        join(root, ".scratch/inactive/spec.md"),
        join(root, "AGENTS.md"),
      ]).files;
      const value = indexProject(files, { name: "Fixture" });
      expect(value.workItems.find((item) => item.slug === "first")?.tickets[0].resolved).toBe(true);
      expect(value.workItems.find((item) => item.slug === "first")?.tickets[1].blocked).toBe(false);
      expect(value.workItems.find((item) => item.slug === "inactive")?.spec?.text).toBe(
        "# Updated inactive",
      );
    }
  });
  console.log(
    `Ten indexed file refreshes: ${(performance.now() - began).toFixed(1)} ms; ${starts.length} Git processes`,
  );
  expect(starts).toHaveLength(0);
});

test("file watching covers only project files and the work item's files, never Git internals", async () => {
  const { root } = await fixture();
  const readProjectFiles = createProjectFiles(root);
  const mainPaths = projectPaths.map((path) => join(root, path));
  expect(readProjectFiles().watchPaths).toEqual(mainPaths);
  const worktree = await ensureWorktree(root, "first");
  expect(readProjectFiles([]).watchPaths).toEqual([
    ...mainPaths,
    join(worktree.path, ".scratch", "first"),
  ]);
});

test("metadata probes ignore main Git operations and a worktree's index and HEAD log", async () => {
  const { root, worktree } = await fixture([], true);
  if (!worktree) throw new Error("Expected a worktree");
  const { registryPath } = listWorkItemWorktrees(root);
  const readProjectFiles = createProjectFiles(root);
  readProjectFiles();
  await write(root, "unrelated.txt", "Main changes");
  await createCheckpoint(root, { id: "fixture", workItem: "first", ticket: 1, status: "finished" });
  await write(worktree.path, ticketPath, ticket("resolved"));
  execFileSync("git", ["add", ticketPath], { cwd: worktree.path });
  const now = new Date();
  await utimes(join(registryPath, "first", "logs", "HEAD"), now, now);
  const starts = await traceGit(root, () => {
    for (let index = 0; index < 20; index++) {
      expect(readProjectFiles.metadataChanged()).toBe(false);
      expect(readProjectFiles([]).files.read(ticketPath)).toBe(ticket("resolved"));
    }
  });
  expect(starts).toHaveLength(0);
});

test("main file changes only recheck that active work item and reuse its creation base", async () => {
  const { root } = await fixture([], true);
  await ensureWorktree(root, "inactive");
  const readProjectFiles = createProjectFiles(root);
  readProjectFiles();
  const starts = await traceGit(root, async () => {
    await write(root, specPath, "# Edited in main");
    expect(readProjectFiles([join(root, specPath)]).warnings).toEqual([
      expect.objectContaining({ path: ".scratch/first/" }),
    ]);
    await write(root, specPath, "# First");
    expect(readProjectFiles([join(root, specPath)]).warnings).toEqual([]);
  });
  expect(starts).toHaveLength(3);
  expect(starts.every((entry) => entry.argv.includes(".scratch/first/"))).toBe(true);
});

test("registry changes invalidate discovery and unhinted reads remain immediately fresh", async () => {
  const { root } = await fixture();
  const readProjectFiles = createProjectFiles(root);
  readProjectFiles();
  const worktree = await ensureWorktree(root, "first");
  expect(readProjectFiles([]).worktreePaths.get("first")).toBe(worktree.path);
  execFileSync("git", ["switch", "--quiet", "-c", "other"], { cwd: worktree.path });
  expect(readProjectFiles([]).worktreePaths.size).toBe(0);
  execFileSync("git", ["switch", "--quiet", "stintwork/first"], { cwd: worktree.path });
  expect(readProjectFiles().worktreePaths.get("first")).toBe(worktree.path);
  await write(root, specPath, "# Edited in main");
  expect(readProjectFiles().warnings).toEqual([
    expect.objectContaining({ path: ".scratch/first/" }),
  ]);
  await rm(worktree.path, { recursive: true });
  expect(readProjectFiles([]).worktreePaths.size).toBe(0);
});

test("ref and base config changes invalidate caches without treating a checkpoint as the base", async () => {
  const { root, worktree } = await fixture([], true);
  if (!worktree) throw new Error("Expected a worktree");
  const readProjectFiles = createProjectFiles(root);
  readProjectFiles();
  const stint = { id: "fixture", workItem: "first", ticket: 1, status: "finished" };
  await write(worktree.path, specPath, "# Checkpoint spec");
  await createCheckpoint(worktree.path, stint);
  const starts = await traceGit(root, () => {
    expect(readProjectFiles([]).warnings).toEqual([]);
  });
  expect(starts.some((entry) => entry.argv.includes("worktree"))).toBe(true);
  expect(starts.some((entry) => entry.argv.includes("branch.stintwork/first.stintwork-base"))).toBe(
    true,
  );
  await write(root, specPath, "# Edited in main");
  expect(readProjectFiles([join(root, specPath)]).warnings).toHaveLength(1);
  const newBase = await createCheckpoint(root, stint);
  execFileSync("git", ["config", "branch.stintwork/first.stintwork-base", newBase], { cwd: root });
  const updated = readProjectFiles([]);
  expect(updated.warnings).toEqual([]);
  expect(updated.files.read(specPath)).toBe("# Checkpoint spec");
});

test("failed discovery does not reuse a worktree whose parent became a symlink", async () => {
  const { root, worktree } = await fixture([], true);
  if (!worktree) throw new Error("Expected a worktree");
  const readProjectFiles = createProjectFiles(root);
  readProjectFiles();
  const parent = dirname(worktree.path);
  await rename(parent, `${parent}-moved`);
  await symlink(`${parent}-moved`, parent);
  const value = readProjectFiles([]);
  expect(value.worktreePaths.size).toBe(0);
  expect(value.warnings).toEqual([
    expect.objectContaining({ message: expect.stringContaining("must not be a symlink") }),
  ]);
});
