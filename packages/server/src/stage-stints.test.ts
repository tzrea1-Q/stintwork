// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher, type FakeAgentStep } from "@stintwork/agents/testing";
import { type Brief, foldStintLog, type Stint, type StintLogEntry } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";

const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];
const folder = ".scratch/planning";
const spec = `${folder}/spec.md`;
const preview = "/api/work-items/planning/brief-preview";
const handoff =
  "## Where I stopped\nWrote the spec.\n## Unresolved\nConfirm the limit.\n## Suggested next\nCreate tickets.";

function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function write(root: string, path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

async function fixture(
  script: readonly FakeAgentStep[] = [
    { type: "expect-prompt", includes: `/to-spec ${folder}/` },
    { type: "expect-prompt", includes: "No spec yet." },
    { type: "write", path: spec, content: "# Planned feature\nLimit: 32" },
    { type: "message", text: "Spec ready" },
  ],
) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-stage-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  git(root, "config", "user.name", "Developer");
  git(root, "config", "user.email", "developer@example.invalid");
  await write(root, "AGENTS.md", "Conventions");
  await write(root, ".gitignore", ".stintwork/local/\n");
  await write(root, `${folder}/workflow.yaml`, "workflow: feature\nstage: spec\n");
  await write(root, "web/index.html", "<!doctype html><title>Stintwork</title>");
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture");
  const project = createProjectServer(root, join(root, "web"), {
    launchAgent: createFakeAgentLauncher(script, [
      { type: "write", path: `${folder}/notes.md`, content: "Handoff artifact" },
      { type: "message", text: handoff },
    ]),
  });
  const tracked = { parent, project };
  fixtures.push(tracked);
  return { root, project, tracked };
}

afterEach(async () => {
  for (const { parent, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});

function start(project: ReturnType<typeof createProjectServer>, ticket?: unknown) {
  return project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workItem: "planning",
      agent: "codex",
      ...(ticket === undefined ? {} : { ticket }),
    }),
  });
}

async function ended(project: ReturnType<typeof createProjectServer>, id: string) {
  let stint: Stint | undefined;
  await expect
    .poll(async () => {
      const response = await project.app.request(`/api/stints/${id}`);
      expect(response.status).toBe(200);
      ({ stint } = await response.json());
      return stint?.status;
    })
    .not.toBe("running");
  return stint as Stint;
}

