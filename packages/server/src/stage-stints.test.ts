// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher, type FakeAgentStep } from "@stintwork/agents/testing";
import {
  type Brief,
  coreText,
  coreTextWire,
  foldStintLog,
  type ProjectSnapshot,
  type Stint,
  type StintLogEntry,
} from "@stintwork/core";
import { afterEach, expect, test, vi } from "vitest";
import { ensureWorktree, worktreePath } from "@stintwork/git";
import { createProjectServer } from "./index.js";
import * as briefPreview from "./brief-preview.js";

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
  workflow: string | null = "workflow: feature\nstage: spec\n",
) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-stage-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  git(root, "config", "user.name", "Developer");
  git(root, "config", "user.email", "developer@example.invalid");
  await write(root, "AGENTS.md", "Conventions");
  await write(root, ".gitignore", ".stintwork/local/\n");
  if (workflow !== null) await write(root, `${folder}/workflow.yaml`, workflow);
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
  vi.restoreAllMocks();
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

test("first stint refuses a dirty workflow in an existing worktree without committing it", async () => {
  const { root, project } = await fixture();
  const worktree = await ensureWorktree(root, "planning");
  const path = `${folder}/workflow.yaml`;
  await writeFile(join(worktree.path, path), "workflow: feature\nstage: spec\n# staged\n");
  git(worktree.path, "add", path);
  await writeFile(
    join(worktree.path, path),
    "workflow: feature\nstage: spec\n# staged\n# unstaged\n",
  );
  const bytes = await readFile(join(worktree.path, path));
  const index = git(worktree.path, "ls-files", "--stage", "--", path);
  const blob = git(worktree.path, "show", `:${path}`);
  const head = git(worktree.path, "rev-parse", "HEAD");
  const response = await start(project);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ reasonMessage: { code: "workflow.dirtyFile" } });
  expect(await readFile(join(worktree.path, path))).toEqual(bytes);
  expect(git(worktree.path, "ls-files", "--stage", "--", path)).toBe(index);
  expect(git(worktree.path, "show", `:${path}`)).toBe(blob);
  expect(git(worktree.path, "rev-parse", "HEAD")).toBe(head);
});

test("first stint refuses a workflow edited while the brief is prepared", async () => {
  const { root, project } = await fixture();
  const worktree = await ensureWorktree(root, "planning");
  const path = `${folder}/workflow.yaml`;
  const file = join(worktree.path, path);
  const edited = "workflow: feature\nstage: spec\n# edited during brief\n";
  const head = git(worktree.path, "rev-parse", "HEAD");
  const index = git(worktree.path, "ls-files", "--stage", "--", path);
  const prepare = briefPreview.prepareStintBrief;
  let calls = 0;
  vi.spyOn(briefPreview, "prepareStintBrief").mockImplementation(async (...args) => {
    const result = await prepare(...args);
    if (++calls === 2) await writeFile(file, edited);
    return result;
  });
  const response = await start(project);
  expect(calls).toBe(2);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ reasonMessage: { code: "workflow.dirtyFile" } });
  expect(await readFile(file, "utf8")).toBe(edited);
  expect(git(worktree.path, "ls-files", "--stage", "--", path)).toBe(index);
  expect(git(worktree.path, "rev-parse", "HEAD")).toBe(head);
});

test.each(["file", "index"] as const)(
  "first stint refuses a changed %s after inheriting stage agents",
  async (change) => {
    const { root, project } = await fixture();
    const path = `${folder}/workflow.yaml`;
    await writeFile(
      join(root, path),
      "workflow: feature\nstage: spec\nstages:\n  review:\n    agent: codex\n",
    );
    const worktree = await worktreePath(root, "planning");
    const file = join(worktree, path);
    const head = git(root, "rev-parse", "HEAD");
    const prepare = briefPreview.prepareStintBrief;
    let calls = 0;
    let bytes = "";
    let index = "";
    vi.spyOn(briefPreview, "prepareStintBrief").mockImplementation(async (...args) => {
      const result = await prepare(...args);
      if (++calls === 2) {
        const inherited = await readFile(file, "utf8");
        expect(inherited).toContain("agent: codex");
        if (change === "file") await writeFile(file, `${inherited}# developer edit\n`);
        else git(worktree, "add", path);
        bytes = await readFile(file, "utf8");
        index = git(worktree, "ls-files", "--stage", "--", path);
      }
      return result;
    });
    const response = await start(project);
    expect(calls).toBe(2);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reasonMessage: { code: "workflow.dirtyFile" } });
    expect(await readFile(file, "utf8")).toBe(bytes);
    expect(git(worktree, "ls-files", "--stage", "--", path)).toBe(index);
    expect(git(worktree, "rev-parse", "HEAD")).toBe(head);
  },
);

