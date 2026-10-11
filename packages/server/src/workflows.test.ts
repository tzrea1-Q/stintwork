// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createFakeAgentLauncher } from "@stintwork/agents/testing";
import { builtInWorkflows, type ProjectSnapshot } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";

const definition = (id = "feature") =>
  JSON.stringify(
    {
      id,
      name: "Team workflow",
      defaultAgent: "codex",
      stages: [
        {
          id: "design",
          name: "Design",
          column: "spec",
          skill: "/design",
          gate: "manual",
          agent: "codex",
        },
        { id: "build", name: "Build", column: "implement", skill: "/implement", gate: "manual" },
        { id: "deliver", name: "Deliver", column: "ship", skill: null, gate: "merge" },
      ],
    },
    null,
    2,
  );
const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];

async function write(root: string, path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

async function fixture(yaml = definition(), workflow = "feature", stage = "design") {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-workflows-"));
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  execFileSync("git", ["config", "user.name", "Developer"], { cwd: root });
  execFileSync("git", ["config", "user.email", "developer@example.invalid"], { cwd: root });
  await write(root, ".gitignore", ".stintwork/local/\n");
  await write(root, ".scratch/example/spec.md", "# Example");
  await write(root, ".scratch/example/workflow.yaml", `workflow: ${workflow}\nstage: ${stage}\n`);
  await write(root, ".stintwork/workflows/team.yaml", yaml);
  await write(root, "web/index.html", "<!doctype html><title>Fixture</title>");
  execFileSync("git", ["add", "--all"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "Fixture"], { cwd: root });
  const project = createProjectServer(root, join(root, "web"), {
    launchAgent: createFakeAgentLauncher(
      [
        { type: "expect-prompt", includes: "/design .scratch/example/" },
        { type: "write", path: ".scratch/example/notes.md", content: "Designed" },
      ],
      [
        {
          type: "message",
          text: "## Where I stopped\nDesigned.\n## Unresolved\nNone\n## Suggested next\nBuild.",
        },
      ],
    ),
  });
  fixtures.push({ parent, project });
  return { root, project };
}

afterEach(async () => {
  for (const { parent, project } of fixtures.splice(0)) {
    await project.stop();
    await rm(parent, { recursive: true, force: true });
  }
});

async function snapshot(project: ReturnType<typeof createProjectServer>): Promise<ProjectSnapshot> {
  const response = await project.app.request("/api/project");
  expect(response.status).toBe(200);
  return response.json();
}

test.each(["feature", "team"])(
  "the board API and briefs use the repo's %s workflow",
  async (id) => {
    const { project } = await fixture(definition(id), id);
    const board = await snapshot(project);
    expect(board.warnings).toEqual([]);
    expect(board.workflows[id]).toMatchObject({
      name: "Team workflow",
      stages: [{ id: "design", gate: "manual" }, { id: "build" }, { id: "deliver", gate: "merge" }],
    });
    expect(board.workItems[0]).toMatchObject({
      workflow: id,
      stage: "design",
      column: "spec",
      inferred: false,
    });
    const response = await project.app.request("/api/work-items/example/brief-preview");
    expect(response.status).toBe(200);
    expect((await response.json()).prompt).toContain("/design .scratch/example/");
  },
);

test.each(["feature", "team"])("invalid %s YAML warns without hiding the work item", async (id) => {
  const { project } = await fixture(
    `id: ${id}\nname: Invalid\ndefaultAgent: codex\nstages: []\n`,
    id,
    "review",
  );
  const board = await snapshot(project);
  expect(board.workflows.feature).toEqual(builtInWorkflows.feature);
  expect(board.workItems).toHaveLength(1);
  expect(board.workItems[0]).toMatchObject({
    workflow: "feature",
    stage: "review",
    column: "review",
  });
  expect(board.warnings).toContainEqual({
    path: ".stintwork/workflows/team.yaml",
    message: expect.stringContaining("falling back"),
  });
});

test("a custom stage stint and gate use the loaded workflow and existing commit messages", async () => {
  const { project } = await fixture(definition("team"), "team");
  const response = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "example", agent: "codex" }),
  });
  expect(response.status).toBe(201);
  const { stint } = await response.json();
  expect(stint.stage).toBe("design");
  await expect
    .poll(async () => {
      const board = await snapshot(project);
      return board.workItems[0].stints[0]?.status;
    })
    .toBe("finished");
  const approve = await project.app.request("/api/work-items/example/gates/design/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  expect(approve.status).toBe(200);
  expect(await approve.json()).toMatchObject({ stage: "build" });
  const item = (await snapshot(project)).workItems[0];
  expect(item).toMatchObject({ stage: "build", column: "implement" });
  expect(
    execFileSync("git", ["log", "-1", "--format=%s"], {
      cwd: item.worktreePath,
      encoding: "utf8",
    }).trim(),
  ).toBe("Approve design gate for example");
  expect(
    await readFile(join(item.worktreePath as string, ".scratch/example/notes.md"), "utf8"),
  ).toBe("Designed");
});

test("the project watcher reloads a changed workflow and then its invalid fallback", async () => {
  const { project, root } = await fixture();
  await project.start();
  await write(
    root,
    ".stintwork/workflows/team.yaml",
    definition().replace('"column": "spec"', '"column": "clarify"'),
  );
  await expect.poll(async () => (await snapshot(project)).workItems[0].column).toBe("clarify");
  await write(root, ".stintwork/workflows/team.yaml", "id: feature\nstages: []\n");
  await expect
    .poll(async () =>
      (await snapshot(project)).warnings.some(
        ({ path }) => path === ".stintwork/workflows/team.yaml",
      ),
    )
    .toBe(true);
  const board = await snapshot(project);
  expect(board.workflows.feature).toEqual(builtInWorkflows.feature);
  expect(board.workItems).toHaveLength(1);
});
