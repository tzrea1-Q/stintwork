// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createAgentRegistry,
  createClaudeCodeAgent,
  type RegisteredAgent,
} from "@stintwork/agents";
import {
  createFakeAgentLauncher,
  fakeAgentProfiles,
  type FakeAgentStep,
} from "@stintwork/agents/testing";
import type { Brief, ProjectSnapshot, Stint } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { createProjectServer } from "./index.js";

const handoff =
  "## Where I stopped\nWrote greeting.\n## Unresolved\nNone.\n## Suggested next\nReview.";
const fixtures: {
  parent: string;
  project: ReturnType<typeof createProjectServer>;
  socket?: WebSocket;
}[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
async function fixture(
  agent: RegisteredAgent = {
    ...fakeAgentProfiles.claude,
    launch: createFakeAgentLauncher(
      [
        { type: "expect-prompt", includes: ".scratch/first/issues/01-first.md" },
        {
          type: "permission",
          toolCall: { toolCallId: "yes", title: "Write greeting", kind: "edit" },
          expectedOptionId: "allow-once",
        },
        { type: "message", text: "Yes received" },
        {
          type: "permission",
          toolCall: { toolCallId: "no", title: "Do something else", kind: "execute" },
          expectedOptionId: "reject",
        },
        { type: "message", text: "No received; continuing" },
        { type: "write", path: "greeting.txt", content: "Hello from Claude" },
      ],
      [{ type: "message", text: handoff }],
      { profile: "claude", verifyGitDirectories: true },
    ),
  },
) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-claude-"));
  const root = join(parent, "project");
  git(parent, "init", "--quiet", "--initial-branch=main", root);
  git(root, "config", "user.name", "Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  for (const [path, content] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    "AGENTS.md": "Project instructions",
    ".gitignore": ".stintwork/local/\n",
    ".scratch/first/spec.md": "# First",
    ".scratch/first/workflow.yaml":
      "workflow: feature\nstage: implement\nstages:\n  implement:\n    agent: claude\n",
    ".scratch/first/issues/01-first.md":
      "# First ticket\nStatus: ready-for-agent\nBlocked by: none",
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const agentRegistry = createAgentRegistry([agent]);
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry,
    handoffTimeoutMs: 2000,
  });
  const tracked = { parent, project, socket: undefined as WebSocket | undefined };
  fixtures.push(tracked);
  return { parent, root, project, tracked, agentRegistry };
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
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "claude" }),
  });
}
async function snapshot(project: ReturnType<typeof createProjectServer>): Promise<ProjectSnapshot> {
  return (await project.app.request("/api/project")).json();
}

