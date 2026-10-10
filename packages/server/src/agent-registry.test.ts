import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAgentRegistry, type AgentRegistry } from "@stintwork/agents";
import { createFakeAgentLauncher, fakeAgentProfiles } from "@stintwork/agents/testing";
import type { Brief, ProjectSnapshot, Stint, StintLogEntry } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { createProjectServer } from "./index.js";

const fixtures: {
  parent: string;
  project: ReturnType<typeof createProjectServer>;
  socket?: WebSocket;
}[] = [];
const handoff =
  "## Where I stopped\nWrote greeting.\n## Unresolved\nNone\n## Suggested next\nReview it.";
function secondAgentRegistry() {
  return createAgentRegistry([
    { ...fakeAgentProfiles.codex, launch: createFakeAgentLauncher([]) },
    {
      ...fakeAgentProfiles.claude,
      id: "fake-second",
      displayName: "Second agent",
      launch: createFakeAgentLauncher(
        [
          { type: "message", text: "Second agent is working" },
          { type: "write", path: "greeting.txt", content: "Hello" },
        ],
        [{ type: "message", text: handoff }],
        { profile: "claude", agentId: "fake-second" },
      ),
    },
  ]);
}
async function fixture(agentRegistry?: AgentRegistry) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-registry-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  for (const [path, content] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    ".gitignore": ".stintwork/local/\n",
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/01-first.md":
      "# First ticket\nStatus: ready-for-agent\nBlocked by: none",
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  execFileSync("git", ["add", "--all"], { cwd: root });
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
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry:
      agentRegistry ??
      createAgentRegistry([{ ...fakeAgentProfiles.codex, launch: createFakeAgentLauncher([]) }]),
    handoffTimeoutMs: 1000,
  });
  const tracked = { parent, project, socket: undefined as WebSocket | undefined };
  fixtures.push(tracked);
  return { root, project, tracked };
}
afterEach(async () => {
  for (const { parent, project, socket } of fixtures.splice(0)) {
    socket?.terminate();
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});
function start(project: ReturnType<typeof createProjectServer>, agent: string) {
  return project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent }),
  });
}

test("an injected registry is discoverable and refuses unregistered agents before creating files", async () => {
  const { root, project } = await fixture();
  const response = await project.app.request("/api/agents");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ agents: [fakeAgentProfiles.codex] });
  for (const id of ["claude", "grok", "unknown", "__proto__", "toString"]) {
    const refused = await start(project, id);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ reason: `Agent is not registered: ${id}.` });
  }
  await expect(readdir(join(root, ".stintwork/local/stints"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(
    execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: root, encoding: "utf8" }).match(
      /^worktree /gm,
    ),
  ).toHaveLength(1);
});

test("a registered second fake agent owns its stint, log, handoff, workflow and snapshot after restart", async () => {
  const agentRegistry = secondAgentRegistry();
  const { root, project, tracked } = await fixture(agentRegistry);
  const registry: { agents: { id: string; displayName: string }[] } = await (
    await project.app.request("/api/agents")
  ).json();
  expect(registry.agents.map(({ id, displayName }) => ({ id, displayName }))).toEqual([
    { id: "codex", displayName: "Codex" },
    { id: "fake-second", displayName: "Second agent" },
  ]);
  const response = await start(project, "fake-second");
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  expect(stint.agent).toBe("fake-second");
  await expect
    .poll(async () => {
      const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
      return snapshot.workItems[0].stints[0]?.status;
    })
    .toBe("finished");
  const entries: StintLogEntry[] = (
    await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(entries[0]).toMatchObject({ type: "started", stint: { agent: "fake-second" } });
  expect(entries.at(-1)).toMatchObject({
    type: "ended",
    status: "finished",
    handoff: { agent: "fake-second", stint: stint.id, stoppedAt: "Wrote greeting." },
    checkpointCommit: expect.any(String),
  });
  expect(await readFile(join(stint.worktree.path, "greeting.txt"), "utf8")).toBe("Hello");
  expect(
    await readFile(join(stint.worktree.path, ".scratch/first/workflow.yaml"), "utf8"),
  ).toContain("agent: fake-second");
  await project.stop();
  tracked.project = createProjectServer(root, join(root, "web"), { agentRegistry });
  const snapshot: ProjectSnapshot = await (
    await tracked.project.app.request("/api/project")
  ).json();
  expect(snapshot.workItems[0].stints[0]).toMatchObject({
    id: stint.id,
    agent: "fake-second",
    handoff: { agent: "fake-second" },
  });
  const nextPreview: Brief = await (
    await tracked.project.app.request("/api/work-items/first/tickets/1/brief-preview")
  ).json();
  expect(nextPreview.lastHandoff).toMatchObject({ agent: "fake-second", stint: stint.id });
  expect(nextPreview.prompt).toContain(`Last handoff (${stint.id}, fake-second)`);
});

test("the WebSocket snapshot attributes a completed stint and handoff to the registered second agent", async () => {
  const { project, tracked } = await fixture(secondAgentRegistry());
  const server = await project.start();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const url = `http://127.0.0.1:${address.port}`;
  const socket = new WebSocket(`${url.replace("http", "ws")}/api/live`);
  tracked.socket = socket;
  const snapshots: ProjectSnapshot[] = [];
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if ("workItems" in message) snapshots.push(message);
  });
  await once(socket, "open");
  const response = await fetch(`${url}/api/stints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "fake-second" }),
  });
  expect(response.status).toBe(201);
  await expect.poll(() => snapshots.at(-1)?.workItems[0].stints[0]?.status).toBe("finished");
  expect(snapshots.at(-1)?.workItems[0].stints[0]).toMatchObject({
    agent: "fake-second",
    handoff: { agent: "fake-second" },
  });
});
