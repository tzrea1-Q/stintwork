import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher, type FakeAgentStep } from "@stintwork/agents/testing";
import {
  foldStintLog,
  type Brief,
  type ProjectSnapshot,
  type Stint,
  type StintLiveMessage,
  type StintLogEntry,
  type StintSummary,
} from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { createProjectServer } from "./index.js";

const spec = ".scratch/first/spec.md";
const ticket = ".scratch/first/issues/04-checkpoint.md";
const preview = "/api/work-items/first/tickets/4/brief-preview";
const handoffText =
  "## Where I stopped\nCode written, not committed.\n## Unresolved\nTests need review.\n## Suggested next\nReview the checks.";
const handoffBody = {
  stoppedAt: "Code written, not committed.",
  unresolved: "Tests need review.",
  nextStep: "Review the checks.",
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
  work: readonly FakeAgentStep[] = [
    { type: "write", path: "implementation.txt", content: "Implementation" },
    { type: "message", text: "Work turn finished" },
  ],
  handoff: readonly FakeAgentStep[] = [
    { type: "expect-prompt", includes: "## Where I stopped\n## Unresolved\n## Suggested next" },
    { type: "write", path: "handoff-artifact.txt", content: "Handoff artifact" },
    { type: "message", text: handoffText },
  ],
  handoffTimeoutMs = 500,
) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-ending-"));
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
    [spec]: "# First",
    [ticket]: "# Checkpoint\nStatus: ready-for-agent\nBlocked by: none",
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const project = createProjectServer(root, join(root, "web"), {
    launchAgent: createFakeAgentLauncher(work, handoff),
    handoffTimeoutMs,
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
    body: JSON.stringify({ workItem: "first", ticket: 4, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  const body: { stint: Stint } = await response.json();
  return body.stint;
}
async function ended(
  project: ReturnType<typeof createProjectServer>,
  id: string,
): Promise<StintSummary> {
  let stint: StintSummary | undefined;
  await expect
    .poll(
      async () => {
        const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
        stint = snapshot.workItems[0].stints.find((candidate) => candidate.id === id);
        return stint?.endedAt;
      },
      { timeout: 5000 },
    )
    .toBeTruthy();
  return stint as StintSummary;
}
async function entries(root: string, id: string): Promise<StintLogEntry[]> {
  return (await readFile(join(root, `.stintwork/local/stints/${id}.jsonl`), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("a fake-agent stint requests and records a handoff before checkpointing both turns exactly once", async () => {
  const { root, project, base } = await fixture();
  const started = await start(project);
  const stint = await ended(project, started.id);
  expect(stint.status).toBe("finished");
  expect(stint.handoff).toEqual({ ...handoffBody, stint: stint.id, agent: "codex" });
  expect(git(started.worktree.path, "rev-list", "--count", `${base}..HEAD`)).toBe("1");
  const commit = stint.checkpointCommit as string;
  expect(git(started.worktree.path, "show", "--no-patch", "--format=%B", commit)).toContain(
    `stint ${stint.id}; work item first; ticket 4; finished`,
  );
  expect(git(root, "show", `${commit}:implementation.txt`)).toBe("Implementation");
  expect(git(root, "show", `${commit}:handoff-artifact.txt`)).toBe("Handoff artifact");
  expect(git(root, "rev-parse", "HEAD")).toBe(base);
  const log = await entries(root, stint.id);
  expect(log.at(-1)).toMatchObject({
    type: "ended",
    checkpointCommit: commit,
    handoff: stint.handoff,
  });
  expect(foldStintLog(log)).toMatchObject({ checkpointCommit: commit, handoff: stint.handoff });
});

test("a clean fake-agent stint makes no commit and records the existing HEAD for resume", async () => {
  const { root, project, base } = await fixture([], []);
  const started = await start(project);
  const stint = await ended(project, started.id);
  expect(stint).toMatchObject({ status: "finished", checkpointCommit: base, handoff: null });
  expect(git(started.worktree.path, "rev-list", "--count", `${base}..HEAD`)).toBe("0");
  expect((await entries(root, stint.id)).at(-1)).toMatchObject({ handoff: null });
});

test("a stopped stint records a failed handoff reason in its ended entry and summary", async () => {
  const { root, project } = await fixture(
    [
      { type: "write", path: "partial.txt", content: "Recoverable edit" },
      { type: "message", text: "Working" },
      { type: "delay", milliseconds: 30_000 },
    ],
    [{ type: "error", message: "Agent was still settling the cancelled patch." }],
    2000,
  );
  const started = await start(project);
  await expect
    .poll(async () => JSON.stringify(await entries(root, started.id)))
    .toContain("Working");
  expect(
    (await project.app.request(`/api/stints/${started.id}/stop`, { method: "POST" })).status,
  ).toBe(202);
  const stint = await ended(project, started.id);
  expect(stint).toMatchObject({
    status: "stopped",
    handoff: null,
    handoffError: expect.stringContaining("Agent was still settling the cancelled patch."),
  });
  expect(stint).not.toHaveProperty("error");
  expect((await entries(root, stint.id)).at(-1)).toMatchObject({
    type: "ended",
    status: "stopped",
    handoff: null,
    handoffError: stint.handoffError,
  });
  expect(git(started.worktree.path, "show", `${stint.checkpointCommit}:partial.txt`)).toBe(
    "Recoverable edit",
  );
});

test.each([
  [{ type: "delay", milliseconds: 30_000 }],
  [{ type: "message", text: "Not the required sections" }],
  [{ type: "crash" }],
] satisfies FakeAgentStep[][])(
  "no usable handoff still ends and checkpoints the work (%j)",
  async (...steps) => {
    const { project } = await fixture(undefined, steps, 30);
    const started = await start(project);
    const stint = await ended(project, started.id);
    expect(stint).toMatchObject({ status: "finished", handoff: null });
    expect(stint.checkpointCommit).not.toBe(started.baseCommit);
  },
);

test("preview and start rebuild the resume brief from the same ticket's handoff and worktree changes", async () => {
  const { project } = await fixture();
  const first = await start(project);
  const previous = await ended(project, first.id);
  await writeFile(
    join(first.worktree.path, spec),
    "# First\nA requirement changed without a commit.",
  );
  const brief: Brief = await (await project.app.request(preview)).json();
  expect(brief.lastHandoff).toEqual(previous.handoff);
  expect(brief.checkpointCommit).toBe(previous.checkpointCommit);
  expect(brief.changedPaths).toEqual([spec]);
  expect(brief.prompt).toContain(`Last handoff (${previous.id}, codex)`);
  expect(brief.prompt).toContain(`Checkpoint commit: ${previous.checkpointCommit}`);
  expect(brief.prompt).toContain(`Changed since the last handoff:\n- ${spec}`);
  expect(brief.prompt).toContain("Where the handoff and the files disagree, the files win.");
  await writeFile(
    join(first.worktree.path, ticket),
    "# Checkpoint\nStatus: ready-for-agent\nBlocked by: none\nNew comment.",
  );
  const next = await start(project);
  expect(next.brief.lastHandoff).toEqual(previous.handoff);
  expect(next.brief.changedPaths).toEqual([ticket, spec]);
  expect(next.brief.checkpointCommit).toBe(previous.checkpointCommit);
  await ended(project, next.id);
});

test("a crashed work turn ends failed but still checkpoints its edits and records no handoff", async () => {
  const { project } = await fixture([
    { type: "write", path: "partial.txt", content: "Recoverable work" },
    { type: "crash" },
  ]);
  const started = await start(project);
  const stint = await ended(project, started.id);
  expect(stint).toMatchObject({ status: "failed", handoff: null });
  expect(stint.error).toMatch(/exited|transport|connection closed/i);
  expect(git(started.worktree.path, "show", `${stint.checkpointCommit}:partial.txt`)).toBe(
    "Recoverable work",
  );
});

test("a ticket's first brief resumes from the work item's last stint", async () => {
  const { project } = await fixture();
  const first = await start(project);
  const finished = await ended(project, first.id);
  await writeFile(
    join(first.worktree.path, ".scratch/first/issues/05-other.md"),
    "# Other\nStatus: ready-for-agent\nBlocked by: none",
  );
  const response = await project.app.request("/api/work-items/first/tickets/5/brief-preview");
  expect(response.status).toBe(200);
  const brief = await response.json();
  expect(brief).toMatchObject({
    lastHandoff: { stint: first.id },
    checkpointCommit: finished.checkpointCommit,
  });
  expect(brief.changedPaths).toContain(".scratch/first/issues/05-other.md");
});

test("checkpoint errors remain visible and do not report an unrecorded state as a checkpoint", async () => {
  const { root, project, tracked, base } = await fixture();
  const hooks = join(tracked.parent, "hooks");
  await mkdir(hooks);
  await writeFile(join(hooks, "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  git(root, "config", "core.hooksPath", hooks);
  const started = await start(project);
  const stint = await ended(project, started.id);
  expect(stint).toMatchObject({
    status: "failed",
    checkpointCommit: null,
    handoff: { ...handoffBody, stint: started.id, agent: "codex" },
  });
  expect(stint.error).toContain("Checkpoint failed:");
  expect(git(started.worktree.path, "rev-parse", "HEAD")).toBe(base);
  expect(await readFile(join(started.worktree.path, "implementation.txt"), "utf8")).toBe(
    "Implementation",
  );
});

test("closing the project interrupts and checkpoints an unfinished work turn", async () => {
  const { root, project } = await fixture(
    [
      { type: "write", path: "partial.txt", content: "Checkpoint on close" },
      { type: "message", text: "Work started" },
      { type: "delay", milliseconds: 30_000 },
    ],
    [],
  );
  const started = await start(project);
  await expect
    .poll(async () => {
      return (await entries(root, started.id)).filter((entry) => entry.type === "event").length;
    })
    .toBe(1);
  await project.stop();
  const stint = await ended(project, started.id);
  expect(stint).toMatchObject({ status: "interrupted", handoff: null });
  expect(git(started.worktree.path, "show", `${stint.checkpointCommit}:partial.txt`)).toBe(
    "Checkpoint on close",
  );
});

test("Codex's cancel decline ends its work turn but still receives a handoff and checkpoint", async () => {
  const { root, project } = await fixture([
    { type: "write", path: "partial.txt", content: "Before declined permission" },
    {
      type: "permission",
      toolCall: { toolCallId: "git", title: "git add", kind: "execute" },
      options: [{ optionId: "cancel", name: "Deny", kind: "reject_once" }],
      expectedOptionId: "cancel",
    },
    { type: "write", path: "after-decline.txt", content: "Must not continue the work turn" },
  ]);
  const started = await start(project);
  let requestId: string | undefined;
  await expect
    .poll(async () => {
      const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
      requestId = snapshot.workItems[0].activeStint?.events.find(
        (event) => event.type === "permission_request",
      )?.requestId;
      return requestId;
    })
    .toBeTruthy();
  expect((await entries(root, started.id)).some((entry) => entry.type === "ended")).toBe(false);
  const answer = await project.app.request(`/api/stints/${started.id}/permissions/${requestId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optionId: "cancel" }),
  });
  expect(answer.status).toBe(200);
  const stint = await ended(project, started.id);
  expect(stint).toMatchObject({
    status: "finished",
    handoff: { ...handoffBody, stint: started.id, agent: "codex" },
  });
  expect((await entries(root, started.id)).at(-1)).toMatchObject({
    type: "ended",
    stopReason: "cancelled",
  });
  expect(
    (await entries(root, started.id)).find(
      (entry) => entry.type === "event" && entry.event.type === "permission",
    ),
  ).toMatchObject({
    type: "event",
    event: { requestId, automatic: false, decision: { outcome: "selected", optionId: "cancel" } },
  });
  expect(git(started.worktree.path, "show", `${stint.checkpointCommit}:partial.txt`)).toBe(
    "Before declined permission",
  );
  await expect(readFile(join(started.worktree.path, "after-decline.txt"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("a handoff permission waits for the developer, then checkpoints rich events and writes from both turns", async () => {
  const { root, project, base } = await fixture(
    [
      { type: "write", path: "implementation.txt", content: "Implementation" },
      {
        type: "update",
        update: {
          sessionUpdate: "plan",
          entries: [{ content: "Implement", priority: "high", status: "completed" }],
        },
      },
      {
        type: "update",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "edit",
          title: "Write implementation",
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
          content: [
            {
              type: "diff",
              path: "/worktree/implementation.txt",
              oldText: null,
              newText: "Implementation",
            },
          ],
        },
      },
    ],
    [
      { type: "expect-prompt", includes: "## Where I stopped" },
      {
        type: "permission",
        toolCall: { toolCallId: "handoff", title: "Write handoff artifact", kind: "edit" },
        options: [{ optionId: "allow", name: "Yes, proceed", kind: "allow_once" }],
        expectedOptionId: "allow",
      },
      { type: "write", path: "handoff-artifact.txt", content: "Handoff artifact" },
      { type: "message", text: handoffText },
    ],
    2000,
  );
  const started = await start(project);
  let requestId: string | undefined;
  await expect
    .poll(async () => {
      const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
      requestId = snapshot.workItems[0].activeStint?.events.find(
        (event) => event.type === "permission_request",
      )?.requestId;
      return requestId;
    })
    .toBeTruthy();
  expect(git(started.worktree.path, "rev-parse", "HEAD")).toBe(base);
  expect((await entries(root, started.id)).at(-1)).toMatchObject({
    type: "event",
    event: { type: "permission_request", automatic: false },
  });
  const answer = await project.app.request(`/api/stints/${started.id}/permissions/${requestId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optionId: "allow" }),
  });
  expect(answer.status).toBe(200);
  const stint = await ended(project, started.id);
  expect(stint).toMatchObject({
    status: "finished",
    handoff: { ...handoffBody, stint: started.id, agent: "codex" },
  });
  expect(git(started.worktree.path, "rev-list", "--count", `${base}..HEAD`)).toBe("1");
  expect(git(root, "show", `${stint.checkpointCommit}:implementation.txt`)).toBe("Implementation");
  expect(git(root, "show", `${stint.checkpointCommit}:handoff-artifact.txt`)).toBe(
    "Handoff artifact",
  );
  expect(foldStintLog(await entries(root, stint.id))?.events).toMatchObject([
    { type: "plan", entries: [{ status: "completed" }] },
    { type: "tool_call", title: "Write implementation", status: "completed" },
    { type: "file_edit", path: "/worktree/implementation.txt" },
    { type: "permission_request", requestId },
    { type: "permission", requestId, automatic: false, decision: { optionId: "allow" } },
    { type: "message", text: handoffText },
  ]);
});

test("a timed-out handoff permission is no longer answerable and leaves no events after the ended entry", async () => {
  const { root, project } = await fixture(
    [{ type: "write", path: "partial.txt", content: "Partial" }],
    [
      {
        type: "permission",
        toolCall: { toolCallId: "handoff" },
        options: [{ optionId: "allow", name: "Yes, proceed", kind: "allow_once" }],
      },
      { type: "write", path: "late.txt", content: "Must not be written" },
    ],
    100,
  );
  const started = await start(project);
  const stint = await ended(project, started.id);
  expect(stint).toMatchObject({
    status: "finished",
    handoff: null,
    checkpointCommit: expect.any(String),
  });
  const log = await entries(root, started.id);
  const request = log.find(
    (entry) => entry.type === "event" && entry.event.type === "permission_request",
  );
  if (request?.type !== "event" || request.event.type !== "permission_request")
    throw new Error("Expected a permission request");
  expect(log.at(-2)).toMatchObject({
    type: "event",
    event: { type: "permission", automatic: false, decision: { outcome: "cancelled" } },
  });
  expect(log.at(-1)).toMatchObject({ type: "ended", handoff: null });
  expect(
    (
      await project.app.request(
        `/api/stints/${started.id}/permissions/${request.event.requestId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId: "allow" }),
        },
      )
    ).status,
  ).toBe(409);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(await entries(root, started.id)).toEqual(log);
  await expect(readFile(join(started.worktree.path, "late.txt"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test("HTTP and WebSocket expose the durable ended handoff and checkpoint in sequence", async () => {
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
  const done = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if (message.type !== "stint") return;
    messages.push(message);
    if (message.entry.type === "ended") resolveEnded();
  });
  await once(socket, "open");
  const response = await fetch(`${url}/api/stints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 4, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  await done;
  expect(messages.map(({ sequence }) => sequence)).toEqual(
    messages.map((_message, index) => index + 1),
  );
  expect(messages.at(-1)?.entry).toMatchObject({
    type: "ended",
    status: "finished",
    checkpointCommit: expect.any(String),
    handoff: { ...handoffBody, stint: stint.id, agent: "codex" },
  });
  expect(await entries(root, stint.id)).toEqual(messages.map(({ entry }) => entry));
});