test("a Claude stint accepts Yes and No without ending on decline, then saves its handoff, checkpoint and history", async () => {
  const { root, project, tracked, agentRegistry } = await fixture();
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  for (const [title, optionId] of [
    ["Write greeting", "allow-once"],
    ["Do something else", "reject"],
  ]) {
    await expect
      .poll(
        async () =>
          (await snapshot(project)).attentionItems.find((item) => item.title === title)?.kind,
      )
      .toBe("permission");
    const item = (await snapshot(project)).attentionItems.find((item) => item.title === title);
    if (item?.kind !== "permission") throw new Error("Expected a pending permission.");
    expect(item.agent).toBe("claude");
    expect(item.options.map((option) => option.name)).toEqual(["Yes", "No"]);
    const answered = await project.app.request(
      `/api/stints/${stint.id}/permissions/${item.requestId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      },
    );
    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual({ requestId: item.requestId, optionId });
  }
  await expect
    .poll(async () => (await snapshot(project)).workItems[0].stints[0]?.status)
    .toBe("finished");
  const history: { stint: Stint } = await (
    await project.app.request(`/api/stints/${stint.id}`)
  ).json();
  expect(history.stint).toMatchObject({
    agent: "claude",
    status: "finished",
    handoff: { agent: "claude", stint: stint.id, stoppedAt: "Wrote greeting." },
  });
  expect(history.stint.events.filter((event) => event.type === "permission")).toMatchObject([
    { decision: { optionId: "allow-once", kind: "allow_once" } },
    { decision: { optionId: "reject", kind: "reject_once" } },
  ]);
  expect(history.stint.events).toContainEqual(
    expect.objectContaining({ type: "message", text: "No received; continuing" }),
  );
  expect(git(stint.worktree.path, "show", `${history.stint.checkpointCommit}:greeting.txt`)).toBe(
    "Hello from Claude",
  );
  expect(git(stint.worktree.path, "status", "--porcelain")).toBe("");
  expect((await snapshot(project)).attentionItems).toEqual([]);
  await project.stop();
  tracked.project = createProjectServer(root, join(root, "web"), { agentRegistry });
  expect((await snapshot(tracked.project)).workItems[0].stints[0]).toMatchObject(
    history.stint.handoff
      ? {
          id: stint.id,
          handoff: history.stint.handoff,
          checkpointCommit: history.stint.checkpointCommit,
        }
      : {},
  );
  const brief: Brief = await (
    await tracked.project.app.request("/api/work-items/first/tickets/1/brief-preview")
  ).json();
  expect(brief.agent).toBe("claude");
  expect(brief.lastHandoff).toEqual(history.stint.handoff);
  expect(brief.prompt).toContain(`Last handoff (${stint.id}, claude)`);
});

test.each([true, false])(
  "Claude ACP auth refusal (structured=%s) fills availability and creates a login attention item",
  async (structured) => {
    const agent = {
      ...fakeAgentProfiles.claude,
      availability: { available: true },
      detectAvailability: async () => ({ available: true }),
      launch: createFakeAgentLauncher([], [], {
        profile: "claude",
        ...(structured ? { authRequired: true } : { startupError: "Authentication required" }),
      }),
    };
    const { project } = await fixture(agent);
    const response = await start(project);
    expect(response.status).toBe(503);
    const refusal = await response.json();
    expect(refusal.reason).toContain("claude auth login");
    const projectSnapshot = await snapshot(project);
    expect(projectSnapshot.agents[0].availability).toMatchObject({
      available: false,
      kind: "login-required",
      reason: refusal.reason,
    });
    expect(projectSnapshot.attentionItems).toMatchObject([
      {
        kind: "login-required",
        agent: "claude",
        loginCommand: "claude auth login",
        details: refusal.reason,
      },
    ]);
    expect(projectSnapshot.workItems[0].stints[0]).toMatchObject({
      status: "failed",
      error: refusal.reason,
      checkpointCommit: expect.any(String),
    });
    const again = await start(project);
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual(refusal);
    expect((await snapshot(project)).workItems[0].stints).toHaveLength(1);
  },
);

test("cached logged-out detection refuses before writes; explicit refresh clears login attention and enables a stint", async () => {
  const envDirectory = await mkdtemp(join(tmpdir(), "stintwork-claude-stub-"));
  const state = join(envDirectory, "logged-in");
  const checks = join(envDirectory, "checks");
  const executable = join(envDirectory, "claude");
  await writeFile(state, "false");
  await writeFile(
    executable,
    `#!${process.execPath}\nconst fs = require("node:fs");
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["auth", "status", "--json"])) process.exit(2);
fs.appendFileSync(${JSON.stringify(checks)}, "checked\\n");
const loggedIn = fs.readFileSync(${JSON.stringify(state)}, "utf8") === "true";
console.log(JSON.stringify({ loggedIn, privateField: "do-not-publish" })); process.exit(loggedIn ? 0 : 1);\n`,
  );
  await chmod(executable, 0o755);
  try {
    const agent = {
      ...createClaudeCodeAgent({ PATH: envDirectory }),
      launch: createFakeAgentLauncher([], [{ type: "message", text: handoff }], {
        profile: "claude",
      }),
    };
    const { root, project } = await fixture(agent);
    const response = await start(project);
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toContain("claude auth login");
    await expect(readdir(join(root, ".stintwork/local/stints"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(git(root, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
    expect(git(root, "status", "--porcelain")).toBe("");
    expect((await snapshot(project)).attentionItems[0].kind).toBe("login-required");
    await writeFile(state, "true");
    const cached = await project.app.request("/api/agents");
    expect(cached.headers.get("Cache-Control")).toBe("no-store");
    expect((await cached.json()).agents[0].availability.available).toBe(false);
    expect(await readFile(checks, "utf8")).toBe("checked\n");
    const refreshed = await project.app.request("/api/agents?refresh=true");
    const description = await refreshed.json();
    expect(description.agents[0].availability.available).toBe(true);
    expect(JSON.stringify(description)).not.toContain("do-not-publish");
    expect((await snapshot(project)).attentionItems).toEqual([]);
    expect((await start(project)).status).toBe(201);
    await expect
      .poll(async () => (await snapshot(project)).workItems[0].stints[0]?.status)
      .toBe("finished");
  } finally {
    await rm(envDirectory, { recursive: true, force: true });
  }
});

test("WebSocket snapshots publish login attention and its removal after availability refresh", async () => {
  let loggedIn = false;
  const { project, tracked } = await fixture({
    ...fakeAgentProfiles.claude,
    launch: createFakeAgentLauncher([], [], { profile: "claude" }),
    detectAvailability: async () =>
      loggedIn
        ? { available: true }
        : {
            available: false,
            kind: "login-required",
            checkedAt: "2026-10-09T10:00:00Z",
            reason: "Sign in with claude auth login.",
          },
  });
  const server = await project.start();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address.");
  const url = `http://127.0.0.1:${address.port}`;
  const socket = new WebSocket(`${url.replace("http", "ws")}/api/live`);
  tracked.socket = socket;
  const snapshots: ProjectSnapshot[] = [];
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if ("workItems" in message) snapshots.push(message);
  });
  await once(socket, "open");
  await expect.poll(() => snapshots.at(-1)?.attentionItems[0]?.kind).toBe("login-required");
  loggedIn = true;
  expect((await fetch(`${url}/api/agents?refresh=true`)).status).toBe(200);
  await expect.poll(() => snapshots.at(-1)?.attentionItems).toEqual([]);
});

test("stopping Claude preserves handoff retry and checkpoint behaviour", async () => {
  const script: FakeAgentStep[] = [
    { type: "write", path: "partial.txt", content: "Partial" },
    { type: "hang" },
  ];
  const { project } = await fixture({
    ...fakeAgentProfiles.claude,
    launch: createFakeAgentLauncher(script, [{ type: "message", text: handoff }], {
      profile: "claude",
      handoffFailures: 1,
    }),
  });
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  await expect
    .poll(async () => readFile(join(stint.worktree.path, "partial.txt"), "utf8").catch(() => ""))
    .toBe("Partial");
  expect(
    (await project.app.request(`/api/stints/${stint.id}/stop`, { method: "POST" })).status,
  ).toBe(202);
  await expect
    .poll(async () => (await snapshot(project)).workItems[0].stints[0]?.status)
    .toBe("stopped");
  expect((await snapshot(project)).workItems[0].stints[0]).toMatchObject({
    checkpointCommit: expect.any(String),
    handoff: { agent: "claude", stoppedAt: "Wrote greeting." },
  });
});
