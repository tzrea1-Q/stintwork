// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentRegistry } from "@stintwork/agents";
import { builtInWorkflowYaml, builtInWorkflows, type ProjectSnapshot } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";

const fixtures: { root: string; project: ReturnType<typeof createProjectServer> }[] = [];
const relative = ".stintwork/workflows/feature.yaml";
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fixture(custom = false) {
  const root = mkdtempSync(join(tmpdir(), "stintwork-customise-"));
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, "web/index.html"), "<!doctype html><title>Fixture</title>");
  writeFileSync(join(root, ".gitignore"), ".stintwork/local/\n");
  if (custom) {
    mkdirSync(join(root, ".stintwork/workflows"), { recursive: true });
    writeFileSync(
      join(root, ".stintwork/workflows/team.yaml"),
      builtInWorkflowYaml.quick
        .replace("id: quick", "id: team")
        .replace("name: Quick", "name: Team"),
    );
  }
  git(root, "init", "-q", "--initial-branch=main");
  git(root, "config", "user.name", "Developer Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  git(root, "add", ".");
  git(root, "commit", "-qm", "Fixture");
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry: createAgentRegistry([]),
  });
  fixtures.push({ root, project });
  return { root, project };
}

afterEach(async () => {
  for (const { root, project } of fixtures.splice(0)) {
    await project.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

function action(project: ReturnType<typeof createProjectServer>, id = "feature", preview = false) {
  return project.app.request(`/api/workflows/${id}/customise${preview ? "/preview" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

test.each(["feature", "bug", "quick"] as const)(
  "previews and commits the exact built-in %s YAML without unrelated staged work",
  async (id) => {
    const { root, project } = fixture();
    writeFileSync(join(root, "unrelated.txt"), "Developer work\n");
    git(root, "add", "unrelated.txt");
    const before = git(root, "rev-parse", "HEAD");
    const path = `.stintwork/workflows/${id}.yaml`;
    const preview = await action(project, id, true);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toEqual({ id, path, yaml: builtInWorkflowYaml[id] });
    expect(existsSync(join(root, ".stintwork/workflows"))).toBe(false);
    expect(git(root, "rev-parse", "HEAD")).toBe(before);
    const response = await action(project, id);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id, path, commit: git(root, "rev-parse", "HEAD") });
    expect(readFileSync(join(root, path), "utf8")).toBe(builtInWorkflowYaml[id]);
    expect(git(root, "show", `HEAD:${path}`)).toBe(builtInWorkflowYaml[id].trim());
    expect(git(root, "log", "-1", "--format=%s")).toBe(`Customise workflow ${id}`);
    expect(git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")).toBe(path);
    expect(git(root, "diff", "--cached", "--name-only")).toBe("unrelated.txt");
    const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
    expect(snapshot.workflows[id]).toEqual(builtInWorkflows[id]);
  },
);

test.each([
  "existing",
  "untracked",
  "staged",
  "unstaged",
  "deleted",
  "staged deletion",
  "ignored",
  "skip-worktree",
])("refuses an %s target in both preview and confirmation without changing it", async (kind) => {
  const { root, project } = fixture();
  mkdirSync(join(root, ".stintwork/workflows"), { recursive: true });
  const path = join(root, relative);
  writeFileSync(path, builtInWorkflowYaml.feature);
  if (!["untracked", "staged", "ignored"].includes(kind)) {
    git(root, "add", relative);
    git(root, "commit", "-qm", "Developer workflow");
  }
  if (kind === "ignored") {
    writeFileSync(join(root, ".gitignore"), ".stintwork/local/\n.stintwork/workflows/\n");
    git(root, "add", ".gitignore");
    git(root, "commit", "-qm", "Ignore workflows");
  }
  if (kind === "skip-worktree") git(root, "update-index", "--skip-worktree", relative);
  if (["staged", "unstaged", "skip-worktree"].includes(kind)) writeFileSync(path, "Hand edits\n");
  if (kind === "staged") git(root, "add", relative);
  if (kind === "deleted") rmSync(path);
  if (kind === "staged deletion") git(root, "rm", relative);
  const content = existsSync(path) ? readFileSync(path, "utf8") : null;
  const status = git(root, "status", "--porcelain");
  const index = git(root, "ls-files", "--stage");
  const before = git(root, "rev-parse", "HEAD");
  for (const preview of [true, false])
    expect((await action(project, "feature", preview)).status).toBe(409);
  expect(existsSync(path) ? readFileSync(path, "utf8") : null).toBe(content);
  expect(git(root, "status", "--porcelain")).toBe(status);
  expect(git(root, "ls-files", "--stage")).toBe(index);
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
});

test("confirmation rechecks the target when a file appears after preview", async () => {
  const { root, project } = fixture();
  expect((await action(project, "feature", true)).status).toBe(200);
  mkdirSync(join(root, ".stintwork/workflows"), { recursive: true });
  writeFileSync(join(root, relative), "Hand edits\n");
  expect((await action(project)).status).toBe(409);
  expect(readFileSync(join(root, relative), "utf8")).toBe("Hand edits\n");
});

test("concurrent confirmations produce one copy and one commit", async () => {
  const { root, project } = fixture();
  const responses = await Promise.all([action(project), action(project)]);
  expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
  expect(git(root, "rev-list", "--count", "HEAD")).toBe("2");
});

test.each([".stintwork", ".stintwork/workflows", relative])(
  "refuses symlink target %s",
  async (target) => {
    const { root, project } = fixture();
    const outside = mkdtempSync(join(tmpdir(), "stintwork-outside-"));
    try {
      writeFileSync(join(outside, "workflow.yaml"), "Outside\n");
      if (target !== ".stintwork") mkdirSync(join(root, ".stintwork"));
      if (target === relative) mkdirSync(join(root, ".stintwork/workflows"));
      symlinkSync(
        target === relative ? join(outside, "workflow.yaml") : outside,
        join(root, target),
      );
      for (const preview of [true, false])
        expect((await action(project, "feature", preview)).status).toBe(409);
      expect(readFileSync(join(outside, "workflow.yaml"), "utf8")).toBe("Outside\n");
      expect(existsSync(join(outside, "feature.yaml"))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  },
);

test.each(["hook", "ignored"])(
  "%s failure rolls back the copy and preserves the index",
  async (kind) => {
    const { root, project } = fixture();
    if (kind === "hook") {
      const path = join(root, ".git/hooks/pre-commit");
      writeFileSync(path, "#!/bin/sh\nexit 1\n");
      chmodSync(path, 0o755);
    } else {
      writeFileSync(join(root, ".gitignore"), ".stintwork/local/\n.stintwork/workflows/\n");
      git(root, "add", ".gitignore");
      git(root, "commit", "-qm", "Ignore workflows");
    }
    writeFileSync(join(root, "unrelated.txt"), "Developer work\n");
    git(root, "add", "unrelated.txt");
    const before = git(root, "rev-parse", "HEAD");
    expect((await action(project)).status).toBe(503);
    expect(existsSync(join(root, relative))).toBe(false);
    expect(git(root, "diff", "--cached", "--name-only")).toBe("unrelated.txt");
    expect(git(root, "rev-parse", "HEAD")).toBe(before);
  },
);

test("a new repo workflow id is offered and usable when creating a work item", async () => {
  const { root, project } = fixture(true);
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.workflows.team).toMatchObject({ id: "team", name: "Team" });
  for (const preview of [true, false]) {
    const response = await project.app.request(`/api/work-items${preview ? "/preview" : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Team idea", workflow: "team" }),
    });
    expect(response.status).toBe(preview ? 200 : 201);
    expect(await response.json()).toMatchObject({ slug: "team-idea" });
  }
  expect(readFileSync(join(root, ".scratch/team-idea/workflow.yaml"), "utf8")).toContain(
    "workflow: team\nstage: do\n",
  );
});

test("JSON, same-origin and built-in id boundaries reject invalid requests without writes", async () => {
  const { root, project } = fixture();
  for (const preview of [true, false]) {
    const path = `/api/workflows/feature/customise${preview ? "/preview" : ""}`;
    const send = (headers: Record<string, string>, body: string) =>
      project.app.request(path, { method: "POST", headers, body });
    expect((await send({ "Content-Type": "text/plain" }, "{}")).status).toBe(400);
    for (const body of ["{", "null", "[]"])
      expect((await send({ "Content-Type": "application/json" }, body)).status).toBe(400);
    expect(
      (await send({ "Content-Type": "application/json", Origin: "https://other.invalid" }, "{}"))
        .status,
    ).toBe(403);
    for (const id of ["team", "constructor", "__proto__", "%2E%2E%2Foutside"])
      expect((await action(project, id, preview)).status).toBe(400);
  }
  expect(git(root, "status", "--porcelain")).toBe("");
  expect(existsSync(join(root, ".stintwork/workflows"))).toBe(false);
});
