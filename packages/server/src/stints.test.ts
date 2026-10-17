// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher } from "@stintwork/agents/testing";
import {
  createAgentRegistry,
  readExecutableIdentity,
  type AgentLauncher,
  type AgentPreparationOptions,
  type PreparedAgent,
} from "@stintwork/agents";
import {
  foldStintLog,
  type Brief,
  type ProjectSnapshot,
  type Stint,
  type StintLiveMessage,
  type StintLogEntry,
} from "@stintwork/core";
import { afterEach, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { claudeProfile, codexProfile } from "../../agents/src/profiles.js";
import type { StintServerOptions } from "./stints.js";
import { createProjectServer } from "./index.js";

const fixtures: {
  parent: string;
  project: ReturnType<typeof createProjectServer>;
  socket?: WebSocket;
}[] = [];
const ticketPath = ".scratch/first/issues/01-first.md";
async function fixture(
  launchAgent: AgentLauncher = createFakeAgentLauncher([
    { type: "message", text: "Hello " },
    { type: "delay", milliseconds: 200 },
    { type: "message", text: "world" },
    { type: "end" },
  ]),
  options: StintServerOptions = {},
) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-stints-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  for (const [path, content] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    "AGENTS.md": "Conventions",
    ".gitignore": ".stintwork/local/\n",
    ".scratch/first/workflow.yaml":
      "workflow: feature\nstage: implement\nstages:\n  implement:\n    agent: codex\n",
    ".scratch/first/spec.md": "# First",
    [ticketPath]: "# First\nStatus: ready-for-agent\nBlocked by: none",
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
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
  const project = createProjectServer(root, join(root, "web"), {
    launchAgent,
    ...options,
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
function start(
  project: ReturnType<typeof createProjectServer>,
  body: unknown = { workItem: "first", ticket: 1, agent: "codex" },
) {
  return project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function finished(project: ReturnType<typeof createProjectServer>, id: string) {
  await expect
    .poll(
      async () => {
        const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
        return snapshot.workItems[0].stints.find((stint) => stint.id === id)?.status;
      },
      { timeout: 10_000 },
    )
    .toBe("finished");
}

test("an injected agent-neutral launcher records messages and a finished stint without sockets", async () => {
  const { root, project } = await fixture(({ onEvent }) => ({
    done: Promise.resolve().then(() => {
      onEvent({ type: "message_delta", id: "1", text: "Recorded message" });
      return { stopReason: "end_turn" };
    }),
    cancel: async () => {},
  }));
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  await finished(project, stint.id);
  const log = await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8");
  expect(
    foldStintLog(
      log
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ),
  ).toMatchObject({
    status: "finished",
    events: [{ type: "message", text: "Recorded message" }],
  });
});

test("the workflow setup note persists its code and agent without translating the agent stream", async () => {
  const { root, project } = await fixture(({ onEvent }) => ({
    done: Promise.resolve().then(() => {
      onEvent({ type: "message", id: "agent-note", text: "Agent text 原文" });
      return { stopReason: "end_turn" };
    }),
    cancel: async () => {},
  }));
  await writeFile(
    join(root, ".scratch/first/workflow.yaml"),
    "workflow: feature\nstage: implement\n",
  );
  execFileSync("git", ["add", ".scratch/first/workflow.yaml"], { cwd: root });
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
      "Unassigned stage fixture",
    ],
    { cwd: root },
  );
  const { stint } = await (await start(project)).json();
  await finished(project, stint.id);
  const entries = (await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const expected = {
    type: "message",
    id: "setup-1",
    text: "Wrote workflow.yaml with the workflow, stage and Codex for this stage.\n",
    message: { code: "stream.wroteWorkflow", params: { agent: "Codex" } },
  };
  expect(entries.find((entry) => entry.event?.id === "setup-1")?.event).toEqual(expected);
  const recorded = await (await project.app.request(`/api/stints/${stint.id}`)).json();
  expect(recorded.stint.events.find((event: { id?: string }) => event.id === "setup-1")).toEqual(
    expected,
  );
  expect(recorded.stint.events.find((event: { id?: string }) => event.id === "agent-note")).toEqual(
    { type: "message", id: "agent-note", text: "Agent text 原文" },
  );
});

test("an agent that ends its own turn as cancelled finishes rather than reading as stopped", async () => {
  const { root, project } = await fixture(() => ({
    done: Promise.resolve({ stopReason: "cancelled" }),
    cancel: async () => {},
  }));
  const response = await start(project);
  const { stint }: { stint: Stint } = await response.json();
  await finished(project, stint.id);
  const log = await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8");
  const entries = log
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(foldStintLog(entries)?.status).toBe("finished");
  expect(entries.at(-1)).toMatchObject({ type: "ended", stopReason: "cancelled" });
});

test("an authored stop-reason diagnostic persists its code and unchanged English", async () => {
  const { root, project } = await fixture(() => ({
    done: Promise.resolve({ stopReason: "max_tokens" }),
    cancel: async () => {},
  }));
  const { stint } = await (await start(project)).json();
  await expect
    .poll(
      async () =>
        (await (await project.app.request(`/api/stints/${stint.id}`)).json()).stint.status,
    )
    .toBe("failed");
  const entries = (await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(entries.at(-1).error).toBe("Agent ended the stint with stop reason: max_tokens.");
  expect(entries.at(-1).errorMessage).toEqual({
    code: "stint.stopReason",
    params: { reason: "max_tokens" },
  });
});

test("starts from the server-compiled preview, records every event and reuses the worktree on a second stint", async () => {
  const { root, project } = await fixture();
  const preview: Brief = await (
    await project.app.request("/api/work-items/first/tickets/1/brief-preview")
  ).json();
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  expect(stint.status).toBe("running");
  expect(stint.brief).toEqual(preview);
  const conflict = await start(project);
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toEqual({
    reason: "A stint is already active for this work item.",
    reasonMessage: { code: "stint.alreadyActive" },
  });
  await finished(project, stint.id);
  const log = await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8");
  const entries: StintLogEntry[] = log
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(entries.map((entry) => entry.type)).toEqual(["started", "event", "event", "ended"]);
  expect(foldStintLog(entries)).toMatchObject({
    status: "finished",
    events: [{ type: "message", text: "Hello world" }],
  });
  expect(
    execFileSync("git", ["branch", "--show-current"], {
      cwd: stint.worktree.path,
      encoding: "utf8",
    }).trim(),
  ).toBe("stintwork/first");
  expect(
    execFileSync("git", ["check-ignore", ".stintwork/local/stints/example.jsonl"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
  ).toBe(".stintwork/local/stints/example.jsonl");
  await writeFile(join(stint.worktree.path, "uncommitted.txt"), "Preserve me");
  const next: { stint: Stint } = await (await start(project)).json();
  expect(next.stint.worktree).toEqual(stint.worktree);
  await finished(project, next.stint.id);
  expect(await readFile(join(stint.worktree.path, "uncommitted.txt"), "utf8")).toBe("Preserve me");
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.workItems[0].activeStint).toBeNull();
  expect(snapshot.workItems[0].stints).toHaveLength(2);
  expect(await readdir(join(root, ".stintwork/local/stints"))).toHaveLength(2);
});

test.each(["allow", "cancel"])(
  "permission %s waits without a UI, reaches ACP and is logged",
  async (optionId) => {
    const { root, project } = await fixture(
      createFakeAgentLauncher([
        { type: "message", text: "Before permission. " },
        {
          type: "permission",
          toolCall: { toolCallId: "git-add", title: "Escalate git add", kind: "execute" },
          options: [
            { optionId: "allow", name: "Yes, proceed", kind: "allow_once" },
            {
              optionId: "cancel",
              name: "No, and tell Codex what to do differently",
              kind: "reject_once",
            },
          ],
          expectedOptionId: optionId,
        },
        { type: "message", text: "Allowed to continue." },
        { type: "end" },
      ]),
    );
    const response = await start(project);
    expect(response.status).toBe(201);
    const { stint }: { stint: Stint } = await response.json();
    let pending: Extract<Stint["events"][number], { type: "permission_request" }> | undefined;
    await expect
      .poll(async () => {
        const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
        pending = snapshot.workItems[0].activeStint?.events.find(
          (event) => event.type === "permission_request",
        );
        return pending?.requestId;
      })
      .toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const waiting = await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8");
    expect(waiting).not.toContain('"type":"ended"');
    expect(waiting).not.toContain("Allowed to continue.");
    expect(pending).toMatchObject({
      automatic: false,
      title: "Escalate git add",
      kind: "execute",
      options: [
        { optionId: "allow", name: "Yes, proceed" },
        { optionId: "cancel", kind: "reject_once" },
      ],
    });
    const url = `/api/stints/${stint.id}/permissions/${pending?.requestId}`;
    const answer = (body: unknown, path = url) =>
      project.app.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await answer({ optionId: "invented" })).status).toBe(400);
    expect((await answer({})).status).toBe(400);
    expect((await answer({ optionId }, url.replace(stint.id, "another-stint"))).status).toBe(409);
    expect(
      (
        await project.app.request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" },
          body: JSON.stringify({ optionId }),
        })
      ).status,
    ).toBe(403);
    expect((await project.app.request(url, { method: "POST", body: "{}" })).status).toBe(400);
    expect(
      (
        await project.app.request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
    ).toBe(400);
    expect((await answer({ optionId })).status).toBe(200);
    expect((await answer({ optionId })).status).toBe(409);
    await finished(project, stint.id);
    const entries: StintLogEntry[] = (
      await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const permission = {
      type: "permission",
      requestId: pending?.requestId,
      toolCallId: "git-add",
      title: "Escalate git add",
      kind: "execute",
      automatic: false,
      decision: {
        outcome: "selected",
        optionId,
        kind: optionId === "allow" ? "allow_once" : "reject_once",
      },
    };
    if (!pending) throw new Error("Expected the pending permission request.");
    const { raisedAt, ...loggedRequest } = pending;
    expect(entries[2]).toEqual({ type: "event", at: raisedAt, event: loggedRequest });
    expect(foldStintLog(entries)?.events).toContainEqual(pending);
    expect(entries[3]).toMatchObject({ type: "event", event: permission });
    expect(entries.at(-1)).toMatchObject({
      type: "ended",
      status: "finished",
      stopReason: optionId === "allow" ? "end_turn" : "cancelled",
    });
    expect(foldStintLog(entries)?.events).toContainEqual(permission);
    expect(
      entries.some(
        (entry) =>
          entry.type === "event" &&
          entry.event.type === "message_delta" &&
          entry.event.text === "Allowed to continue.",
      ),
    ).toBe(optionId === "allow");
  },
);

test("server shutdown cancels a pending permission rather than hanging or retaining an answerable request", async () => {
  const { root, project } = await fixture(
    createFakeAgentLauncher([
      {
        type: "permission",
        toolCall: { toolCallId: "git" },
        options: [{ optionId: "allow", name: "Yes", kind: "allow_once" }],
      },
    ]),
  );
  const { stint }: { stint: Stint } = await (await start(project)).json();
  let requestId: string | undefined;
  await expect
    .poll(async () => {
      const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
      const event = snapshot.workItems[0].activeStint?.events.find(
        (entry) => entry.type === "permission_request",
      );
      requestId = event?.requestId;
      return requestId;
    })
    .toBeTruthy();
  await project.stop();
  const entries: StintLogEntry[] = (
    await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(entries.at(-1)).toMatchObject({ type: "ended", status: "interrupted" });
  expect(foldStintLog(entries)?.events).toContainEqual(
    expect.objectContaining({
      type: "permission",
      automatic: false,
      decision: { outcome: "cancelled" },
    }),
  );
  expect(
    (
      await project.app.request(`/api/stints/${stint.id}/permissions/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId: "allow" }),
      })
    ).status,
  ).toBe(409);
});

test("N ACP chunks persist as N bounded delta entries and fold to the full message", async () => {
  const count = 200;
  const text = "small chunk ";
  const { root, project } = await fixture(
    createFakeAgentLauncher([
      ...Array.from({ length: count }, () => ({ type: "message" as const, text })),
      { type: "end" },
    ]),
  );
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  await finished(project, stint.id);
  const lines = (await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8"))
    .trim()
    .split("\n");
  const entries: StintLogEntry[] = lines.map((line) => JSON.parse(line));
  const events = entries.filter((entry) => entry.type === "event");
  expect(entries).toHaveLength(count + 2);
  expect(events).toHaveLength(count);
  expect(events.map((entry) => entry.event)).toEqual(
    Array.from({ length: count }, () => ({ type: "message_delta", id: "1", text })),
  );
  expect(lines.slice(1, -1).every((line) => line.length < 150)).toBe(true);
  expect(foldStintLog(entries)).toMatchObject({
    status: "finished",
    events: [{ type: "message", id: "1", text: text.repeat(count) }],
  });
});

test("HTTP start streams ACP messages over WebSocket in durable log order and ends finished", async () => {
  const { root, project, tracked } = await fixture();
  const server = await project.start();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const url = `http://127.0.0.1:${address.port}`;
  const socket = new WebSocket(`${url.replace("http", "ws")}/api/live`);
  tracked.socket = socket;
  const messages: StintLiveMessage[] = [];
  let resolveEnded: () => void = () => {};
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if (message.type === "stint") {
      messages.push(message);
      if (message.entry.type === "ended") resolveEnded();
    }
  });
  await once(socket, "open");
  const response = await fetch(`${url}/api/stints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  await ended;
  expect(messages.map((message) => message.sequence)).toEqual([1, 2, 3, 4]);
  expect(
    messages.every((message) => message.stintId === stint.id && message.workItem === "first"),
  ).toBe(true);
  expect(
    messages
      .filter((message) => message.entry.type === "event")
      .map((message) => message.entry.type === "event" && message.entry.event),
  ).toEqual([
    { type: "message_delta", id: "1", text: "Hello " },
    { type: "message_delta", id: "1", text: "world" },
  ]);
  expect(messages.at(-1)?.entry).toMatchObject({ type: "ended", status: "finished" });
  const log = await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8");
  expect(
    log
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  ).toEqual(messages.map((message) => message.entry));
  const snapshot: ProjectSnapshot = await (await fetch(`${url}/api/project`)).json();
  expect(snapshot.workItems[0].stints[0]).toMatchObject({ id: stint.id, status: "finished" });
});

test("rich events and pending permission frames broadcast in durable order and a live HTTP answer reaches ACP", async () => {
  const { root, project, tracked } = await fixture(
    createFakeAgentLauncher([
      {
        type: "update",
        update: {
          sessionUpdate: "plan",
          entries: [{ content: "Edit greeting", priority: "high", status: "in_progress" }],
        },
      },
      {
        type: "update",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "edit",
          title: "Write greeting",
          kind: "edit",
          status: "in_progress",
        },
      },
      {
        type: "update",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "edit",
          status: "completed",
          content: [{ type: "diff", path: "/worktree/hello.ts", oldText: null, newText: "Hello" }],
        },
      },
      {
        type: "permission",
        toolCall: { toolCallId: "git", title: "git add", kind: "execute" },
        options: [{ optionId: "allow", name: "Yes, proceed", kind: "allow_once" }],
        expectedOptionId: "allow",
      },
      {
        type: "update",
        update: {
          sessionUpdate: "plan",
          entries: [{ content: "Edit greeting", priority: "high", status: "completed" }],
        },
      },
    ]),
  );
  const server = await project.start();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const url = `http://127.0.0.1:${address.port}`;
  const socket = new WebSocket(`${url.replace("http", "ws")}/api/live`);
  tracked.socket = socket;
  const messages: StintLiveMessage[] = [];
  let permissionReady: (requestId: string) => void = () => {};
  const permission = new Promise<string>((resolve) => {
    permissionReady = resolve;
  });
  let stintEnded: () => void = () => {};
  const ended = new Promise<void>((resolve) => {
    stintEnded = resolve;
  });
  socket.on("message", (data) => {
    const message: StintLiveMessage = JSON.parse(data.toString());
    if (message.type !== "stint") return;
    messages.push(message);
    if (message.entry.type === "event" && message.entry.event.type === "permission_request")
      permissionReady(message.entry.event.requestId);
    if (message.entry.type === "ended") stintEnded();
  });
  await once(socket, "open");
  const response = await fetch(`${url}/api/stints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  const { stint }: { stint: Stint } = await response.json();
  const requestId = await permission;
  expect(messages.at(-1)?.entry).toMatchObject({
    type: "event",
    event: { type: "permission_request", requestId, automatic: false },
  });
  const answer = await fetch(`${url}/api/stints/${stint.id}/permissions/${requestId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optionId: "allow" }),
  });
  expect(answer.status).toBe(200);
  await ended;
  expect(messages.map((message) => message.sequence)).toEqual(
    messages.map((_message, index) => index + 1),
  );
  const entries: StintLogEntry[] = (
    await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(entries).toEqual(messages.map((message) => message.entry));
  expect(foldStintLog(entries)).toMatchObject({
    status: "finished",
    events: [
      { type: "plan", entries: [{ status: "completed" }] },
      {
        type: "tool_call",
        toolCallId: "edit",
        title: "Write greeting",
        kind: "edit",
        status: "completed",
      },
      { type: "file_edit", path: "/worktree/hello.ts", newText: "Hello" },
      { type: "permission_request", requestId, automatic: false },
      {
        type: "permission",
        requestId,
        automatic: false,
        decision: { outcome: "selected", optionId: "allow" },
      },
    ],
  });
});

test("rejects stale eligibility and untrusted or malformed start requests before any log", async () => {
  const { root, project } = await fixture();
  for (const text of [
    "# First\nStatus: resolved\nBlocked by: none",
    "# First\nStatus: open\nBlocked by: 02",
  ]) {
    await writeFile(join(root, ticketPath), text);
    expect((await start(project)).status).toBe(409);
  }
  for (const body of [
    null,
    {},
    { workItem: "first", ticket: 1, agent: "claude" },
    { workItem: "../escape", ticket: 1, agent: "codex" },
  ]) {
    expect((await start(project, body)).ok).toBe(false);
  }
  expect(
    (
      await project.app.request("/api/stints", {
        method: "POST",
        headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  expect((await project.app.request("/api/stints", { method: "POST", body: "{}" })).status).toBe(
    400,
  );
  await expect(readdir(join(root, ".stintwork/local/stints"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

const selectedPreparation = {
  agent: "codex",
  source: "bundled",
  reason: "below-tested-range",
  adapterVersion: "2.1.1",
  executable: {
    path: process.execPath,
    version: "0.159.3",
    identity: readExecutableIdentity(process.execPath)?.identity ?? "fixture",
  },
  adapterEntry: "/fixture/cache/adapter.js",
  cacheKey: "fixture",
  lockDigest: "fixture",
} satisfies PreparedAgent;

function fakePreparation(afterConfirmation: () => void = () => {}) {
  return vi.fn(async (options: AgentPreparationOptions) => {
    const event = { ...selectedPreparation, phase: "selected" as const };
    options.onProgress?.(event);
    await options.beforePrepare?.(event, options.signal as AbortSignal);
    options.signal?.throwIfAborted();
    afterConfirmation();
    options.onProgress?.({ ...event, phase: "installing" });
    return selectedPreparation;
  });
}

async function streamedStart(
  project: ReturnType<typeof createProjectServer>,
  signal?: AbortSignal,
) {
  const response = await project.app.request("/api/stints", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  if (!response.body) throw new Error("Expected a start stream");
  const reader = response.body.getReader();
  let pending = "";
  const decoder = new TextDecoder();
  const messages: {
    type: string;
    stintId?: string;
    progress?: { phase: string };
    status?: number;
    body?: unknown;
  }[] = [];
  async function until(type: string, phase?: string) {
    for (;;) {
      const found = messages.find(
        (event) => event.type === type && (!phase || event.progress?.phase === phase),
      );
      if (found) return found;
      const { value, done } = await reader.read();
      if (done) throw new Error("Stream ended before expected event");
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      messages.push(...lines.filter(Boolean).map((line) => JSON.parse(line)));
    }
  }
  return { until, messages };
}

test("board/API/refresh never prepare; explicit start streams selection and waits before download", async () => {
  const download = vi.fn();
  const prepareAgent = fakePreparation(download);
  const launch = vi.fn<AgentLauncher>(() => ({
    ready: Promise.resolve(),
    done: Promise.resolve({ stopReason: "end_turn" }),
    cancel: async () => {},
  }));
  const registry = createAgentRegistry([
    {
      ...codexProfile,
      launch,
      availability: { available: false, canStart: true, kind: "missing-executable" },
    },
  ]);
  const { project } = await fixture(launch, { prepareAgent, agentRegistry: registry });
  for (const path of [
    "/api/health",
    "/api/project",
    "/api/agents",
    "/api/agents?refresh=true",
    "/api/work-items/first/tickets/1/brief-preview",
  ])
    expect((await project.app.request(path)).status).toBe(200);
  expect(prepareAgent).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
  const stream = await streamedStart(project);
  const confirmation = await stream.until("preparation", "confirm");
  expect(download).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
  const id = confirmation.stintId;
  expect(
    (
      await project.app.request(`/api/stints/${id}/confirm-agent`, {
        method: "POST",
        headers: { origin: "https://other.invalid" },
      })
    ).status,
  ).toBe(403);
  expect(download).not.toHaveBeenCalled();
  expect(
    (await project.app.request(`/api/stints/${id}/confirm-agent`, { method: "POST" })).status,
  ).toBe(200);
  expect((await stream.until("result")).status).toBe(201);
  expect(download).toHaveBeenCalledTimes(1);
  expect(launch).toHaveBeenCalledWith(
    expect.objectContaining({ preparedAgent: selectedPreparation }),
  );
  expect(stream.messages.some((event) => event.progress?.phase === "installing")).toBe(true);
});

test("preparation cancellation launches nothing and permits retry with unchanged pins", async () => {
  const download = vi.fn();
  const prepareAgent = fakePreparation(download);
  const launch = vi.fn<AgentLauncher>(() => ({
    ready: Promise.resolve(),
    done: Promise.resolve({ stopReason: "end_turn" }),
    cancel: async () => {},
  }));
  const { project } = await fixture(launch, { prepareAgent });
  const stream = await streamedStart(project);
  const confirmation = await stream.until("preparation", "confirm");
  expect(
    (await project.app.request(`/api/stints/${confirmation.stintId}/stop`, { method: "POST" }))
      .status,
  ).toBe(202);
  expect((await stream.until("result")).status).toBe(503);
  expect(download).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
  const retry = await streamedStart(project);
  const again = await retry.until("preparation", "confirm");
  await project.app.request(`/api/stints/${again.stintId}/confirm-agent`, { method: "POST" });
  expect((await retry.until("result")).status).toBe(201);
  expect(prepareAgent).toHaveBeenCalledTimes(2);
});

test("preparation authentication-required points to the developer's login without launching or writing a worktree", async () => {
  const launch = vi.fn<AgentLauncher>();
  const error = Object.assign(new Error("Authentication required"), { code: -32000 });
  const registry = createAgentRegistry([{ ...codexProfile, launch }]);
  const { project, root } = await fixture(launch, {
    agentRegistry: registry,
    prepareAgent: async () => {
      throw error;
    },
  });
  const response = await start(project);
  expect(response.status).toBe(503);
  expect((await response.json()).reason).toContain("codex login");
  const agents = await (await project.app.request("/api/agents")).json();
  expect(agents.agents[0].availability).toMatchObject({
    available: false,
    canStart: true,
    kind: "login-required",
    checkedAt: expect.any(String),
  });
  expect(launch).not.toHaveBeenCalled();
  expect(
    execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: root, encoding: "utf8" }).match(
      /^worktree /gm,
    ),
  ).toHaveLength(1);
});

test.each(["already aborted", "during preflight"])(
  "a request disconnected %s never prepares or locks the work item",
  async (when) => {
    const launch = vi.fn<AgentLauncher>(() => ({
      ready: Promise.resolve(),
      done: Promise.resolve({ stopReason: "end_turn" }),
      cancel: async () => {},
    }));
    const prepareAgent = fakePreparation();
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inspecting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let hold = false;
    const registry = createAgentRegistry([
      {
        ...codexProfile,
        launch,
        detectAvailability: async () => {
          if (hold) {
            entered();
            await pending;
          }
          return { available: false, canStart: true, kind: "not-prepared" };
        },
      },
    ]);
    const { project, root } = await fixture(launch, { prepareAgent, agentRegistry: registry });
    await project.app.request("/api/health");
    const request = new AbortController();
    if (when === "already aborted") request.abort();
    else hold = true;
    const starting = streamedStart(project, request.signal);
    if (hold) {
      await inspecting;
      request.abort();
      release();
      hold = false;
    }
    const stream = await starting;
    expect((await stream.until("result")).status).toBe(503);
    expect(prepareAgent).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
    expect(
      execFileSync("git", ["worktree", "list", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      }).match(/^worktree /gm),
    ).toHaveLength(1);
    expect((await start(project)).status).toBe(201);
    expect(prepareAgent).toHaveBeenCalledTimes(1);
  },
);

test("raw request cancellation aborts pending preparation and releases the work item", async () => {
  const prepareAgent = fakePreparation();
  const launch = vi.fn<AgentLauncher>(() => ({
    ready: Promise.resolve(),
    done: Promise.resolve({ stopReason: "end_turn" }),
    cancel: async () => {},
  }));
  const { project } = await fixture(launch, { prepareAgent });
  const request = new AbortController();
  const stream = await streamedStart(project, request.signal);
  await stream.until("preparation", "confirm");
  request.abort();
  expect((await stream.until("result")).status).toBe(503);
  expect(prepareAgent.mock.calls[0][0].signal?.aborted).toBe(true);
  expect(launch).not.toHaveBeenCalled();
  expect((await start(project)).status).toBe(201);
});

test.each([
  "Offline cold miss",
  "Registry integrity mismatch",
  "Disk full",
  "Permission denied",
  "Provider unavailable",
])(
  "%s during preparation stays unavailable, writes no worktree/log and permits explicit retry",
  async (message) => {
    const launch = vi.fn<AgentLauncher>(() => ({
      ready: Promise.resolve(),
      done: Promise.resolve({ stopReason: "end_turn" }),
      cancel: async () => {},
    }));
    const prepareAgent = fakePreparation();
    prepareAgent.mockImplementationOnce(async (options) => {
      options.onProgress?.({ ...selectedPreparation, phase: "installing" });
      throw new Error(message);
    });
    const registry = createAgentRegistry([{ ...codexProfile, launch }]);
    const { root, project } = await fixture(launch, { prepareAgent, agentRegistry: registry });
    const ticket = await readFile(join(root, ticketPath));
    const response = await start(project);
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toContain(message);
    expect(prepareAgent).toHaveBeenCalledTimes(1);
    expect(launch).not.toHaveBeenCalled();
    const agents = await (await project.app.request("/api/agents?refresh=true")).json();
    expect(agents.agents[0].availability).toMatchObject({
      available: false,
      canStart: true,
      kind: "preparation-failed",
    });
    expect(
      execFileSync("git", ["worktree", "list", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      }).match(/^worktree /gm),
    ).toHaveLength(1);
    expect(await readFile(join(root, ticketPath))).toEqual(ticket);
    await expect(readdir(join(root, ".stintwork/local/stints"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await start(project)).status).toBe(201);
    expect(prepareAgent).toHaveBeenCalledTimes(2);
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ preparedAgent: selectedPreparation }),
    );
  },
);

test("package completion is not login readiness; Ready waits for the current launch", async () => {
  let ready!: () => void;
  const readiness = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const launch = vi.fn<AgentLauncher>(() => ({
    ready: readiness,
    done: readiness.then(() => ({ stopReason: "end_turn" })),
    cancel: async () => {
      ready();
    },
  }));
  const registry = createAgentRegistry([
    {
      ...codexProfile,
      launch,
      async detectAvailability() {
        return this.availability ?? { available: false, canStart: true, kind: "not-prepared" };
      },
    },
  ]);
  const { project } = await fixture(launch, {
    prepareAgent: fakePreparation(),
    agentRegistry: registry,
  });
  const stream = await streamedStart(project);
  const confirmation = await stream.until("preparation", "confirm");
  await project.app.request(`/api/stints/${confirmation.stintId}/confirm-agent`, {
    method: "POST",
  });
  await stream.until("preparation", "ready");
  await expect.poll(() => launch.mock.calls.length).toBe(1);
  const agents = await (await project.app.request("/api/agents")).json();
  expect(agents.agents[0].availability).toMatchObject({ available: false, kind: "not-prepared" });
  ready();
  expect((await stream.until("result")).status).toBe(201);
  expect(
    (await (await project.app.request("/api/agents")).json()).agents[0].availability.available,
  ).toBe(true);
});

test("HTTP preparation disconnect cancels before download and a new request retries", async () => {
  let cancelled!: () => void;
  const cancellation = new Promise<void>((resolve) => {
    cancelled = resolve;
  });
  const download = vi.fn();
  const prepareAgent = fakePreparation(download);
  prepareAgent.mockImplementationOnce(async (options) => {
    options.signal?.addEventListener("abort", cancelled, { once: true });
    const event = { ...selectedPreparation, phase: "selected" as const };
    await options.beforePrepare?.(event, options.signal as AbortSignal);
    options.signal?.throwIfAborted();
    download();
    return selectedPreparation;
  });
  const launch = vi.fn<AgentLauncher>(() => ({
    ready: Promise.resolve(),
    done: Promise.resolve({ stopReason: "end_turn" }),
    cancel: async () => {},
  }));
  const { root, project } = await fixture(launch, { prepareAgent });
  const server = await project.start();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const url = `http://127.0.0.1:${address.port}`;
  const controller = new AbortController();
  const response = await fetch(`${url}/api/stints`, {
    method: "POST",
    signal: controller.signal,
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  if (!response.body) throw new Error("Expected preparation stream");
  const reader = response.body.getReader();
  let data = "";
  while (!data.includes('"phase":"confirm"')) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error("Stream ended before source confirmation");
    data += new TextDecoder().decode(chunk.value);
  }
  controller.abort();
  await cancellation;
  expect(download).not.toHaveBeenCalled();
  expect(launch).not.toHaveBeenCalled();
  await expect(readdir(join(root, ".stintwork/local/stints"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  // A conflict while cancellation finishes is safe; the first accepted retry must launch once.
  await expect
    .poll(async () => {
      const retry = await fetch(`${url}/api/stints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
      });
      await retry.text();
      return retry.status;
    })
    .toBe(201);
  expect(prepareAgent).toHaveBeenCalledTimes(2);
  expect(launch).toHaveBeenCalledTimes(1);
});

test.each(["claude", "codex"] as const)(
  "%s: server launch receives selected Bundled executable over inherited bogus override",
  async (agent) => {
    const override = agent === "claude" ? "CLAUDE_CODE_EXECUTABLE" : "CODEX_PATH";
    const previous = process.env[override];
    process.env[override] = "/nonexistent/agent";
    try {
      const prepared = { ...selectedPreparation, agent };
      const launch = vi.fn<AgentLauncher>(() => ({
        ready: Promise.resolve(),
        done: Promise.resolve({ stopReason: "end_turn" }),
        cancel: async () => {},
      }));
      const registry = createAgentRegistry([
        { ...(agent === "claude" ? claudeProfile : codexProfile), launch },
      ]);
      const { project } = await fixture(launch, {
        agentRegistry: registry,
        prepareAgent: async () => prepared,
      });
      expect((await start(project, { workItem: "first", ticket: 1, agent })).status).toBe(201);
      expect(launch).toHaveBeenCalledWith(
        expect.objectContaining({
          preparedAgent: prepared,
          env: expect.objectContaining({ [override]: prepared.executable.path }),
        }),
      );
    } finally {
      if (previous === undefined) delete process.env[override];
      else process.env[override] = previous;
    }
  },
);
