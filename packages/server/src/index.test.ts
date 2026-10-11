// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { ProjectSnapshot } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { liveUpdateLimitMs, nextSnapshot } from "../test/snapshots.js";
import { createProjectServer } from "./index.js";

const ticket = (status: string) => `# 01 — First\nStatus: ${status}\nBlocked by: none\n`;
const defaultFiles = {
  ".scratch/board/spec.md": "# Board",
  ".scratch/board/issues/01-first.md": ticket("ready-for-agent"),
};
const fixtures: { root: string; project: ReturnType<typeof createProjectServer> }[] = [];
const clients: WebSocket[] = [];

async function write(root: string, path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

async function fixture(contents: Record<string, string> = defaultFiles) {
  const root = await mkdtemp(join(tmpdir(), "stintwork-project-"));
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Stintwork tests",
      "-c",
      "user.email=tests@example.invalid",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "Fixture",
    ],
    { cwd: root },
  );
  const webRoot = join(root, "web");
  await mkdir(webRoot);
  await writeFile(join(webRoot, "index.html"), "<!doctype html><title>Stintwork</title>");
  await writeFile(join(webRoot, "app.js"), "console.log('Stintwork');");
  for (const [path, text] of Object.entries(contents)) await write(root, path, text);
  const project = createProjectServer(root, webRoot);
  fixtures.push({ root, project });
  return { root, project };
}

async function servingFixture(contents: Record<string, string> = defaultFiles) {
  const result = await fixture(contents);
  const server = await result.project.start();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  return { ...result, server, url: `http://127.0.0.1:${address.port}` };
}

async function connectLive(url: string) {
  const socket = new WebSocket(`${url.replace("http:", "ws:")}/api/live`);
  socket.on("error", () => undefined);
  clients.push(socket);
  return { socket, snapshot: await nextSnapshot(socket) };
}

