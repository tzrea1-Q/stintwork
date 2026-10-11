// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { once } from "node:events";
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
import { createFakeAgentLauncher, fakeAgentProfiles } from "@stintwork/agents/testing";
import { parseRoadmap, type ProjectSnapshot } from "@stintwork/core";
import { ensureWorktree } from "@stintwork/git";
import { afterEach, expect, test } from "vitest";
import { WebSocket } from "ws";
import { createProjectServer } from "./index.js";

const roadmap =
  "# Roadmap\nHand-written introduction.\n\n## First\nId: first\nStatus: active\nOwner: Developer\n\nNotes remain.\n";
const fixtures: { parent: string; project: ReturnType<typeof createProjectServer> }[] = [];
const clients: WebSocket[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "stintwork-create-"));
  const root = join(parent, "project");
  mkdirSync(join(root, ".stintwork"), { recursive: true });
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, "web/index.html"), "<!doctype html><title>Stintwork</title>");
  writeFileSync(join(root, ".gitignore"), ".stintwork/local/\n");
  writeFileSync(join(root, ".stintwork/roadmap.md"), roadmap);
  git(root, "init", "-q", "--initial-branch=main");
  git(root, "config", "user.name", "Developer Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  git(root, "add", ".");
  git(root, "commit", "-qm", "Fixture");
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry: createAgentRegistry([
      {
        ...fakeAgentProfiles.codex,
        launch: createFakeAgentLauncher(
          [
            {
              type: "expect-prompt",
              includes: "What the developer asked for:\nKeep the current look.",
            },
            { type: "expect-prompt", includes: ".scratch/new-idea/" },
            { type: "message", text: "Intent received." },
          ],
          [
            {
              type: "message",
              text: "## Where I stopped\nClarified the idea.\n## Unresolved\nNone\n## Suggested next\nWrite the spec.",
            },
          ],
        ),
      },
    ]),
  });
  fixtures.push({ parent, project });
  return { root, project };
}
function action(
  project: ReturnType<typeof createProjectServer>,
  input: unknown = {
    title: "New Idea",
    workflow: "feature",
    milestone: "first",
    intent: "Keep the current look.",
  },
  preview = false,
) {
  return project.app.request(preview ? "/api/work-items/preview" : "/api/work-items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate();
  for (const { parent, project } of fixtures.splice(0)) {
    await project.stop();
    rmSync(parent, { recursive: true, force: true });
  }
});

