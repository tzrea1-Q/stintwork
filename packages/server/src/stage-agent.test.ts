import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAgentRegistry } from "@stintwork/agents";
import { createFakeAgentLauncher, fakeAgentProfiles } from "@stintwork/agents/testing";
import type { ProjectSnapshot, Stint } from "@stintwork/core";
import { ensureWorktree } from "@stintwork/git";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";

const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];
const workflowPath = ".scratch/first/workflow.yaml";
const endpoint = "/api/work-items/first/stages/review/agent";
const original =
  "# Project choice\nworkflow: feature\nstage: implement\nmilestone: M3\nstages:\n  spec:\n    approved: true\n  review:\n    agent: codex\n";
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
async function fixture(workflow: string | null = original, hang = false) {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-stage-agent-"));
  const root = join(parent, "project");
  for (const [path, text] of Object.entries({
    "web/index.html": "<!doctype html><title>Stintwork</title>",
    ".scratch/first/spec.md": "# First",
    ".scratch/first/issues/01-first.md": "# First\nStatus: ready-for-agent\nBlocked by: none",
    ...(workflow === null ? {} : { [workflowPath]: workflow }),
  })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  git(root, "init", "-q");
  git(root, "config", "user.name", "Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  git(root, "add", ".");
  git(root, "commit", "-qm", "Fixture");
  const agentRegistry = createAgentRegistry([
    { ...fakeAgentProfiles.codex, launch: createFakeAgentLauncher([]) },
    {
      ...fakeAgentProfiles.claude,
      launch: createFakeAgentLauncher(
        hang ? [{ type: "hang" }] : [{ type: "write", path: "chosen.txt", content: "Claude" }],
        [
          {
            type: "message",
            text: "## Where it stopped\nFinished.\n## What is unresolved\nNone.\n## Suggested next step\nReview.",
          },
        ],
        { profile: "claude" },
      ),
    },
    {
      ...fakeAgentProfiles.grok,
      availability: { available: false, reason: "Authentication required. Use grok login." },
      launch: createFakeAgentLauncher([], [], { profile: "grok" }),
    },
  ]);
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry,
    handoffTimeoutMs: 1000,
  });
  fixtures.push({ parent, project });
  return { root, project };
}
function choose(
  project: ReturnType<typeof createProjectServer>,
  agent = "claude",
  path = endpoint,
) {
  return project.app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent }),
  });
}
afterEach(async () => {
  for (const { parent, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});

test("the developer can choose a future stage's agent in the main checkout without committing or advancing the stage", async () => {
  const { root, project } = await fixture();
  const head = git(root, "rev-parse", "HEAD");
  expect(await (await choose(project)).json()).toEqual({
    stage: "review",
    agent: "claude",
    commit: null,
  });
  const text = await readFile(join(root, workflowPath), "utf8");
  expect(text).toContain("agent: claude");
  expect(text).toContain("# Project choice");
  expect(text).toContain("approved: true");
  expect(text).toContain("stage: implement");
  expect(text).toContain("milestone: M3");
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.workItems[0].stages.review.agent).toBe("claude");
});

test("an active worktree receives the choice and a workflow-only commit, leaving main and unrelated staged edits alone", async () => {
  const { root, project } = await fixture();
  const worktree = await ensureWorktree(root, "first");
  await writeFile(join(worktree.path, "unrelated.txt"), "Keep staged");
  git(worktree.path, "add", "unrelated.txt");
  const response = await choose(project);
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.commit).toBe(git(worktree.path, "rev-parse", "HEAD"));
  expect(git(worktree.path, "show", `HEAD:${workflowPath}`)).toContain("agent: claude");
  expect(git(worktree.path, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")).toBe(
    workflowPath,
  );
  expect(git(worktree.path, "diff", "--cached", "--name-only")).toBe("unrelated.txt");
  expect(await readFile(join(root, workflowPath), "utf8")).toBe(original);
  const head = result.commit;
  expect((await (await choose(project)).json()).commit).toBeNull();
  expect(git(worktree.path, "rev-parse", "HEAD")).toBe(head);
});

test("first selection creates workflow.yaml with the inferred current stage", async () => {
  const { root, project } = await fixture(null);
  expect((await choose(project)).status).toBe(200);
  expect(await readFile(join(root, workflowPath), "utf8")).toContain("stage: implement");
});

test("the brief and a start without an override use the persisted stage agent through the fake ACP agent", async () => {
  const { root, project } = await fixture();
  expect(
    (await choose(project, "claude", "/api/work-items/first/stages/implement/agent")).status,
  ).toBe(200);
  const preview = await (
    await project.app.request("/api/work-items/first/tickets/1/brief-preview")
  ).json();
  expect(preview.agent).toBe("claude");
  const response = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1 }),
  });
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  expect(stint.agent).toBe("claude");
  await expect
    .poll(
      async () =>
        (await (await project.app.request(`/api/stints/${stint.id}`)).json()).stint.status,
    )
    .toBe("finished");
  expect(await readFile(join(stint.worktree.path, "chosen.txt"), "utf8")).toBe("Claude");
  expect(await readFile(join(root, workflowPath), "utf8")).toContain("agent: claude");
});

test("a per-stint override does not overwrite the developer's stage preference", async () => {
  const { project } = await fixture();
  await choose(project, "claude", "/api/work-items/first/stages/implement/agent");
  await choose(project, "claude");
  const response = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  const { stint } = await response.json();
  expect(stint.agent).toBe("codex");
  expect(await readFile(join(stint.worktree.path, workflowPath), "utf8")).toContain(
    "agent: claude",
  );
  expect(git(stint.worktree.path, "show", `HEAD:${workflowPath}`)).toContain(
    "review:\n    agent: claude",
  );
});

