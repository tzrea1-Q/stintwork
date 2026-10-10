import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createAgentLauncher, type AgentLauncher, type AgentStintOptions } from "@stintwork/agents";
import { createFakeAgentLauncher, type FakeAgentStep } from "@stintwork/agents/testing";
import type { Stint, StintLiveMessage, StintLogEntry, ProjectSnapshot } from "@stintwork/core";
import { Hono } from "hono";
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { createProjectServer } from "./index.js";
import { addStintPermissionRoute } from "./stint-permissions.js";

const fixtures: {
  parent: string;
  project: ReturnType<typeof createProjectServer>;
  socket?: WebSocket;
}[] = [];
const permission: FakeAgentStep = {
  type: "permission",
  toolCall: { toolCallId: "command", title: "Check the project", kind: "execute" },
  options: [
    { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
    { optionId: "allow_always", name: "Allow always", kind: "allow_always" },
    { optionId: "cancel", name: "No", kind: "reject_once" },
  ],
};

async function fixture(launchAgent: AgentLauncher) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-permission-server-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  for (const [path, text] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    "AGENTS.md": "Project conventions",
    ".gitignore": ".stintwork/local/\n",
    ".scratch/first/workflow.yaml": "workflow: feature\nstage: implement\n",
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/01-first.md": "# First\nStatus: ready-for-agent\nBlocked by: none",
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync(
    "git",
    ["-c", "user.name=Tests", "-c", "user.email=tests@example.invalid", "commit", "-qm", "Fixture"],
    { cwd: root },
  );
  const project = createProjectServer(root, join(root, "web"), { launchAgent });
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

async function post(app: Hono, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function start(project: ReturnType<typeof createProjectServer>) {
  const response = await post(project.app, "/api/stints", {
    workItem: "first",
    ticket: 1,
    agent: "codex",
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { stint: Stint }).stint;
}

async function history(project: ReturnType<typeof createProjectServer>, stintId: string) {
  return ((await (await project.app.request(`/api/stints/${stintId}`)).json()) as { stint: Stint })
    .stint;
}

async function pending(project: ReturnType<typeof createProjectServer>, stintId: string) {
  let requestId = "";
  await expect
    .poll(async () => {
      const stint = await history(project, stintId);
      const request = stint.events.find(
        (event) =>
          event.type === "permission_request" &&
          !stint.events.some(
            (decision) => decision.type === "permission" && decision.requestId === event.requestId,
          ),
      );
      if (request?.type === "permission_request") requestId = request.requestId;
      return requestId;
    })
    .not.toBe("");
  return requestId;
}

async function decisions(root: string, stintId: string, requestId: string) {
  const entries: StintLogEntry[] = (
    await readFile(join(root, `.stintwork/local/stints/${stintId}.jsonl`), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return entries.filter(
    (entry) =>
      entry.type === "event" &&
      entry.event.type === "permission" &&
      entry.event.requestId === requestId,
  );
}

const cycles = Array.from({ length: 20 }, (_value, index) => {
  const optionId = index % 2 ? "allow_always" : "allow_once";
  return { optionId, marker: `The agent received ${optionId} for permission ${index}.` };
});
const script: FakeAgentStep[] = cycles.flatMap(({ optionId, marker }) => [
  { ...permission, expectedOptionId: optionId },
  { type: "message", text: marker },
]);

test("twenty answers each log exactly one decision before success and reach the fake ACP agent", async () => {
  const { root, project } = await fixture(createFakeAgentLauncher(script));
  const stint = await start(project);
  for (const { optionId, marker } of cycles) {
    const requestId = await pending(project, stint.id);
    const path = `/api/stints/${stint.id}/permissions/${requestId}`;
    const answer = await post(project.app, path, { optionId });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ requestId, optionId });
    expect(await decisions(root, stint.id, requestId)).toMatchObject([
      { type: "event", event: { decision: { outcome: "selected", optionId } } },
    ]);
    const duplicate = await post(project.app, path, { optionId });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      reason: expect.stringContaining("already answered"),
    });
    await expect
      .poll(async () =>
        (await history(project, stint.id)).events.some(
          (event) => event.type === "message" && event.text === marker,
        ),
      )
      .toBe(true);
  }
  await expect.poll(async () => (await history(project, stint.id)).status).toBe("finished");
});

test("real HTTP answers sent immediately on WebSocket request events reach the agent twenty times", async () => {
  const { root, project, tracked } = await fixture(createFakeAgentLauncher(script));
  const server = await project.start();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address.");
  const url = `http://127.0.0.1:${address.port}`;
  const socket = new WebSocket(`${url.replace("http", "ws")}/api/live`);
  tracked.socket = socket;
  const answers: Promise<void>[] = [];
  let ended: (() => void) | undefined;
  const completion = new Promise<void>((resolve) => {
    ended = resolve;
  });
  let permissionIndex = 0;
  socket.on("message", (data) => {
    const message: StintLiveMessage = JSON.parse(data.toString());
    if (message.type !== "stint") return;
    if (message.entry.type === "ended") ended?.();
    if (message.entry.type !== "event" || message.entry.event.type !== "permission_request") return;
    const requestId = message.entry.event.requestId;
    const optionId = cycles[permissionIndex++].optionId;
    const answer = (async () => {
      const response = await fetch(
        `${url}/api/stints/${message.stintId}/permissions/${requestId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId }),
        },
      );
      expect(response.status).toBe(200);
      expect(await decisions(root, message.stintId, requestId)).toMatchObject([
        { type: "event", event: { decision: { outcome: "selected", optionId } } },
      ]);
    })();
    void answer.catch(() => {});
    answers.push(answer);
  });
  await once(socket, "open");
  const response = await fetch(`${url}/api/stints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  await completion;
  await Promise.all(answers);
  expect(answers).toHaveLength(20);
  const recorded = await history(project, stint.id);
  expect(recorded.status).toBe("finished");
  expect(
    recorded.events
      .filter((event) => event.type === "message" && event.text.startsWith("The agent received "))
      .map((event) => "text" in event && event.text),
  ).toEqual(cycles.map(({ marker }) => marker));
});

test("ending a waiting stint removes its pending request and rejects late and unknown answers", async () => {
  const { project } = await fixture(createFakeAgentLauncher([permission]));
  const stint = await start(project);
  const requestId = await pending(project, stint.id);
  expect((await post(project.app, `/api/stints/${stint.id}/stop`, {})).status).toBe(202);
  await expect.poll(async () => (await history(project, stint.id)).status).toBe("stopped");
  const answer = await post(project.app, `/api/stints/${stint.id}/permissions/${requestId}`, {
    optionId: "allow_once",
  });
  expect(answer.status).toBe(409);
  expect(await answer.json()).toMatchObject({ reason: expect.stringContaining("stint has ended") });
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.workItems[0].activeStint).toBeNull();
  expect((await history(project, stint.id)).events).toContainEqual(
    expect.objectContaining({ type: "permission", requestId, decision: { outcome: "cancelled" } }),
  );
  const unknown = await post(project.app, `/api/stints/${stint.id}/permissions/unknown`, {
    optionId: "allow_once",
  });
  expect(unknown.status).toBe(409);
  expect(await unknown.json()).toMatchObject({
    reason: expect.stringContaining("stint has ended"),
  });
});

test("a decision log failure is an error, never a successful answer", async () => {
  const base = createFakeAgentLauncher([permission]);
  const { project } = await fixture((options) =>
    base({
      ...options,
      onEvent(event) {
        if (event.type === "permission" && event.decision.outcome === "selected")
          throw new Error("Permission log is unavailable.");
        options.onEvent(event);
      },
    }),
  );
  const stint = await start(project);
  const requestId = await pending(project, stint.id);
  const answer = await post(project.app, `/api/stints/${stint.id}/permissions/${requestId}`, {
    optionId: "allow_once",
  });
  expect(answer.status).toBe(503);
  expect(await answer.json()).toEqual({ reason: "Permission log is unavailable." });
  await expect.poll(async () => (await history(project, stint.id)).status).toBe("failed");
});

test("a broken agent pipe returns an error even when the selected decision was logged", async () => {
  const launcher = createAgentLauncher((cwd) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        createRequire(import.meta.url).resolve("tsx"),
        fileURLToPath(new URL("../../agents/src/fake-agent.ts", import.meta.url)),
      ],
      {
        cwd,
        stdio: "pipe",
        env: {
          ...process.env,
          STINTWORK_FAKE_SCRIPT: JSON.stringify([
            permission,
            { type: "message", text: "Must not receive a failed answer." },
          ]),
          STINTWORK_FAKE_HANDOFF: "[]",
          STINTWORK_FAKE_OPTIONS: "{}",
        },
      },
    );
    const input = child.stdin;
    child.stdin = new Writable({
      write(chunk, encoding, callback) {
        if (chunk.toString().includes('"outcome":"selected"'))
          callback(new Error("Agent pipe is closed."));
        else input.write(chunk, encoding, callback);
      },
    });
    child.stdin.on("close", () => input.destroy());
    return child;
  });
  const { root, project } = await fixture(launcher);
  const stint = await start(project);
  const requestId = await pending(project, stint.id);
  const answer = await post(project.app, `/api/stints/${stint.id}/permissions/${requestId}`, {
    optionId: "allow_once",
  });
  expect(answer.status).toBe(503);
  expect(await answer.json()).toEqual({ reason: "Agent pipe is closed." });
  expect(await decisions(root, stint.id, requestId)).toHaveLength(1);
  await expect.poll(async () => (await history(project, stint.id)).status).toBe("failed");
  expect((await history(project, stint.id)).events).not.toContainEqual(
    expect.objectContaining({ type: "message", text: "Must not receive a failed answer." }),
  );
});

test("a stopped work turn can still forward a permission answer during its handoff", async () => {
  const handoff =
    "## Where I stopped\nStopped work.\n## Unresolved\nNone\n## Suggested next\nReview.\n";
  const { root, project } = await fixture(
    createFakeAgentLauncher(
      [permission],
      [
        { ...permission, toolCall: { toolCallId: "handoff" }, expectedOptionId: "allow_once" },
        { type: "message", text: handoff },
      ],
    ),
  );
  const stint = await start(project);
  await pending(project, stint.id);
  expect((await post(project.app, `/api/stints/${stint.id}/stop`, {})).status).toBe(202);
  const requestId = await pending(project, stint.id);
  const answer = await post(project.app, `/api/stints/${stint.id}/permissions/${requestId}`, {
    optionId: "allow_once",
  });
  expect(answer.status).toBe(200);
  expect(await decisions(root, stint.id, requestId)).toHaveLength(1);
  await expect.poll(async () => (await history(project, stint.id)).status).toBe("stopped");
  expect((await history(project, stint.id)).handoff).toMatchObject({
    stoppedAt: "Stopped work.",
    unresolved: "None",
    nextStep: "Review.",
  });
});

test("declining is forwarded once and finishes the fake agent's turn", async () => {
  const { root, project } = await fixture(
    createFakeAgentLauncher([
      { ...permission, expectedOptionId: "cancel" },
      { type: "message", text: "Must not continue after No." },
    ]),
  );
  const stint = await start(project);
  const requestId = await pending(project, stint.id);
  const answer = await post(project.app, `/api/stints/${stint.id}/permissions/${requestId}`, {
    optionId: "cancel",
  });
  expect(answer.status).toBe(200);
  expect(await decisions(root, stint.id, requestId)).toMatchObject([
    { event: { decision: { outcome: "selected", optionId: "cancel", kind: "reject_once" } } },
  ]);
  await expect.poll(async () => (await history(project, stint.id)).status).toBe("finished");
  expect((await history(project, stint.id)).events).not.toContainEqual(
    expect.objectContaining({ type: "message", text: "Must not continue after No." }),
  );
});

type PermissionRequest = Parameters<NonNullable<AgentStintOptions["onPermission"]>>[0];
function routeFixture() {
  const app = new Hono();
  const permissions = addStintPermissionRoute(app);
  let forward: () => void = () => {};
  let fail: (error: Error) => void = () => {};
  const forwarded = new Promise<void>((resolve, reject) => {
    forward = resolve;
    fail = reject;
  });
  const request: PermissionRequest = {
    sessionId: "acp",
    requestId: "request",
    forwarded,
    toolCall: { toolCallId: "command" },
    options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
  };
  const response = permissions.wait("stint", request);
  return {
    app,
    permissions,
    request,
    response,
    forward,
    fail,
    path: "/api/stints/stint/permissions/request",
  };
}

test("the answer stays in flight until forwarded and duplicate answers cannot replace it", async () => {
  const { app, response, forward, path } = routeFixture();
  let completed = false;
  const answer = post(app, path, { optionId: "allow" }).then((result) => {
    completed = true;
    return result;
  });
  expect(await response).toEqual({ outcome: { outcome: "selected", optionId: "allow" } });
  expect(completed).toBe(false);
  const duplicate = await post(app, path, { optionId: "allow" });
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toEqual({
    reason: "This permission request is already being answered.",
  });
  forward();
  expect((await answer).status).toBe(200);
});

test("a forwarding failure returns its reason and ending during forwarding never returns success", async () => {
  for (const ending of [false, true]) {
    const { app, permissions, response, fail, path } = routeFixture();
    const answer = post(app, path, { optionId: "allow" });
    await response;
    if (ending) permissions.clear("stint");
    else fail(new Error("Agent pipe is closed."));
    const result = await answer;
    expect(result.status).toBe(ending ? 409 : 503);
    expect(await result.json()).toEqual({
      reason: ending ? "This permission request's stint has ended." : "Agent pipe is closed.",
    });
    expect((await post(app, path, { optionId: "allow" })).status).toBe(409);
  }
});

test("malformed, untrusted, stale and unoffered answers cannot consume a request", async () => {
  const { app, permissions, response, path } = routeFixture();
  for (const body of [null, {}, { optionId: 1 }, { optionId: "unknown" }])
    expect((await post(app, path, body)).status).toBe(400);
  expect(
    (
      await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    ).status,
  ).toBe(400);
  expect((await app.request(path, { method: "POST", body: "{}" })).status).toBe(400);
  expect(
    (
      await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" },
        body: '{"optionId":"allow"}',
      })
    ).status,
  ).toBe(403);
  expect(
    (await post(app, path.replace("/stint/", "/different/"), { optionId: "allow" })).status,
  ).toBe(409);
  permissions.clear("stint");
  expect(await response).toEqual({ outcome: { outcome: "cancelled" } });
});

test("duplicate registration cannot overwrite an unanswered request and shutdown forbids new ones", async () => {
  const { app, permissions, request, response, forward, path } = routeFixture();
  expect(() => permissions.wait("stint", request)).toThrow("already registered");
  const answer = post(app, path, { optionId: "allow" });
  expect(await response).toMatchObject({ outcome: { outcome: "selected" } });
  forward();
  expect((await answer).status).toBe(200);
  permissions.clear();
  expect(await permissions.wait("another-stint", { ...request, requestId: "another" })).toEqual({
    outcome: { outcome: "cancelled" },
  });
});

test("permission identifiers are scoped to their stint and late registration cannot revive an ended request", async () => {
  const { app, permissions, request, response, forward, path } = routeFixture();
  let otherForwarded: () => void = () => {};
  const otherRequest = {
    ...request,
    forwarded: new Promise<void>((resolve) => {
      otherForwarded = resolve;
    }),
  };
  const otherResponse = permissions.wait("other-stint", otherRequest);
  const answer = post(app, path, { optionId: "allow" });
  expect(await response).toMatchObject({ outcome: { outcome: "selected", optionId: "allow" } });
  forward();
  expect((await answer).status).toBe(200);
  const otherAnswer = post(app, path.replace("/stint/", "/other-stint/"), { optionId: "allow" });
  expect(await otherResponse).toMatchObject({
    outcome: { outcome: "selected", optionId: "allow" },
  });
  otherForwarded();
  expect((await otherAnswer).status).toBe(200);
  permissions.clear("stint");
  expect(await permissions.wait("stint", { ...request, requestId: "late-request" })).toEqual({
    outcome: { outcome: "cancelled" },
  });
  const late = await post(app, path.replace("/request", "/late-request"), { optionId: "allow" });
  expect(late.status).toBe(409);
  expect(await late.json()).toEqual({ reason: "This permission request's stint has ended." });
});