test("creation broadcasts a first-stage card over the live connection without a reload", async () => {
  const { project } = fixture();
  const server = await project.start();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/live`);
  clients.push(socket);
  const messages: ProjectSnapshot[] = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await once(socket, "open");
  expect((await action(project)).status).toBe(201);
  await expect
    .poll(() =>
      messages.find((snapshot) => snapshot.workItems.some(({ slug }) => slug === "new-idea")),
    )
    .toBeDefined();
  const item = messages.find((snapshot) => snapshot.workItems.length)?.workItems[0];
  expect(item).toMatchObject({
    slug: "new-idea",
    stage: "clarify",
    column: "clarify",
    milestone: "first",
  });
});

test("preview is read-only; confirmation creates the files, one commit and a fresh first-stage card", async () => {
  const { root, project } = fixture();
  const before = git(root, "rev-parse", "HEAD");
  const preview = await action(project, undefined, true);
  expect(preview.status).toBe(200);
  expect(await preview.json()).toEqual({ slug: "new-idea" });
  expect(existsSync(join(root, ".scratch"))).toBe(false);
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
  writeFileSync(join(root, "unrelated.txt"), "Staged developer work\n");
  git(root, "add", "unrelated.txt");
  writeFileSync(join(root, "untracked.txt"), "Untracked developer work\n");
  const created = await action(project);
  expect(created.status).toBe(201);
  expect(await created.json()).toEqual({
    slug: "new-idea",
    commit: git(root, "rev-parse", "HEAD"),
  });
  expect(git(root, "rev-list", "--count", `${before}..HEAD`)).toBe("1");
  expect(git(root, "log", "-1", "--format=%s")).toBe("Create work item new-idea");
  expect(git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n")).toEqual(
    [".scratch/new-idea/workflow.yaml", ".stintwork/roadmap.md"],
  );
  expect(git(root, "diff", "--cached", "--name-only")).toBe("unrelated.txt");
  expect(git(root, "status", "--porcelain")).toContain("?? untracked.txt");
  const text = readFileSync(join(root, ".stintwork/roadmap.md"), "utf8");
  expect(parseRoadmap(text).milestones[0].workItemSlugs).toEqual(["new-idea"]);
  expect(text).toContain("Owner: Developer");
  expect(text).toContain("Notes remain.");
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.workItems[0]).toMatchObject({
    slug: "new-idea",
    title: "New Idea",
    workflow: "feature",
    stage: "clarify",
    spec: null,
    tickets: [],
    milestone: "first",
    intent: "Keep the current look.",
  });
  expect(git(root, "worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
  const brief = await project.app.request("/api/work-items/new-idea/brief-preview");
  expect(brief.status).toBe(200);
  expect((await brief.json()).prompt).toContain(
    "What the developer asked for:\nKeep the current look.",
  );
});

test("the fake ACP agent receives the intent in the first stint", async () => {
  const { project } = fixture();
  expect((await action(project)).status).toBe(201);
  const started = await project.app.request("/api/stints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workItem: "new-idea", agent: "codex" }),
  });
  expect(started.status).toBe(201);
  const { stint } = await started.json();
  await expect
    .poll(async () => {
      const response = await project.app.request(`/api/stints/${stint.id}`);
      return (await response.json()).stint.status;
    })
    .toBe("finished");
});

test("creation uses custom loaded workflows and may omit milestone and intent", async () => {
  const { root, project } = fixture();
  mkdirSync(join(root, ".stintwork/workflows"));
  writeFileSync(
    join(root, ".stintwork/workflows/team.yaml"),
    JSON.stringify({
      id: "team",
      name: "Team",
      defaultAgent: "codex",
      stages: [
        { id: "design", name: "Design", column: "spec", skill: "/design", gate: "manual" },
        { id: "deliver", name: "Deliver", column: "ship", skill: null, gate: "merge" },
      ],
    }),
  );
  expect((await action(project, { title: "New Idea", workflow: "team" })).status).toBe(201);
  expect(readFileSync(join(root, ".stintwork/roadmap.md"), "utf8")).toBe(roadmap);
  const snapshot: ProjectSnapshot = await (await project.app.request("/api/project")).json();
  expect(snapshot.workItems[0]).toMatchObject({
    workflow: "team",
    stage: "design",
    column: "spec",
    spec: null,
    tickets: [],
  });
  expect(snapshot.workItems[0].intent).toBeUndefined();
  expect(git(root, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")).toBe(
    ".scratch/new-idea/workflow.yaml",
  );
});

test.each(["", "---", "中文", "Title\nBreak"])(
  "refuses invalid titles before any writes: %s",
  async (title) => {
    const { root, project } = fixture();
    for (const preview of [true, false])
      expect((await action(project, { title, workflow: "feature" }, preview)).status).toBe(400);
    expect(existsSync(join(root, ".scratch"))).toBe(false);
    expect(git(root, "status", "--porcelain")).toBe("");
  },
);

test("duplicates and concurrent confirmations never overwrite an existing work item", async () => {
  const { root, project } = fixture();
  const responses = await Promise.all([action(project), action(project)]);
  expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
  const original = readFileSync(join(root, ".scratch/new-idea/workflow.yaml"), "utf8");
  const refused = await action(project, undefined, true);
  expect(refused.status).toBe(409);
  expect((await refused.json()).reason).toContain("already exists");
  expect(readFileSync(join(root, ".scratch/new-idea/workflow.yaml"), "utf8")).toBe(original);
  expect(git(root, "rev-list", "--count", "HEAD")).toBe("2");
});

test("a slug already owned by a worktree cannot be created again in the main checkout", async () => {
  const { root, project } = fixture();
  const worktree = await ensureWorktree(root, "new-idea");
  mkdirSync(join(worktree.path, ".scratch/new-idea"), { recursive: true });
  writeFileSync(
    join(worktree.path, ".scratch/new-idea/workflow.yaml"),
    "workflow: feature\nstage: clarify\n",
  );
  for (const preview of [true, false]) {
    const refused = await action(project, undefined, preview);
    expect(refused.status).toBe(409);
    expect((await refused.json()).reason).toContain("already exists");
  }
  expect(existsSync(join(root, ".scratch/new-idea"))).toBe(false);
  expect(readFileSync(join(worktree.path, ".scratch/new-idea/workflow.yaml"), "utf8")).toBe(
    "workflow: feature\nstage: clarify\n",
  );
});

test.each(["working", "staged", "untracked", "skip-worktree"])(
  "refuses a %s dirty roadmap without creating a folder",
  async (kind) => {
    const { root, project } = fixture();
    if (kind === "untracked") git(root, "rm", "--cached", ".stintwork/roadmap.md");
    if (kind === "skip-worktree")
      git(root, "update-index", "--skip-worktree", ".stintwork/roadmap.md");
    writeFileSync(join(root, ".stintwork/roadmap.md"), `${roadmap}Hand edit\n`);
    if (kind === "staged") git(root, "add", ".stintwork/roadmap.md");
    const before = git(root, "status", "--porcelain");
    for (const preview of [true, false])
      expect((await action(project, undefined, preview)).status).toBe(409);
    expect(existsSync(join(root, ".scratch/new-idea"))).toBe(false);
    expect(readFileSync(join(root, ".stintwork/roadmap.md"), "utf8")).toBe(`${roadmap}Hand edit\n`);
    expect(git(root, "status", "--porcelain")).toBe(before);
  },
);

test("a deleted dirty workflow path and an existing empty directory are refused", async () => {
  const { root, project } = fixture();
  mkdirSync(join(root, ".scratch/new-idea"), { recursive: true });
  expect((await action(project)).status).toBe(409);
  writeFileSync(
    join(root, ".scratch/new-idea/workflow.yaml"),
    "workflow: feature\nstage: clarify\n",
  );
  git(root, "add", ".scratch/new-idea/workflow.yaml");
  git(root, "commit", "-qm", "Existing item");
  rmSync(join(root, ".scratch/new-idea"), { recursive: true });
  for (const preview of [true, false])
    expect((await action(project, undefined, preview)).status).toBe(409);
  expect(git(root, "status", "--porcelain")).toContain("D .scratch/new-idea/workflow.yaml");
});

test.each([".scratch", ".stintwork", ".stintwork/roadmap.md"])(
  "refuses symlink creation paths: %s",
  async (relative) => {
    const { root, project } = fixture();
    const outside = join(root, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "roadmap.md"), roadmap);
    rmSync(join(root, relative), { recursive: true, force: true });
    symlinkSync(
      relative.endsWith(".md") ? join(outside, "roadmap.md") : outside,
      join(root, relative),
    );
    expect((await action(project)).status).toBe(409);
    expect(readFileSync(join(outside, "roadmap.md"), "utf8")).toBe(roadmap);
    expect(existsSync(join(outside, "new-idea"))).toBe(false);
  },
);

test("commit failure rolls back both owned files and preserves unrelated staged work", async () => {
  const { root, project } = fixture();
  writeFileSync(join(root, "unrelated.txt"), "Developer work\n");
  git(root, "add", "unrelated.txt");
  const before = git(root, "rev-parse", "HEAD");
  const hook = join(root, ".git/hooks/pre-commit");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n");
  chmodSync(hook, 0o755);
  expect((await action(project)).status).toBe(503);
  expect(readFileSync(join(root, ".stintwork/roadmap.md"), "utf8")).toBe(roadmap);
  expect(existsSync(join(root, ".scratch/new-idea"))).toBe(false);
  expect(git(root, "diff", "--cached", "--name-only")).toBe("unrelated.txt");
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
});

test("creation without a milestone leaves a dirty roadmap untouched", async () => {
  const { root, project } = fixture();
  writeFileSync(join(root, ".stintwork/roadmap.md"), `${roadmap}Hand edit\n`);
  expect((await action(project, { title: "New Idea", workflow: "feature" })).status).toBe(201);
  expect(readFileSync(join(root, ".stintwork/roadmap.md"), "utf8")).toBe(`${roadmap}Hand edit\n`);
  expect(git(root, "diff", "--name-only")).toBe(".stintwork/roadmap.md");
});

test("ignored creation files fail safely without leaving a folder or a partial roadmap edit", async () => {
  const { root, project } = fixture();
  writeFileSync(join(root, ".gitignore"), ".stintwork/local/\n.scratch/\n");
  git(root, "add", ".gitignore");
  git(root, "commit", "-qm", "Ignore scratch");
  const before = git(root, "rev-parse", "HEAD");
  expect((await action(project)).status).toBe(503);
  expect(existsSync(join(root, ".scratch/new-idea"))).toBe(false);
  expect(readFileSync(join(root, ".stintwork/roadmap.md"), "utf8")).toBe(roadmap);
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("JSON and same-origin boundaries refuse malformed and cross-origin actions", async () => {
  const { root, project } = fixture();
  for (const path of ["/api/work-items/preview", "/api/work-items"]) {
    const send = (headers: Record<string, string>, body: string) =>
      project.app.request(path, { method: "POST", headers, body });
    expect((await send({ "Content-Type": "text/plain" }, "{}")).status).toBe(400);
    expect((await send({ "Content-Type": "application/json" }, "{")).status).toBe(400);
    expect(
      (await send({ "Content-Type": "application/json", Origin: "https://other.invalid" }, "{}"))
        .status,
    ).toBe(403);
    expect(
      (await send({ "Content-Type": "application/json" }, '{"title":"Idea","workflow":"missing"}'))
        .status,
    ).toBe(400);
  }
  expect(git(root, "status", "--porcelain")).toBe("");
});
