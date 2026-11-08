// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAgentRegistry } from "@stintwork/agents";
import {
  createFakeAgentLauncher,
  fakeAgentProfiles,
  type FakeAgentStep,
} from "@stintwork/agents/testing";
import {
  gateReadiness,
  type Brief,
  type ProjectSnapshot,
  type Stint,
  type StintLogEntry,
} from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";

const note = "Use CSV.\nKeep the header and use UTC.";
const fixtures: { parent: string; projects: ReturnType<typeof createProjectServer>[] }[] = [];

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function fixture(stage = "implement") {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-handoff-notes-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  git(root, "config", "user.name", "Developer");
  git(root, "config", "user.email", "developer@example.invalid");
  for (const [path, content] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    ".gitignore": ".stintwork/local/\n",
    "AGENTS.md": "Project conventions",
    ".scratch/first/spec.md": "# First work item",
    ".scratch/first/workflow.yaml": `workflow: feature\nstage: ${stage}\nstages:\n  ${stage}:\n    agent: codex\n`,
    ".scratch/first/issues/01-first.md":
      "# First ticket\nStatus: ready-for-agent\nBlocked by: none",
    ".scratch/first/issues/02-second.md":
      "# Second ticket\nStatus: ready-for-agent\nBlocked by: none",
    ".scratch/other/spec.md": "# Other work item",
    ".scratch/other/workflow.yaml": "workflow: feature\nstage: implement\n",
    ".scratch/other/issues/01-first.md":
      "# Other ticket\nStatus: ready-for-agent\nBlocked by: none",
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const script = {
    work: [] as FakeAgentStep[],
    unresolved: "Which export format should be used?",
    blockReady: false,
  };
  const launchAgent = (input: Parameters<ReturnType<typeof createFakeAgentLauncher>>[0]) =>
    script.blockReady
      ? (() => {
          let finish!: (result: { stopReason: string }) => void;
          return {
            ready: new Promise<void>(() => {}),
            done: new Promise<{ stopReason: string }>((resolve) => {
              finish = resolve;
            }),
            cancel: async () => {
              finish({ stopReason: "cancelled" });
            },
          };
        })()
      : createFakeAgentLauncher(script.work, [
          {
            type: "message",
            text: `## Where I stopped\nExport written.\n## Unresolved\n${script.unresolved}\n## Suggested next\nChoose the format.`,
          },
        ])(input);
  const options = {
    agentRegistry: createAgentRegistry([{ ...fakeAgentProfiles.codex, launch: launchAgent }]),
    launchAgent,
    handoffTimeoutMs: 2000,
  };
  let project = createProjectServer(root, join(root, "web"), options);
  const tracked = { parent, projects: [project] };
  fixtures.push(tracked);
  return {
    root,
    script,
    get project() {
      return project;
    },
    async restart() {
      await project.stop();
      project = createProjectServer(root, join(root, "web"), options);
      tracked.projects.push(project);
    },
  };
}

afterEach(async () => {
  for (const { parent, projects } of fixtures.splice(0)) {
    for (const project of projects) await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});

async function snapshot(project: ReturnType<typeof createProjectServer>): Promise<ProjectSnapshot> {
  return (await project.app.request("/api/project")).json();
}

async function start(project: ReturnType<typeof createProjectServer>, ticket: number | null = 1) {
  const response = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { stint: Stint }).stint;
}

async function ended(project: ReturnType<typeof createProjectServer>, id: string) {
  await expect
    .poll(
      async () => {
        const response = await project.app.request(`/api/stints/${id}`);
        const body: { stint: Stint } = await response.json();
        return body.stint.endedAt;
      },
      { timeout: 10_000 },
    )
    .toBeTruthy();
  const body: { stint: Stint } = await (await project.app.request(`/api/stints/${id}`)).json();
  return body.stint;
}

function answer(project: ReturnType<typeof createProjectServer>, id: string, text: string | null) {
  return project.app.request(`/api/stints/${id}/handoff-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: text }),
  });
}

function previewPath(ticket: number | null, workItem = "first") {
  return `/api/work-items/${workItem}${ticket === null ? "" : `/tickets/${ticket}`}/brief-preview`;
}

async function preview(
  project: ReturnType<typeof createProjectServer>,
  ticket: number | null,
  workItem = "first",
): Promise<Brief> {
  const response = await project.app.request(previewPath(ticket, workItem));
  expect(response.status).toBe(200);
  return response.json();
}

test.each([
  { stage: "implement", ticket: 1, nextTicket: 1 },
  { stage: "implement", ticket: 1, nextTicket: 2 },
  { stage: "clarify", ticket: null, nextTicket: null },
])(
  "a $stage handoff's note survives restart, reaches the next brief and fake agent, and is consumed on start (ticket $nextTicket)",
  async ({ stage, ticket, nextTicket }) => {
    const state = await fixture(stage);
    const remainingAttention =
      stage === "clarify" ? [{ kind: "gate-ready", id: 'gate-ready:["first","clarify"]' }] : [];
    const first = await start(state.project, ticket);
    expect((await ended(state.project, first.id)).handoff?.unresolved).toBe(
      state.script.unresolved,
    );
    expect((await snapshot(state.project)).attentionItems).toMatchObject([
      ...remainingAttention,
      {
        kind: "handoff-unresolved",
        stintId: first.id,
        workItem: "first",
        ticket,
      },
    ]);
    const response = await answer(state.project, first.id, `  ${note}  `);
    expect(response.status).toBe(200);
    const receipt = await response.json();
    expect(receipt.answer).toEqual({ at: expect.any(String), note });
    expect((await snapshot(state.project)).attentionItems).toMatchObject(remainingAttention);
    expect((await answer(state.project, first.id, note)).status).toBe(200);
    expect((await answer(state.project, first.id, "Different answer")).status).toBe(409);
    const entries: StintLogEntry[] = (
      await readFile(join(state.root, `.stintwork/local/stints/${first.id}.jsonl`), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entries.filter((entry) => entry.type === "handoff_answered")).toEqual([
      { type: "handoff_answered", at: receipt.answer.at, note },
    ]);
    const before = await preview(state.project, nextTicket);
    expect(before.developerNotes).toEqual([{ id: first.id, at: receipt.answer.at, text: note }]);
    expect(before.prompt).toContain(`Developer note (${receipt.answer.at}):\n${note}`);
    expect((await preview(state.project, null)).developerNotes).toEqual(before.developerNotes);
    expect((await preview(state.project, 1, "other")).developerNotes).toEqual([]);
    const rejected = await state.project.app.request("/api/stints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workItem: "first", ticket: nextTicket, agent: "unknown" }),
    });
    expect(rejected.status).toBe(400);
    expect((await preview(state.project, nextTicket)).developerNotes).toEqual(
      before.developerNotes,
    );
    await state.restart();
    expect((await snapshot(state.project)).attentionItems).toMatchObject(remainingAttention);
    expect((await preview(state.project, nextTicket)).developerNotes).toEqual(
      before.developerNotes,
    );
    state.script.work = [
      { type: "expect-prompt", includes: `Developer note (${receipt.answer.at}):\n${note}` },
    ];
    state.script.unresolved = "None";
    const next = await start(state.project, nextTicket);
    expect(next.brief.developerNotes).toEqual(before.developerNotes);
    const completed = await ended(state.project, next.id);
    expect(completed.status).toBe("finished");
    expect(completed.brief.prompt).toContain(note);
    expect((await preview(state.project, nextTicket)).developerNotes).toEqual([]);
    expect((await preview(state.project, null)).prompt).not.toContain("Developer note (");
    await state.restart();
    expect((await preview(state.project, nextTicket)).developerNotes).toEqual([]);
    expect((await snapshot(state.project)).attentionItems).toMatchObject(remainingAttention);
    expect((await ended(state.project, first.id)).handoffAnswer).toEqual(receipt.answer);
  },
);

test("a pre-ready disconnect preserves gate evidence and developer notes", async () => {
  const state = await fixture("clarify");
  const first = await start(state.project, null);
  await ended(state.project, first.id);
  await answer(state.project, first.id, note);
  const before = await preview(state.project, null);
  expect(before.developerNotes).toHaveLength(1);
  expect(gateReadiness((await snapshot(state.project)).workItems[0]).ready).toBe(true);
  state.script.blockReady = true;
  const controller = new AbortController();
  const request = state.project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: null, agent: "codex" }),
    signal: controller.signal,
  });
  await expect
    .poll(async () =>
      (await snapshot(state.project)).workItems[0].stints.some(
        (stint) => stint.status === "running",
      ),
    )
    .toBe(true);
  controller.abort();
  expect((await request).status).toBe(503);
  const item = (await snapshot(state.project)).workItems[0];
  expect(item.stints[0].status).toBe("preparation-failed");
  expect(gateReadiness(item).ready).toBe(true);
  expect((await preview(state.project, null)).developerNotes).toEqual(before.developerNotes);
});

test("dismissing a handoff removes it across restarts without creating a developer note", async () => {
  const state = await fixture();
  const stint = await start(state.project);
  await ended(state.project, stint.id);
  expect((await snapshot(state.project)).attentionItems).toHaveLength(1);
  expect((await answer(state.project, stint.id, null)).status).toBe(200);
  expect((await answer(state.project, stint.id, null)).status).toBe(200);
  expect((await snapshot(state.project)).attentionItems).toEqual([]);
  await state.restart();
  expect((await snapshot(state.project)).attentionItems).toEqual([]);
  expect((await preview(state.project, 1)).developerNotes).toEqual([]);
  expect((await ended(state.project, stint.id)).handoffAnswer?.note).toBeNull();
  expect((await answer(state.project, stint.id, note)).status).toBe(409);
});

test("unanswered handoffs are rebuilt, invalid answers do not resolve them, and foreign origins are refused", async () => {
  const state = await fixture();
  const stint = await start(state.project);
  await ended(state.project, stint.id);
  const original = (await snapshot(state.project)).attentionItems;
  await state.restart();
  expect((await snapshot(state.project)).attentionItems).toEqual(original);
  for (const body of ["{", "{}", '{"note":42}', '{"note":" \\n "}']) {
    const response = await state.project.app.request(`/api/stints/${stint.id}/handoff-answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(response.status).toBe(400);
  }
  expect(
    (
      await state.project.app.request(`/api/stints/${stint.id}/handoff-answer`, {
        method: "POST",
        body: JSON.stringify({ note }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await state.project.app.request(`/api/stints/${stint.id}/handoff-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://foreign.invalid" },
        body: JSON.stringify({ note }),
      })
    ).status,
  ).toBe(403);
  expect((await answer(state.project, "missing", note)).status).toBe(404);
  expect((await snapshot(state.project)).attentionItems).toEqual(original);
  expect((await preview(state.project, 1)).developerNotes).toEqual([]);
});

test("running stints and None handoffs cannot receive notes", async () => {
  const state = await fixture();
  state.script.work = [{ type: "hang" }];
  state.script.unresolved = "None";
  const stint = await start(state.project);
  expect((await answer(state.project, stint.id, note)).status).toBe(409);
  expect(
    (await state.project.app.request(`/api/stints/${stint.id}/stop`, { method: "POST" })).status,
  ).toBe(202);
  expect((await ended(state.project, stint.id)).handoff?.unresolved).toBe("None");
  expect((await answer(state.project, stint.id, null)).status).toBe(409);
});

test("a corrupt stint log refuses an answer rather than claiming it was persisted", async () => {
  const state = await fixture();
  const stint = await start(state.project);
  await ended(state.project, stint.id);
  const path = join(state.root, `.stintwork/local/stints/${stint.id}.jsonl`);
  const original = await readFile(path, "utf8");
  await writeFile(path, `${original}{\n`);
  const response = await answer(state.project, stint.id, note);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    reason: "The stint log has invalid entries.",
    reasonMessage: { code: "stint.invalidLog" },
  });
  expect(await readFile(path, "utf8")).toBe(`${original}{\n`);
  expect((await preview(state.project, 1)).developerNotes).toEqual([]);
});
