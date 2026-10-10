import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createAgentRegistry,
  createGrokAgent,
  grokProfile,
  type AgentLauncher,
} from "@stintwork/agents";
import { createFakeAgentLauncher } from "@stintwork/agents/testing";
import type { Brief, ProjectSnapshot, Stint } from "@stintwork/core";
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
const launch = createFakeAgentLauncher(
  [
    { type: "expect-prompt", includes: "/implement" },
    { type: "write", path: "greeting.txt", content: "Hello from Grok" },
  ],
  [{ type: "message", text: handoff }],
  { profile: "grok" },
);

async function fixture(config?: string, launcher: AgentLauncher = launch, inspect = true) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-grok-server-"));
  const root = join(parent, "project");
  const configPath = join(parent, "grok-config.toml");
  if (config !== undefined) await writeFile(configPath, config);
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  for (const [path, content] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    ".gitignore": ".stintwork/local/\n",
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/01-first.md":
      "# First ticket\nStatus: ready-for-agent\nBlocked by: none",
    ".scratch/first/workflow.yaml":
      "workflow: feature\nstage: implement\nstages:\n  implement:\n    agent: grok\n",
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
  const agentRegistry = createAgentRegistry([
    inspect
      ? createGrokAgent({ configPath, launch: launcher })
      : { ...grokProfile, launch: launcher },
  ]);
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry,
    handoffTimeoutMs: 1000,
  });
  const tracked = { parent, project, socket: undefined as WebSocket | undefined };
  fixtures.push(tracked);
  return { root, configPath, project, agentRegistry, tracked };
}
afterEach(async () => {
  for (const { parent, project, socket } of fixtures.splice(0)) {
    socket?.terminate();
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});
function start(project: ReturnType<typeof createProjectServer>) {
  return project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "grok" }),
  });
}
async function snapshot(project: ReturnType<typeof createProjectServer>): Promise<ProjectSnapshot> {
  return (await project.app.request("/api/project")).json();
}

test("a Grok-profile stint streams work, finishes with a handoff and checkpoint, and resumes after restart", async () => {
  const { root, project, agentRegistry, tracked } = await fixture();
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  expect(stint).toMatchObject({ agent: "grok", ticket: 1 });
  await expect
    .poll(async () => (await snapshot(project)).workItems[0].stints[0]?.status)
    .toBe("finished");
  const history: { stint: Stint } = await (
    await project.app.request(`/api/stints/${stint.id}`)
  ).json();
  expect(history.stint).toMatchObject({
    agent: "grok",
    status: "finished",
    checkpointCommit: expect.any(String),
    handoff: { agent: "grok", stint: stint.id, stoppedAt: "Wrote greeting." },
  });
  expect(await readFile(join(stint.worktree.path, "greeting.txt"), "utf8")).toBe("Hello from Grok");
  expect(
    execFileSync("git", ["show", `${history.stint.checkpointCommit}:greeting.txt`], {
      cwd: stint.worktree.path,
      encoding: "utf8",
    }),
  ).toBe("Hello from Grok");
  await project.stop();
  tracked.project = createProjectServer(root, join(root, "web"), { agentRegistry });
  const preview: Brief = await (
    await tracked.project.app.request("/api/work-items/first/tickets/1/brief-preview")
  ).json();
  expect(preview).toMatchObject({ agent: "grok", lastHandoff: { agent: "grok", stint: stint.id } });
});

test("every Grok brief preview warns about the current always-approve config without changing it", async () => {
  const config = '# Developer preference\npermission_mode = "always-approve"\n';
  const { configPath, project } = await fixture(config);
  for (const url of [
    "/api/work-items/first/brief-preview",
    "/api/work-items/first/tickets/1/brief-preview",
  ]) {
    const response = await project.app.request(url);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      agent: "grok",
      warnings: [expect.stringContaining("Grok won’t ask for permissions")],
    });
  }
  expect(await readFile(configPath, "utf8")).toBe(config);
  const { agents } = await (await project.app.request("/api/agents")).json();
  expect(agents[0]).toMatchObject({
    capabilities: {
      modes: [],
      permissionMode: "always-approve",
      configOptions: ["model", "reasoning_effort"],
    },
  });
  await writeFile(configPath, 'permission_mode = "manual"');
  const preview: Brief = await (
    await project.app.request("/api/work-items/first/brief-preview")
  ).json();
  expect(preview.warnings).toEqual([]);
});