test.each([
  { ticket: undefined, existingWorktree: false },
  { ticket: null, existingWorktree: true },
])(
  "stage previews and ticketless starts use the stage agent (ticket: $ticket, existing worktree: $existingWorktree)",
  async ({ ticket, existingWorktree }) => {
    const { root, project } = await fixture("workflow: feature\nstage: spec\n");
    if (existingWorktree) await ensureWorktree(root, "first");
    expect(
      (await choose(project, "claude", "/api/work-items/first/stages/spec/agent")).status,
    ).toBe(200);
    const preview = await (await project.app.request("/api/work-items/first/brief-preview")).json();
    expect(preview.agent).toBe("claude");
    const response = await project.app.request("/api/stints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workItem: "first", ticket }),
    });
    expect(response.status).toBe(201);
    const { stint }: { stint: Stint } = await response.json();
    expect(stint.agent).toBe("claude");
    expect(stint.ticket).toBeNull();
    expect(stint.brief).toEqual(preview);
    await expect
      .poll(
        async () =>
          (await (await project.app.request(`/api/stints/${stint.id}`)).json()).stint.status,
      )
      .toBe("finished");
    expect(await readFile(join(stint.worktree.path, "chosen.txt"), "utf8")).toBe("Claude");
    expect(await readFile(join(stint.worktree.path, workflowPath), "utf8")).toContain(
      "agent: claude",
    );
  },
);

test.each([
  { agent: "grok", status: 409, reason: "grok login" },
  { agent: "unknown", status: 400, reason: "not registered" },
])(
  "ticketless starts refuse a $agent stage default without side effects",
  async ({ agent, status, reason }) => {
    const workflow = `workflow: feature\nstage: spec\nstages:\n  spec:\n    agent: ${agent}\n`;
    const { root, project } = await fixture(workflow);
    const preview = await (await project.app.request("/api/work-items/first/brief-preview")).json();
    expect(preview.agent).toBe(agent);
    for (const ticket of [undefined, null]) {
      const response = await project.app.request("/api/stints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItem: "first", ticket }),
      });
      expect(response.status).toBe(status);
      expect((await response.json()).reason).toContain(reason);
    }
    expect(await readFile(join(root, workflowPath), "utf8")).toBe(workflow);
    await expect(readdir(join(root, ".stintwork/local/stints"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(git(root, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
  },
);

test("a ticketless per-stint override preserves the stage preference", async () => {
  const { project } = await fixture(
    "workflow: feature\nstage: spec\nstages:\n  spec:\n    agent: claude\n",
  );
  const response = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: null, agent: "codex" }),
  });
  expect(response.status).toBe(201);
  const { stint }: { stint: Stint } = await response.json();
  expect(stint.agent).toBe("codex");
  expect(stint.brief.agent).toBe("codex");
  expect(await readFile(join(stint.worktree.path, workflowPath), "utf8")).toContain(
    "agent: claude",
  );
});

test("unavailable and unknown agents are refused for choices and starts before files or worktrees are created", async () => {
  const { root, project } = await fixture();
  const registry = await (await project.app.request("/api/agents")).json();
  expect(
    registry.agents.find((agent: { id: string }) => agent.id === "grok").availability.reason,
  ).toContain("grok login");
  for (const [agent, status, reason] of [
    ["grok", 409, "grok login"],
    ["unknown", 400, "not registered"],
  ] as const) {
    for (const response of [
      await choose(project, agent),
      await project.app.request("/api/stints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItem: "first", ticket: 1, agent }),
      }),
    ]) {
      expect(response.status).toBe(status);
      expect((await response.json()).reason).toContain(reason);
    }
  }
  expect(await readFile(join(root, workflowPath), "utf8")).toBe(original);
  await expect(readdir(join(root, ".stintwork/local/stints"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(git(root, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
  await writeFile(
    join(root, workflowPath),
    "workflow: feature\nstage: implement\nstages:\n  implement:\n    agent: grok\n",
  );
  const defaultStart = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1 }),
  });
  expect(defaultStart.status).toBe(409);
  expect((await defaultStart.json()).reason).toContain("grok login");
  expect(git(root, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
});

test("invalid requests, stages, cross-origin writes and broken YAML cannot change the workflow", async () => {
  const { root, project } = await fixture();
  expect((await choose(project, "claude", "/api/work-items/first/stages/fix/agent")).status).toBe(
    400,
  );
  expect(
    (await choose(project, "claude", "/api/work-items/missing/stages/review/agent")).status,
  ).toBe(404);
  expect(
    (
      await project.app.request(endpoint, {
        method: "POST",
        headers: { Origin: "https://other.invalid" },
      })
    ).status,
  ).toBe(403);
  for (const body of ["{", "{}", '{"agent":1}'])
    expect(
      (
        await project.app.request(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      ).status,
    ).toBe(400);
  expect(await readFile(join(root, workflowPath), "utf8")).toBe(original);
  await writeFile(join(root, workflowPath), "workflow: [");
  expect((await choose(project)).status).toBe(409);
  expect(await readFile(join(root, workflowPath), "utf8")).toBe("workflow: [");
});

test("symlink workflows are refused without changing their targets", async () => {
  const { root, project } = await fixture();
  const target = join(root, "outside.yaml");
  await writeFile(target, original);
  await rm(join(root, workflowPath));
  await symlink(target, join(root, workflowPath));
  expect((await choose(project)).status).toBe(503);
  expect(await readFile(target, "utf8")).toBe(original);
});

test("stage choices are refused during an active stint", async () => {
  const { project } = await fixture(original, true);
  const response = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "first", ticket: 1, agent: "claude" }),
  });
  expect(response.status).toBe(201);
  expect((await choose(project)).status).toBe(409);
});