test("a failed brief after inheriting stage agents leaves the workflow clean so a retry starts", async () => {
  const { root, project } = await fixture();
  const path = `${folder}/workflow.yaml`;
  await writeFile(
    join(root, path),
    "workflow: feature\nstage: spec\nstages:\n  review:\n    agent: codex\n",
  );
  const worktree = await worktreePath(root, "planning");
  const prepare = briefPreview.prepareStintBrief;
  let calls = 0;
  vi.spyOn(briefPreview, "prepareStintBrief").mockImplementation(async (...args) => {
    const result = await prepare(...args);
    if (++calls === 2)
      return { reason: coreText({ code: "server.stopping" }), status: 409 as const };
    return result;
  });
  const refused = await start(project);
  expect(refused.status).toBe(503);
  expect(git(worktree, "status", "--porcelain", "--", path)).toBe("");
  const retry = await start(project);
  expect(retry.status, await retry.clone().text()).toBe(201);
  const { stint } = await retry.json();
  expect((await ended(project, stint.id)).status).toBe("finished");
});

test("a thrown brief failure preserves developer edits after inherited agents", async () => {
  const { root, project } = await fixture();
  const path = `${folder}/workflow.yaml`;
  await writeFile(
    join(root, path),
    "workflow: feature\nstage: spec\nstages:\n  review:\n    agent: codex\n",
  );
  const worktree = await worktreePath(root, "planning");
  const file = join(worktree, path);
  const prepare = briefPreview.prepareStintBrief;
  let calls = 0;
  let edited = "";
  vi.spyOn(briefPreview, "prepareStintBrief").mockImplementation(async (...args) => {
    const result = await prepare(...args);
    if (++calls === 2) {
      edited = `${await readFile(file, "utf8")}# developer edit\n`;
      await writeFile(file, edited);
      throw new Error("brief failed");
    }
    return result;
  });
  expect((await start(project)).status).toBe(503);
  expect(await readFile(file, "utf8")).toBe(edited);
});

test("a first stint refused mid-preparation keeps first-stint setup on retry", async () => {
  const { root, project } = await fixture();
  const worktree = await ensureWorktree(root, "planning");
  const file = join(worktree.path, folder, "workflow.yaml");
  const original = await readFile(file, "utf8");
  const prepare = briefPreview.prepareStintBrief;
  let calls = 0;
  vi.spyOn(briefPreview, "prepareStintBrief").mockImplementation(async (...args) => {
    const result = await prepare(...args);
    if (++calls === 2) await writeFile(file, `${original}# developer edit\n`);
    return result;
  });
  const refused = await start(project);
  expect(refused.status).toBe(503);
  expect(await refused.json()).toMatchObject({ reasonMessage: { code: "workflow.dirtyFile" } });
  await writeFile(file, original);
  const retry = await start(project);
  expect(retry.status, await retry.clone().text()).toBe(201);
  const { stint } = await retry.json();
  expect((await ended(project, stint.id)).status).toBe("finished");
  expect(await readFile(file, "utf8")).toContain("agent: codex");
});