test("a missing Grok login refuses a start before creating a worktree and clears after external login", async () => {
  let authRequired = true;
  const { root, project } = await fixture(undefined, (options) =>
    createFakeAgentLauncher([], [], { profile: "grok", authRequired })(options),
  );
  const response = await start(project);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ reason: expect.stringContaining("grok login") });
  const attention = (await snapshot(project)).attentionItems;
  expect(attention).toEqual([
    expect.objectContaining({
      kind: "login-required",
      agent: "grok",
      workItem: null,
      loginCommand: "grok login",
    }),
  ]);
  await project.app.request("/api/agents");
  expect((await snapshot(project)).attentionItems).toEqual(attention);
  await expect(readdir(join(root, ".stintwork/local/stints"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(
    execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: root, encoding: "utf8" }).match(
      /^worktree /gm,
    ),
  ).toHaveLength(1);
  authRequired = false;
  await project.app.request("/api/agents");
  expect((await snapshot(project)).attentionItems).toEqual([]);
});

test("Authentication required from an actual Grok stint is logged and rebuilds a login attention item after restart", async () => {
  const { root, project, agentRegistry, tracked } = await fixture(
    undefined,
    createFakeAgentLauncher([], [], { profile: "grok", authRequired: true }),
    false,
  );
  const response = await start(project);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ reason: expect.stringContaining("grok login") });
  const before = await snapshot(project);
  expect(before.workItems[0].stints[0]).toMatchObject({
    agent: "grok",
    status: "failed",
    error: expect.stringContaining("grok login"),
  });
  expect(before.attentionItems).toEqual([
    expect.objectContaining({
      kind: "login-required",
      workItem: "first",
      ticket: 1,
      stintId: before.workItems[0].stints[0].id,
      loginCommand: "grok login",
    }),
  ]);
  await project.stop();
  tracked.project = createProjectServer(root, join(root, "web"), { agentRegistry });
  expect((await snapshot(tracked.project)).attentionItems).toEqual(before.attentionItems);
});

test("a successful availability recheck clears authentication lost between the probe and actual stint", async () => {
  let authRequired = true;
  const { project } = await fixture(undefined, (options) =>
    createFakeAgentLauncher([], [], {
      profile: "grok",
      authRequired: options.checkAvailability ? false : authRequired,
    })(options),
  );
  expect((await start(project)).status).toBe(503);
  expect((await snapshot(project)).attentionItems[0]?.kind).toBe("login-required");
  authRequired = false;
  await project.app.request("/api/agents");
  expect((await snapshot(project)).attentionItems).toEqual([]);
});

test("a Grok login attention item arrives and clears in live HTTP/WebSocket snapshots", async () => {
  let authRequired = true;
  const { project, tracked } = await fixture(undefined, (options) =>
    createFakeAgentLauncher([], [], { profile: "grok", authRequired })(options),
  );
  const server = await project.start();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const url = `http://127.0.0.1:${address.port}`;
  tracked.socket = new WebSocket(`${url.replace("http", "ws")}/api/live`);
  const snapshots: ProjectSnapshot[] = [];
  tracked.socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if ("workItems" in message) snapshots.push(message);
  });
  await once(tracked.socket, "open");
  await fetch(`${url}/api/agents`);
  await expect.poll(() => snapshots.at(-1)?.attentionItems[0]?.kind).toBe("login-required");
  authRequired = false;
  await fetch(`${url}/api/agents`);
  await expect.poll(() => snapshots.at(-1)?.attentionItems).toEqual([]);
});
