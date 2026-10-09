import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher } from "@stintwork/agents/testing";
import type { AgentLauncher } from "@stintwork/agents";
import {
  foldStintLog,
  type Brief,
  type ProjectSnapshot,
  type Stint,
  type StintLiveMessage,
  type StintLogEntry,
} from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
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
) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-stints-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  for (const [path, content] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    "AGENTS.md": "Conventions",
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
      { timeout: 5000 },
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

test("automatic permission rejection is logged and the ACP stint continues to finish", async () => {
  const { root, project } = await fixture(
    createFakeAgentLauncher([
      { type: "message", text: "Before permission. " },
      {
        type: "permission",
        toolCall: { toolCallId: "git-add", title: "Escalate git add", kind: "execute" },
        options: [
          { optionId: "allow", name: "Allow", kind: "allow_once" },
          { optionId: "reject", name: "Reject", kind: "reject_once" },
        ],
      },
      { type: "message", text: "Continuing after rejection." },
      { type: "end" },
    ]),
  );
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  await finished(project, stint.id);
  const entries: StintLogEntry[] = (
    await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const permission = {
    type: "permission",
    toolCallId: "git-add",
    title: "Escalate git add",
    kind: "execute",
    automatic: true,
    decision: { outcome: "selected", optionId: "reject", kind: "reject_once" },
  };
  expect(entries.map((entry) => entry.type)).toEqual([
    "started",
    "event",
    "event",
    "event",
    "ended",
  ]);
  expect(entries[2]).toMatchObject({ type: "event", event: permission });
  expect(entries.at(-1)).toMatchObject({
    type: "ended",
    status: "finished",
    stopReason: "end_turn",
  });
  expect(foldStintLog(entries)?.events).toEqual([
    { type: "message", id: "1", text: "Before permission. Continuing after rejection." },
    permission,
  ]);
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
