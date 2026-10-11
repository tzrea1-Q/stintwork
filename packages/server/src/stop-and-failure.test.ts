// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher, type FakeAgentStep } from "@stintwork/agents/testing";
import {
  foldStintLog,
  type ProjectSnapshot,
  type Stint,
  type StintLiveMessage,
  type StintLogEntry,
  type StintSummary,
} from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { createProjectServer } from "./index.js";

const handoffText =
  "## Where I stopped\nPartial work.\n## Unresolved\nChecks.\n## Suggested next\nContinue.";
const permission: FakeAgentStep = {
  type: "permission",
  toolCall: { toolCallId: "work", title: "Commit work" },
  options: [
    { optionId: "allow", name: "Allow", kind: "allow_once" },
    { optionId: "reject", name: "Decline", kind: "reject_once" },
  ],
};
const fixtures: {
  parent: string;
  project: ReturnType<typeof createProjectServer>;
  socket?: WebSocket;
}[] = [];

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function fixture(
  work: readonly FakeAgentStep[],
  handoff: readonly FakeAgentStep[] = [{ type: "message", text: handoffText }],
) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-stop-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  git(root, "config", "user.name", "Developer");
  git(root, "config", "user.email", "developer@example.invalid");
  for (const [path, content] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    "AGENTS.md": "Project conventions",
    ".gitignore": ".stintwork/local/\n",
    ".scratch/first/workflow.yaml":
      "workflow: feature\nstage: implement\nstages:\n  implement:\n    agent: codex\n",
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/05-stop.md": "# Stop\nStatus: ready-for-agent\nBlocked by: none",
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const project = createProjectServer(root, join(root, "web"), {
    launchAgent: createFakeAgentLauncher(work, handoff),
    handoffTimeoutMs: 1000,
  });
  const tracked = { parent, project, socket: undefined as WebSocket | undefined };
  fixtures.push(tracked);
  return { root, project, tracked, base: git(root, "rev-parse", "HEAD") };
}

afterEach(async () => {
  for (const { parent, project, socket } of fixtures.splice(0)) {
    socket?.terminate();
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});

async function start(project: ReturnType<typeof createProjectServer>) {
  const response = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 5, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { stint: Stint }).stint;
}