test.each([undefined, null])(
  "Spec starts without a ticket (%s), checkpoints both turns and resumes after restart",
  async (ticket) => {
    const { root, project, tracked } = await fixture();
    const response = await project.app.request(preview);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const brief: Brief = await response.json();
    expect(brief.prompt).toContain(`/to-spec ${folder}/`);
    expect(brief.prompt).toContain("No spec yet.");
    const started = await start(project, ticket);
    expect(started.status).toBe(201);
    const { stint }: { stint: Stint } = await started.json();
    expect(stint).toMatchObject({ stage: "spec", ticket: null, brief });
    const finished = await ended(project, stint.id);
    expect(finished).toMatchObject({
      status: "finished",
      ticket: null,
      stage: "spec",
      handoff: {
        stint: stint.id,
        agent: "codex",
        stoppedAt: "Wrote the spec.",
        unresolved: "Confirm the limit.",
      },
    });
    const checkpoint = finished.checkpointCommit as string;
    expect(git(stint.worktree.path, "show", `${checkpoint}:${spec}`)).toContain("Limit: 32");
    expect(git(stint.worktree.path, "show", `${checkpoint}:${folder}/notes.md`)).toBe(
      "Handoff artifact",
    );
    expect(git(stint.worktree.path, "status", "--porcelain")).toBe("");
    expect(git(root, "ls-tree", "HEAD", "--", spec)).toBe("");
    expect(await readFile(join(stint.worktree.path, `${folder}/workflow.yaml`), "utf8")).toContain(
      "agent: codex",
    );
    const entries: StintLogEntry[] = (
      await readFile(join(root, `.stintwork/local/stints/${stint.id}.jsonl`), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(foldStintLog(entries)).toEqual(finished);
    await project.stop();
    tracked.project = createProjectServer(root, join(root, "web"), {
      launchAgent: createFakeAgentLauncher(
        [
          { type: "expect-prompt", includes: `Last handoff (${stint.id}, codex)` },
          { type: "expect-prompt", includes: `Checkpoint commit: ${checkpoint}` },
          { type: "expect-file", path: spec, includes: "Limit: 64" },
          { type: "write", path: "continued.txt", content: "Continued from the stage handoff" },
        ],
        [{ type: "message", text: handoff }],
      ),
    });
    expect(await (await tracked.project.app.request(`/api/stints/${stint.id}`)).json()).toEqual({
      stint: finished,
    });
    await write(stint.worktree.path, spec, "# Planned feature\nLimit: 64");
    const next: Brief = await (await tracked.project.app.request(preview)).json();
    expect(next.lastHandoff).toEqual(finished.handoff);
    expect(next.checkpointCommit).toBe(checkpoint);
    expect(next.changedPaths).toContain(spec);
    expect(next.pointers).toContainEqual({
      path: spec,
      reason: "Work item scope and acceptance criteria",
    });
    const continuation = await start(tracked.project);
    expect(continuation.status).toBe(201);
    const continued: { stint: Stint } = await continuation.json();
    expect(continued.stint.brief).toEqual(next);
    const completed = await ended(tracked.project, continued.stint.id);
    expect(completed).toMatchObject({
      status: "finished",
      ticket: null,
      handoff: { stint: continued.stint.id },
    });
    expect(git(stint.worktree.path, "show", `${completed.checkpointCommit}:continued.txt`)).toBe(
      "Continued from the stage handoff",
    );
  },
);

test("stage and ticket starts share the work item active-stint guard, and stopping records a handoff", async () => {
  const { project, root } = await fixture([
    { type: "write", path: spec, content: "# Draft" },
    { type: "hang" },
  ]);
  await write(
    root,
    `${folder}/issues/01-work.md`,
    "# Work\nStatus: ready-for-agent\nBlocked by: none",
  );
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Add fixture ticket");
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  for (const ticket of [undefined, 1]) {
    const refusal = await start(project, ticket);
    expect(refusal.status).toBe(409);
    expect(await refusal.json()).toEqual({
      reason: "A stint is already active for this work item.",
    });
  }
  expect((await project.app.request(preview)).status).toBe(409);
  const stop = await project.app.request(`/api/stints/${stint.id}/stop`, { method: "POST" });
  expect(stop.status).toBe(202);
  expect(await ended(project, stint.id)).toMatchObject({
    status: "stopped",
    ticket: null,
    checkpointCommit: expect.any(String),
    handoff: { unresolved: "Confirm the limit." },
  });
});

test.each([
  ["feature", "ship"],
  ["quick", "do"],
])("%s %s refuses stage starts without creating a worktree or log", async (workflow, stage) => {
  const { root, project } = await fixture();
  await write(root, `${folder}/workflow.yaml`, `workflow: ${workflow}\nstage: ${stage}\n`);
  expect((await project.app.request(preview)).status).toBe(409);
  expect((await start(project)).status).toBe(409);
  expect(git(root, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
  await expect(readFile(join(root, ".stintwork/local/stints"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

test.each([
  ["feature", "implement", "/implement"],
  ["bug", "fix", "/tdd"],
])("%s %s can use its skill without a ticket", async (workflow, stage, skill) => {
  const { root, project } = await fixture([
    { type: "expect-prompt", includes: `${skill} ${folder}/` },
    { type: "write", path: "stage-work.txt", content: "Stage work" },
  ]);
  await write(root, `${folder}/workflow.yaml`, `workflow: ${workflow}\nstage: ${stage}\n`);
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Skill stage fixture");
  const response = await start(project);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  expect(stint).toMatchObject({ stage, ticket: null });
  expect(await ended(project, stint.id)).toMatchObject({
    status: "finished",
    ticket: null,
    checkpointCommit: expect.any(String),
    handoff: { stint: stint.id },
  });
});

test("invalid optional tickets are rejected, not silently treated as stage starts", async () => {
  const { project } = await fixture();
  for (const ticket of [0, -1, 1.5, "1", {}, false])
    expect((await start(project, ticket)).status).toBe(400);
  expect((await start(project, 99)).status).toBe(409);
  expect((await project.app.request("/api/work-items/missing/brief-preview")).status).toBe(404);
});

test("Review can start on a resolved ticket without treating it as implementation", async () => {
  const ticket = `${folder}/issues/01-work.md`;
  const { root, project } = await fixture([
    { type: "expect-prompt", includes: `/code-review ${ticket}` },
    { type: "expect-prompt", includes: `Work on the Review stage for ticket ${ticket} only.` },
    { type: "expect-file", path: ticket, includes: "Status: resolved" },
    { type: "message", text: "Review finished" },
  ]);
  await write(root, `${folder}/workflow.yaml`, "workflow: feature\nstage: review\n");
  await write(root, ticket, "# Work\nStatus: resolved\nBlocked by: none");
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Review fixture");
  const response = await start(project, 1);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  expect(stint).toMatchObject({ stage: "review", ticket: 1 });
  expect(stint.brief.prompt).not.toContain("Update the ticket Status");
  const finished = await ended(project, stint.id);
  expect(finished).toMatchObject({
    status: "finished",
    ticket: 1,
    checkpointCommit: expect.any(String),
    handoff: { stint: stint.id },
  });
  const next: Brief = await (await project.app.request(preview)).json();
  expect(next.prompt).toContain(`/code-review ${folder}/`);
  expect(next.lastHandoff).toEqual(finished.handoff);
  expect(next.checkpointCommit).toBe(finished.checkpointCommit);
});
