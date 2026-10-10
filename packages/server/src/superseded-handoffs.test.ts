import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher, type FakeAgentStep } from "@stintwork/agents/testing";
import type { Brief, ProjectSnapshot, Stint } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { createProjectServer } from "./index.js";

const fixtures: {
  parent: string;
  projects: ReturnType<typeof createProjectServer>[];
  socket?: WebSocket;
}[] = [];

afterEach(async () => {
  for (const { parent, projects, socket } of fixtures.splice(0)) {
    socket?.terminate();
    for (const project of projects) await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});

test.each([
  { ticket: 1, live: false },
  { ticket: null, live: false },
  { ticket: 1, live: true },
  { ticket: null, live: true },
])(
  "resuming $ticket removes the source handoff, keeps new questions, and survives restart (WebSocket: $live)",
  async ({ ticket, live }) => {
    const parent = await mkdtemp(join(tmpdir(), "stintwork-superseded-handoffs-"));
    const tracked = {
      parent,
      projects: [] as ReturnType<typeof createProjectServer>[],
      socket: undefined as WebSocket | undefined,
    };
    fixtures.push(tracked);
    const root = join(parent, "project");
    execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
    execFileSync("git", ["config", "user.name", "Developer"], { cwd: root });
    execFileSync("git", ["config", "user.email", "developer@example.invalid"], { cwd: root });
    const stage = ticket === null ? "clarify" : "implement";
    for (const [path, text] of Object.entries({
      "web/index.html": "<!doctype html><title>Stintwork</title>",
      ".gitignore": ".stintwork/local/\n",
      "AGENTS.md": "Project conventions",
      ".scratch/first/spec.md": "# First",
      ".scratch/first/workflow.yaml": `workflow: feature\nstage: ${stage}\n`,
      ".scratch/first/issues/01-first.md":
        "# First ticket\nStatus: ready-for-agent\nBlocked by: none",
    })) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "--quiet", "-m", "Fixture"], { cwd: root });

    let work: FakeAgentStep[] = [];
    let unresolved = "Checks unverified; ticket not updated.";
    const options = {
      launchAgent: (input: Parameters<ReturnType<typeof createFakeAgentLauncher>>[0]) =>
        createFakeAgentLauncher(work, [
          {
            type: "message",
            text: `## Where I stopped\nImplementation written.\n## Unresolved\n${unresolved}\n## Suggested next\nVerify checks.`,
          },
        ])(input),
      handoffTimeoutMs: 2000,
    };
    let project = createProjectServer(root, join(root, "web"), options);
    tracked.projects.push(project);
    const snapshots: ProjectSnapshot[] = [];

    async function start() {
      const response = await project.app.request("/api/stints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItem: "first", ticket, agent: "codex" }),
      });
      expect(response.status).toBe(201);
      return ((await response.json()) as { stint: Stint }).stint;
    }

    async function ended(id: string) {
      await expect
        .poll(async () => {
          const body: { stint: Stint } = await (
            await project.app.request(`/api/stints/${id}`)
          ).json();
          return body.stint.endedAt;
        })
        .toBeTruthy();
    }

    async function snapshot(): Promise<ProjectSnapshot> {
      return (await project.app.request("/api/project")).json();
    }

    async function latest() {
      return live ? snapshots.at(-1) : snapshot();
    }

    const first = await start();
    await ended(first.id);
    const original = (await snapshot()).attentionItems;
    expect(original.filter((item) => item.kind === "handoff-unresolved")).toMatchObject([
      { kind: "handoff-unresolved", stintId: first.id, ticket },
    ]);
    if (live) {
      const server = await project.start();
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected TCP address.");
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/live`);
      tracked.socket = socket;
      socket.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type !== "stint") snapshots.push(message);
      });
      await once(socket, "open");
    }
    await expect.poll(async () => (await latest())?.attentionItems).toEqual(original);
    const previewPath = `/api/work-items/first${ticket === null ? "" : `/tickets/${ticket}`}/brief-preview`;
    const preview: Brief = await (await project.app.request(previewPath)).json();
    expect(preview.lastHandoff?.stint).toBe(first.id);
    expect((await snapshot()).attentionItems).toEqual(original);
    const rejected = await project.app.request("/api/stints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workItem: "first", ticket, agent: "unknown" }),
    });
    expect(rejected.status).toBe(400);
    expect((await snapshot()).attentionItems).toEqual(original);
    work = [
      { type: "expect-prompt", includes: `Last handoff (${first.id}, codex):` },
      { type: "hang" },
    ];
    unresolved = "A new question.";
    const resumed = await start();
    expect(resumed.brief.lastHandoff?.stint).toBe(first.id);
    await expect.poll(async () => (await latest())?.workItems[0].activeStint?.id).toBe(resumed.id);
    expect((await latest())?.attentionItems).toEqual([]);
    expect(
      (await project.app.request(`/api/stints/${resumed.id}/stop`, { method: "POST" })).status,
    ).toBe(202);
    await ended(resumed.id);
    await expect
      .poll(async () =>
        (await latest())?.attentionItems.filter((item) => item.kind === "handoff-unresolved"),
      )
      .toMatchObject([
        { kind: "handoff-unresolved", stintId: resumed.id, details: "A new question." },
      ]);
    tracked.socket?.terminate();
    await project.stop();
    project = createProjectServer(root, join(root, "web"), options);
    tracked.projects.push(project);
    expect(
      (await snapshot()).attentionItems
        .filter((item) => item.kind === "handoff-unresolved")
        .map((item) => item.stintId),
    ).toEqual([resumed.id]);
    work = [{ type: "expect-prompt", includes: `Last handoff (${resumed.id}, codex):` }];
    unresolved = "None";
    const finished = await start();
    await ended(finished.id);
    expect(
      (await snapshot()).attentionItems.filter((item) => item.kind === "handoff-unresolved"),
    ).toEqual([]);
    await project.stop();
    project = createProjectServer(root, join(root, "web"), options);
    tracked.projects.push(project);
    const rebuilt = await snapshot();
    expect(rebuilt.attentionItems.filter((item) => item.kind === "handoff-unresolved")).toEqual([]);
    expect(rebuilt.attentionItems.filter((item) => item.kind === "gate-ready")).toHaveLength(
      ticket === null ? 1 : 0,
    );
    expect(rebuilt.workItems[0].stints.map((stint) => stint.lastHandoffStintId)).toEqual([
      resumed.id,
      first.id,
      undefined,
    ]);
  },
);