test.each([
  ["quick", "do", "/implement", "review"],
  ["bug", "diagnose", "/diagnosing-bugs", "fix"],
])(
  "a freshly created %s starts from intent without tickets and checkpoints its first stint",
  async (workflow, stage, skill, nextStage) => {
    const intent = "Change the greeting to Hello.";
    const { root, project } = await fixture(
      [
        { type: "expect-prompt", includes: `${skill} ${folder}/` },
        { type: "expect-prompt", includes: `What the developer asked for:\n${intent}` },
        { type: "expect-prompt", includes: "No spec yet." },
        { type: "expect-file", path: `${folder}/workflow.yaml`, includes: intent },
        { type: "write", path: "greeting.txt", content: "Hello" },
      ],
      null,
    );
    const created = await project.app.request("/api/work-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Planning", workflow, intent }),
    });
    expect(created.status).toBe(201);
    const before: ProjectSnapshot = await (await project.app.request("/api/project")).json();
    expect(before.workItems).toHaveLength(1);
    expect(before.workItems[0]).toMatchObject({ stage, intent, spec: null, tickets: [] });
    expect(before.workItems[0].worktreePath).toBeUndefined();
    const previewed = await project.app.request(preview);
    const response = await start(project);
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
    expect(previewed.status).toBe(200);
    const brief: Brief = await previewed.json();
    expect(brief.skill).toBe(skill);
    expect(brief.prompt).toContain(`What the developer asked for:\n${intent}`);
    const { stint }: { stint: Stint } = await response.json();
    expect(stint).toMatchObject({ stage, ticket: null, brief });
    const finished = await ended(project, stint.id);
    expect(finished).toMatchObject({
      status: "finished",
      ticket: null,
      checkpointCommit: expect.any(String),
      handoff: { stint: stint.id },
    });
    expect(git(stint.worktree.path, "show", `${finished.checkpointCommit}:greeting.txt`)).toBe(
      "Hello",
    );
    expect(git(stint.worktree.path, "status", "--porcelain")).toBe("");
    await expect(readFile(join(root, "greeting.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    const after: ProjectSnapshot = await (await project.app.request("/api/project")).json();
    expect(after.workItems[0]).toMatchObject({
      stage,
      intent,
      spec: null,
      tickets: [],
      worktreePath: stint.worktree.path,
    });
    const next: Brief = await (await project.app.request(preview)).json();
    expect(next.lastHandoff).toEqual(finished.handoff);
    expect(next.checkpointCommit).toBe(finished.checkpointCommit);
    const approved = await project.app.request(`/api/work-items/planning/gates/${stage}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ stage: nextStage });
    expect(await readFile(join(stint.worktree.path, folder, "workflow.yaml"), "utf8")).toContain(
      `stage: ${nextStage}`,
    );
    expect(await readFile(join(root, folder, "workflow.yaml"), "utf8")).toContain(
      `stage: ${stage}`,
    );
  },
);

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
    expect(coreTextWire(foldStintLog(entries))).toEqual(finished);
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
      reasonMessage: { code: "brief.scope" },
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
      reasonMessage: { code: "stint.alreadyActive" },
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
  ["quick", "ship"],
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

test("ticket-scoped Do keeps ticket refusals, checkpoints and its manual gate rule", async () => {
  const first = `${folder}/issues/01-greeting.md`;
  const { root, project } = await fixture(
    [
      { type: "expect-prompt", includes: `/implement ${first}` },
      { type: "expect-prompt", includes: `Finish this ticket only: ${first}.` },
      { type: "write", path: first, content: "# Greeting\nStatus: resolved\nBlocked by: none" },
      { type: "write", path: "greeting.txt", content: "Hello" },
      { type: "hang" },
    ],
    "workflow: quick\nstage: do\n",
  );
  await write(root, first, "# Greeting\nStatus: ready-for-agent\nBlocked by: none");
  await write(
    root,
    `${folder}/issues/02-followup.md`,
    "# Followup\nStatus: ready-for-agent\nBlocked by: 01",
  );
  await write(
    root,
    `${folder}/issues/03-finished.md`,
    "# Finished\nStatus: resolved\nBlocked by: none",
  );
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Quick tickets fixture");
  const approve = () =>
    project.app.request("/api/work-items/planning/gates/do/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  for (const [number, reason, reasonMessage] of [
    [2, "Blocked by ticket 01.", { code: "brief.blockedBy", params: { tickets: "01" } }],
    [3, "This ticket is resolved.", { code: "brief.ticketResolved" }],
  ] as const) {
    const refused = await start(project, number);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ reason, reasonMessage });
  }
  const notReady = await approve();
  expect(notReady.status).toBe(409);
  expect(await notReady.json()).toMatchObject({
    reason: "Every ticket must be resolved before approving.",
  });
  const previewed = await project.app.request("/api/work-items/planning/tickets/1/brief-preview");
  expect(previewed.status).toBe(200);
  const brief: Brief = await previewed.json();
  const response = await start(project, 1);
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  expect(stint).toMatchObject({ stage: "do", ticket: 1, brief });
  await expect
    .poll(() => readFile(join(stint.worktree.path, "greeting.txt"), "utf8").catch(() => null))
    .toBe("Hello");
  const active = await approve();
  expect(active.status).toBe(409);
  expect(await active.json()).toMatchObject({
    reason: "A stint, check or workflow write is active for this work item.",
  });
  expect(
    (await project.app.request(`/api/stints/${stint.id}/stop`, { method: "POST" })).status,
  ).toBe(202);
  const stopped = await ended(project, stint.id);
  expect(stopped).toMatchObject({
    status: "stopped",
    ticket: 1,
    checkpointCommit: expect.any(String),
  });
  expect(git(stint.worktree.path, "show", `${stopped.checkpointCommit}:${first}`)).toContain(
    "Status: resolved",
  );
  const unresolved = await approve();
  expect(unresolved.status).toBe(409);
  expect(await unresolved.json()).toMatchObject({
    reason: "Every ticket must be resolved before approving.",
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