async function entries(root: string, id: string): Promise<StintLogEntry[]> {
  return (await readFile(join(root, `.stintwork/local/stints/${id}.jsonl`), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

async function waitForEvent(root: string, id: string, type: string) {
  await expect
    .poll(
      async () =>
        foldStintLog(await entries(root, id))?.events.some((event) => event.type === type),
      { timeout: 10_000, interval: 20 },
    )
    .toBe(true);
}

async function ended(
  project: ReturnType<typeof createProjectServer>,
  id: string,
  timeout = 10_000,
) {
  let stint: StintSummary | undefined;
  await expect
    .poll(
      async () => {
        const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
        stint = snapshot.workItems[0].stints.find((candidate) => candidate.id === id);
        return stint?.endedAt;
      },
      { timeout, interval: 20 },
    )
    .toBeTruthy();
  return stint as StintSummary;
}

function answer(
  project: ReturnType<typeof createProjectServer>,
  id: string,
  requestId: string,
  optionId: string,
) {
  return project.app.request(`/api/stints/${id}/permissions/${requestId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optionId }),
  });
}

test.each(["HTTP", "WebSocket"])(
  "Stop mid-turn ends stopped within two seconds with a handoff and checkpoint (%s)",
  async (transport) => {
    const { root, project, tracked, base } = await fixture(
      [
        { type: "write", path: "partial.txt", content: "Partial work" },
        { type: "message", text: "Working" },
        { type: "hang" },
        { type: "write", path: "late.txt", content: "Must not happen" },
      ],
      [
        { type: "expect-prompt", includes: "## Where I stopped" },
        { type: "write", path: "handoff.txt", content: "Handoff artifact" },
        { type: "message", text: handoffText },
      ],
    );
    const messages: StintLiveMessage[] = [];
    let url: string | undefined;
    if (transport === "WebSocket") {
      const server = await project.start();
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected TCP address");
      url = `http://127.0.0.1:${address.port}`;
      const socket = new WebSocket(`${url.replace("http", "ws")}/api/live`);
      tracked.socket = socket;
      socket.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "stint") messages.push(message);
      });
      await once(socket, "open");
    }
    const started = await start(project);
    await waitForEvent(root, started.id, "message");
    const beforeStop = performance.now();
    const path = `/api/stints/${started.id}/stop`;
    const response = url
      ? await fetch(`${url}${path}`, { method: "POST" })
      : await project.app.request(path, { method: "POST" });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ stintId: started.id });
    const stint = await ended(project, started.id, 2000);
    expect(performance.now() - beforeStop).toBeLessThan(2000);
    expect(stint).toMatchObject({
      status: "stopped",
      checkpointCommit: expect.any(String),
      handoff: {
        stint: started.id,
        agent: "codex",
        stoppedAt: "Partial work.",
        unresolved: "Checks.",
        nextStep: "Continue.",
      },
    });
    expect(stint.error).toBeUndefined();
    expect(git(started.worktree.path, "rev-list", "--count", `${base}..HEAD`)).toBe("1");
    expect(git(root, "show", `${stint.checkpointCommit}:partial.txt`)).toBe("Partial work");
    expect(git(root, "show", `${stint.checkpointCommit}:handoff.txt`)).toBe("Handoff artifact");
    expect(
      git(root, "show", "--no-patch", "--format=%B", stint.checkpointCommit as string),
    ).toContain("stopped");
    await expect(readFile(join(started.worktree.path, "late.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    const log = await entries(root, started.id);
    expect(log.at(-1)).toMatchObject({ type: "ended", status: "stopped", stopReason: "cancelled" });
    if (url) {
      await expect.poll(() => messages.at(-1)?.entry.type).toBe("ended");
      expect(messages.map(({ sequence }) => sequence)).toEqual(
        messages.map((_message, index) => index + 1),
      );
      expect(messages.map(({ entry }) => entry)).toEqual(log);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await entries(root, started.id)).toEqual(log);
    expect((await project.app.request(path, { method: "POST" })).status).toBe(409);
  },
);

test("Stop settles a pending work permission but still allows a handoff permission", async () => {
  const { root, project } = await fixture(
    [{ type: "write", path: "partial.txt", content: "Partial" }, permission],
    [
      { ...permission, toolCall: { toolCallId: "handoff" } },
      { type: "message", text: handoffText },
    ],
  );
  const started = await start(project);
  await waitForEvent(root, started.id, "permission_request");
  const workRequest = foldStintLog(await entries(root, started.id))?.events.find(
    (event) => event.type === "permission_request",
  );
  if (workRequest?.type !== "permission_request") throw new Error("Expected work permission");
  expect(
    (await project.app.request(`/api/stints/${started.id}/stop`, { method: "POST" })).status,
  ).toBe(202);
  expect((await answer(project, started.id, workRequest.requestId, "allow")).status).toBe(409);
  let handoffRequestId = "";
  await expect
    .poll(async () => {
      const request = foldStintLog(await entries(root, started.id))?.events.find(
        (event) => event.type === "permission_request" && event.toolCallId === "handoff",
      );
      if (request?.type === "permission_request") handoffRequestId = request.requestId;
      return handoffRequestId;
    })
    .toBeTruthy();
  expect((await answer(project, started.id, handoffRequestId, "allow")).status).toBe(200);
  expect(await ended(project, started.id)).toMatchObject({
    status: "stopped",
    checkpointCommit: expect.any(String),
    handoff: { stoppedAt: "Partial work." },
  });
  expect(foldStintLog(await entries(root, started.id))?.events).toContainEqual(
    expect.objectContaining({
      type: "permission",
      requestId: workRequest.requestId,
      decision: { outcome: "cancelled" },
    }),
  );
});

test("Stop rejects foreign origins and unknown stints; repeating an accepted Stop does not cancel the handoff", async () => {
  const { root, project } = await fixture(
    [{ type: "message", text: "Working" }, { type: "hang" }],
    [
      { type: "message", text: handoffText },
      { type: "delay", milliseconds: 300 },
    ],
  );
  expect((await project.app.request("/api/stints/missing/stop", { method: "POST" })).status).toBe(
    409,
  );
  const started = await start(project);
  await waitForEvent(root, started.id, "message");
  const path = `/api/stints/${started.id}/stop`;
  expect(
    (
      await project.app.request(path, {
        method: "POST",
        headers: { Origin: "https://foreign.invalid" },
      })
    ).status,
  ).toBe(403);
  expect((await entries(root, started.id)).at(-1)?.type).toBe("event");
  expect((await project.app.request(path, { method: "POST" })).status).toBe(202);
  expect((await project.app.request(path, { method: "POST" })).status).toBe(202);
  expect(await ended(project, started.id)).toMatchObject({
    status: "stopped",
    handoff: { stoppedAt: "Partial work." },
  });
});

test("an uncooperative agent is stopped promptly and checkpointed without a usable handoff", async () => {
  const { root, project } = await fixture([
    { type: "write", path: "partial.txt", content: "Partial" },
    { type: "message", text: "Working" },
    { type: "hang", ignoreCancellation: true },
  ]);
  const started = await start(project);
  await waitForEvent(root, started.id, "message");
  const beforeStop = performance.now();
  expect(
    (await project.app.request(`/api/stints/${started.id}/stop`, { method: "POST" })).status,
  ).toBe(202);
  const stint = await ended(project, started.id, 2000);
  expect(performance.now() - beforeStop).toBeLessThan(2000);
  expect(stint).toMatchObject({
    status: "stopped",
    handoff: null,
    checkpointCommit: expect.any(String),
  });
  expect(git(root, "show", `${stint.checkpointCommit}:partial.txt`)).toBe("Partial");
});

test.each([
  {
    step: { type: "crash" } as FakeAgentStep,
    error: /Codex exited|(?:ACP transport|ACP connection) closed/,
  },
  { step: { type: "error", message: "ACP work error" } as FakeAgentStep, error: /ACP work error/ },
  { step: { type: "end", stopReason: "max_tokens" } as FakeAgentStep, error: /max_tokens/ },
])(
  "an agent failure ($step.type) records the error and still checkpoints partial work",
  async ({ step, error }) => {
    const { root, project } = await fixture([
      { type: "write", path: "partial.txt", content: "Partial before failure" },
      { type: "message", text: "Working" },
      step,
    ]);
    const started = await start(project);
    const stint = await ended(project, started.id);
    expect(stint).toMatchObject({
      status: "failed",
      error: expect.stringMatching(error),
      checkpointCommit: expect.any(String),
    });
    if (step.type !== "end") expect(stint.handoff).toBeNull();
    expect(git(root, "show", `${stint.checkpointCommit}:partial.txt`)).toBe(
      "Partial before failure",
    );
    expect(
      git(root, "show", "--no-patch", "--format=%B", stint.checkpointCommit as string),
    ).toContain("failed");
    expect((await entries(root, started.id)).at(-1)).toMatchObject({
      type: "ended",
      status: "failed",
      error: expect.stringMatching(error),
    });
  },
);

test("declining a permission is agent-initiated cancellation and remains finished", async () => {
  const { root, project } = await fixture([permission]);
  const started = await start(project);
  await waitForEvent(root, started.id, "permission_request");
  const request = foldStintLog(await entries(root, started.id))?.events.find(
    (event) => event.type === "permission_request",
  );
  if (request?.type !== "permission_request") throw new Error("Expected permission");
  expect((await answer(project, started.id, request.requestId, "reject")).status).toBe(200);
  expect(await ended(project, started.id)).toMatchObject({
    status: "finished",
    handoff: { stoppedAt: "Partial work." },
  });
  expect((await entries(root, started.id)).at(-1)).toMatchObject({
    type: "ended",
    status: "finished",
    stopReason: "cancelled",
  });
});