afterEach(async () => {
  for (const socket of clients.splice(0)) socket.terminate();
  for (const { root, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("server serves the page and project health over HTTP", async () => {
  const { root, url } = await servingFixture();
  const health = await fetch(`${url}/api/health`);
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ ok: true, repo: basename(root) });
  const page = await fetch(url);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("<title>Stintwork</title>");
  const asset = await fetch(`${url}/app.js`);
  expect(asset.status).toBe(200);
  expect(await asset.text()).toContain("Stintwork");
  expect((await fetch(`${url}/api/missing`)).status).toBe(404);
});

test("server reports a missing web build clearly", () => {
  expect(() => createProjectServer("/example-project", "/missing-stintwork-web-build")).toThrow(
    "Run pnpm build",
  );
});

test("GET /api/project returns indexed work items", async () => {
  const { root, url } = await servingFixture({
    ...defaultFiles,
    ".stintwork/roadmap.md": "## The board\nId: m1\nStatus: active\n- board",
    "AGENTS.md": "# Agents",
    "GLOSSARY.md": "# Glossary",
    "docs/agents/issue-tracker.md": "Use local Markdown",
  });
  const response = await fetch(`${url}/api/project`);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const snapshot = (await response.json()) as ProjectSnapshot;
  expect(snapshot).toMatchObject({
    name: basename(root),
    branch: "main",
    workflows: { feature: { id: "feature" }, bug: { id: "bug" }, quick: { id: "quick" } },
    milestones: [{ id: "m1", status: "active" }],
    workItems: [
      {
        slug: "board",
        milestone: "m1",
        stage: "implement",
        inferred: true,
        tickets: [{ number: 1, resolved: false }],
      },
    ],
    setup: { hasAgents: true, hasGlossary: true, hasIssueTracker: true, usesLocalMarkdown: true },
    warnings: [],
  });
});

test("editing a ticket Status line pushes a new snapshot over WebSocket within 1 second", async () => {
  const { root, url } = await servingFixture();
  const first = await connectLive(url);
  const second = await connectLive(url);
  expect(first.snapshot).toEqual(await (await fetch(`${url}/api/project`)).json());
  expect(second.snapshot).toEqual(first.snapshot);
  const receivedAt: number[] = [];
  const changed = (snapshot: ProjectSnapshot) => {
    if (snapshot.workItems[0]?.tickets[0]?.resolved !== true) return false;
    receivedAt.push(performance.now());
    return true;
  };
  const updates = Promise.all([
    nextSnapshot(first.socket, changed),
    nextSnapshot(second.socket, changed),
  ]);
  const began = performance.now();
  await write(root, ".scratch/board/issues/01-first.md", ticket("resolved"));
  const [snapshot, secondSnapshot] = await updates;
  expect(receivedAt).toHaveLength(2);
  for (const arrival of receivedAt) expect(arrival - began).toBeLessThan(liveUpdateLimitMs);
  expect(snapshot.workItems[0]).toMatchObject({
    stage: "review",
    tickets: [{ status: "resolved", resolved: true }],
  });
  expect(secondSnapshot).toEqual(snapshot);
  expect(await (await fetch(`${url}/api/project`)).json()).toEqual(snapshot);
  expect((await connectLive(url)).snapshot).toEqual(snapshot);
});

test("adding a new .scratch directory adds a work item", async () => {
  const { root, url } = await servingFixture();
  const { socket } = await connectLive(url);
  const update = nextSnapshot(socket, (snapshot) =>
    snapshot.workItems.some((item) => item.slug === "new-work"),
  );
  await write(root, ".scratch/new-work/spec.md", "# New work");
  expect((await update).workItems).toEqual([
    expect.objectContaining({ slug: "board" }),
    expect.objectContaining({ slug: "new-work", title: "New work", stage: "spec" }),
  ]);
});

test("watching discovers project directories that do not exist at startup", async () => {
  const { root, url } = await servingFixture({});
  const { socket, snapshot } = await connectLive(url);
  expect(snapshot.workItems).toEqual([]);
  const update = nextSnapshot(socket, (snapshot) =>
    snapshot.workItems.some((item) => item.slug === "first"),
  );
  await write(root, ".scratch/first/spec.md", "# First work item");
  expect((await update).workItems[0]).toMatchObject({ slug: "first", stage: "spec" });
});

test("roadmap, workflow and setup changes are included in live snapshots", async () => {
  const { root, url } = await servingFixture();
  const { socket } = await connectLive(url);
  const update = nextSnapshot(
    socket,
    (snapshot) =>
      snapshot.setup.hasClaude &&
      snapshot.setup.hasAdrs &&
      snapshot.workItems[0]?.milestone === "m1" &&
      snapshot.workItems[0]?.inferred === false,
  );
  await write(root, ".stintwork/roadmap.md", "## Board\nId: m1\nStatus: active\n- board");
  await write(root, ".scratch/board/workflow.yaml", "workflow: feature\nstage: review");
  await write(root, "CLAUDE.md", "See AGENTS.md");
  await write(root, "docs/adr/0001-files.md", "# Files");
  const snapshot = await update;
  expect(snapshot.workItems[0]).toMatchObject({
    milestone: "m1",
    stage: "review",
    inferred: false,
  });
  expect(snapshot.setup).toMatchObject({ hasClaude: true, hasAdrs: true });
  expect(snapshot.warnings).toEqual([]);
});

test("atomic ticket replacement and file or work-item deletion update the snapshot", async () => {
  const { root, url } = await servingFixture();
  const { socket } = await connectLive(url);
  const replaced = nextSnapshot(
    socket,
    (snapshot) => snapshot.workItems[0]?.tickets[0]?.resolved === true,
  );
  await write(root, ".scratch/board/issues/.replacement", ticket("closed"));
  await rename(
    join(root, ".scratch/board/issues/.replacement"),
    join(root, ".scratch/board/issues/01-first.md"),
  );
  expect((await replaced).workItems[0].tickets[0].status).toBe("closed");
  const removedTicket = nextSnapshot(
    socket,
    (snapshot) => snapshot.workItems[0]?.tickets.length === 0,
  );
  await rm(join(root, ".scratch/board/issues/01-first.md"));
  expect((await removedTicket).workItems[0].stage).toBe("spec");
  const removedWorkItem = nextSnapshot(socket, (snapshot) => snapshot.workItems.length === 0);
  await rm(join(root, ".scratch/board"), { recursive: true });
  expect((await removedWorkItem).workItems).toEqual([]);
});

test("files outside the project paths are not indexed or watched", async () => {
  const { root, url } = await servingFixture();
  const { socket, snapshot } = await connectLive(url);
  const updates: ProjectSnapshot[] = [];
  socket.on("message", (data) => updates.push(JSON.parse(data.toString())));
  await write(root, "docs/brief.md", "Not a setup file");
  await write(root, ".scratch-other/spec.md", "# Not a work item");
  expect(await (await fetch(`${url}/api/project`)).json()).toEqual(snapshot);
  const refreshed = nextSnapshot(socket, (value) => value.setup.hasAgents);
  await write(root, "AGENTS.md", "# Agents");
  const expected = { ...snapshot, setup: { ...snapshot.setup, hasAgents: true } };
  expect(await refreshed).toEqual(expected);
  expect(updates).toEqual([expected]);
  expect(await (await fetch(`${url}/api/project`)).json()).toEqual(expected);
});

test("the project app can be queried without opening a socket", async () => {
  const { project } = await fixture();
  const response = await project.app.request("/api/project");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ branch: "main", workItems: [{ slug: "board" }] });
  expect((await project.app.request("/api/live")).status).toBe(426);
  expect(
    (
      await project.app.request("/api/live", {
        headers: { origin: "https://untrusted.example", upgrade: "websocket" },
      })
    ).status,
  ).toBe(403);
});

test("stop closes active clients, watchers and HTTP and is safe to repeat", async () => {
  const { project, server, url } = await servingFixture();
  const { socket } = await connectLive(url);
  const closed = once(socket, "close");
  await Promise.all([project.stop(), project.stop()]);
  await closed;
  expect(server.listening).toBe(false);
  await expect(project.start()).rejects.toThrow("stopped");
});
