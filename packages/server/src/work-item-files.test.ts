import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher, type FakeAgentStep } from "@stintwork/agents/testing";
import type { Brief, ProjectSnapshot, Stint } from "@stintwork/core";
import { ensureWorktree } from "@stintwork/git";
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { createProjectServer } from "./index.js";

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
      { timeout: 5000 },
    )
    .toBe("finished");
  return stint;
}
function nextSnapshot(socket: WebSocket, predicate: (value: ProjectSnapshot) => boolean) {
  return new Promise<ProjectSnapshot>((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(new Error("No matching snapshot within 1 second")),
      1000,
    );
    function finish(error?: Error, value?: ProjectSnapshot) {
      clearTimeout(timeout);
      socket.off("message", message);
      socket.off("error", fail);
      if (error) reject(error);
      else if (value) resolve(value);
    }
    function fail(error: Error) {
      finish(error);
    }
    function message(data: { toString(): string }) {
      const value = JSON.parse(data.toString());
      if (Array.isArray(value.workItems) && predicate(value)) finish(undefined, value);
    }
    socket.on("message", message);
    socket.on("error", fail);
  });
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
      { timeout: 1000 },
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
    .poll(async () => (await snapshot(project)).workItems[0]?.worktreePath, { timeout: 1000 })
    .toBe(worktree.path);
  await write(worktree.path, ticketPath, ticket("resolved"));
  await expect
    .poll(async () => (await snapshot(project)).workItems[0]?.tickets[0]?.resolved, {
      timeout: 1000,
    })
    .toBe(true);
  execFileSync("git", ["worktree", "remove", "--force", worktree.path], { cwd: root });
  await expect
    .poll(async () => (await snapshot(project)).workItems[0]?.worktreePath, { timeout: 1000 })
    .toBeUndefined();
  expect((await snapshot(project)).workItems[0].tickets[0].resolved).toBe(false);
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
    const update = nextSnapshot(
      socket,
      (value) =>
        value.workItems.find((item) => item.slug === "first")?.tickets[0]?.resolved === true,
    );
    const began = performance.now();
    await write(active.path, ticketPath, ticket("resolved"));
    const value = await update;
    expect(performance.now() - began).toBeLessThan(1000);
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
