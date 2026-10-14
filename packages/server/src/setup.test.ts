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
import { dirname, join } from "node:path";
import { createAgentRegistry } from "@stintwork/agents";
import { createFakeAgentLauncher, fakeAgentProfiles } from "@stintwork/agents/testing";
import { setupPaths, type SetupChange } from "@stintwork/core";
import { Hono } from "hono";
import { afterEach, expect, test, vi } from "vitest";
import { createProjectServer } from "./index.js";
import { createNodeRepoFiles } from "./repo-files.js";
import { addSetupRoutes, listAgentSkills } from "./setup.js";

const fixtures: string[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function write(root: string, path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
function fixture(contents: Record<string, string> = {}, initialCommit = true) {
  const parent = mkdtempSync(join(tmpdir(), "stintwork-setup-"));
  fixtures.push(parent);
  const root = join(parent, "project");
  const home = join(parent, "home");
  mkdirSync(home);
  write(root, "keep.txt", "Keep\n");
  for (const [path, text] of Object.entries(contents)) write(root, path, text);
  git(root, "init", "-q");
  git(root, "config", "user.name", "Setup Tests");
  git(root, "config", "user.email", "setup@example.test");
  if (initialCommit) {
    git(root, "add", "--all");
    git(root, "commit", "-qm", "Fixture");
  }
  const registry = createAgentRegistry(
    Object.values(fakeAgentProfiles).map((profile) => ({
      ...profile,
      launch: createFakeAgentLauncher([]),
    })),
  );
  const app = new Hono();
  const refresh = vi.fn();
  addSetupRoutes(app, root, createNodeRepoFiles(root), registry, refresh, home);
  return { root, home, app, refresh };
}
async function preview(app: Hono): Promise<SetupChange[]> {
  const response = await app.request("/api/setup");
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()).changes;
}
function apply(app: Hono, changes: SetupChange[]) {
  return app.request("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmed: true, changes }),
  });
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const parent of fixtures.splice(0)) rmSync(parent, { recursive: true, force: true });
});

test("setup in an unborn repo uses the fallback identity without taking unrelated files", async () => {
  const { root, home, app } = fixture({}, false);
  vi.stubEnv("GIT_CONFIG_GLOBAL", join(home, "missing-git-config"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  git(root, "config", "--unset", "user.name");
  git(root, "config", "--unset", "user.email");
  const response = await apply(app, await preview(app));
  expect(response.status, await response.clone().text()).toBe(200);
  expect(git(root, "log", "-1", "--format=%an <%ae>")).toBe("Stintwork <stintwork@localhost>");
  expect(git(root, "rev-list", "--count", "HEAD")).toBe("1");
  expect(git(root, "status", "--porcelain")).toBe("?? keep.txt");
});

test("concurrent confirmations make only one setup commit", async () => {
  const { root, app } = fixture();
  const changes = await preview(app);
  const responses = await Promise.all([apply(app, changes), apply(app, changes)]);
  expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
  expect(git(root, "rev-list", "--count", "HEAD")).toBe("2");
});

test("the bare-repo guide is read-only and offers all five exact file previews", async () => {
  const { root, home, app, refresh } = fixture();
  expect((await preview(app)).map(({ path }) => path)).toEqual(setupPaths);
  expect(git(root, "status", "--porcelain")).toBe("");
  expect(git(root, "rev-list", "--count", "HEAD")).toBe("1");
  for (const path of setupPaths) expect(existsSync(join(root, path))).toBe(false);
  expect(existsSync(join(home, ".claude"))).toBe(false);
  expect(refresh).not.toHaveBeenCalled();
});

test("setup exposes check mappings and accepts legacy confirmations without metadata", async () => {
  const { root, app } = fixture();
  const guide = await (await app.request("/api/setup")).json();
  expect(guide.checks).toContainEqual({ id: "tracker", ready: false });
  expect(guide.changes[0].checkId).toBe("tracker");
  expect(guide.changes.find((change: SetupChange) => change.path === ".gitignore").reasonId).toBe(
    "localRunData",
  );
  const changes = guide.changes.map(({ path, before, content }: SetupChange) => ({
    path,
    before,
    content,
  }));
  const response = await apply(app, changes);
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(
    result.checks
      .filter(({ ready }: { ready: boolean }) => ready)
      .map(({ id }: { id: string }) => id),
  ).toEqual(["tracker", "markdown", "agents"]);
  expect(result.changes).toEqual([]);
  expect(result.commit).toBe(git(root, "rev-parse", "HEAD"));
});

test("selective setup appends AGENTS.md without rewriting and makes one exact-path commit", async () => {
  const original = "# Existing rules\r\nKeep all these bytes.\r\n";
  const { root, app, refresh } = fixture({ "AGENTS.md": original });
  const changes = (await preview(app)).filter(({ path }) =>
    ["AGENTS.md", "docs/agents/issue-tracker.md"].includes(path),
  );
  write(root, "keep.txt", "Unrelated staged work\n");
  git(root, "add", "--", "keep.txt");
  write(root, ".gitignore", "Unrelated untracked ignore file\n");
  const response = await apply(app, changes);
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.commit).toBe(git(root, "rev-parse", "HEAD"));
  expect(git(root, "log", "-1", "--format=%s")).toBe("Set up Stintwork");
  expect(git(root, "rev-list", "--count", "HEAD")).toBe("2");
  expect(git(root, "show", "--format=", "--name-only", "HEAD").split("\n").sort()).toEqual([
    "AGENTS.md",
    "docs/agents/issue-tracker.md",
  ]);
  expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe(
    changes.find(({ path }) => path === "AGENTS.md")?.content,
  );
  expect(readFileSync(join(root, "AGENTS.md"), "utf8").startsWith(original)).toBe(true);
  expect(git(root, "diff", "--cached", "--name-only")).toBe("keep.txt");
  expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe("Unrelated untracked ignore file\n");
  expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
  expect(existsSync(join(root, ".stintwork/roadmap.md"))).toBe(false);
  expect(refresh).toHaveBeenCalledOnce();
});

test("all selected files share one commit, and repeated or fully completed setup does not commit again", async () => {
  const { root, app } = fixture();
  const changes = await preview(app);
  expect((await apply(app, changes)).status).toBe(200);
  for (const change of changes)
    expect(readFileSync(join(root, change.path), "utf8")).toBe(change.content);
  expect(await preview(app)).toEqual([]);
  expect((await apply(app, changes)).status).toBe(409);
  expect(git(root, "rev-list", "--count", "HEAD")).toBe("2");
  expect(git(root, "status", "--porcelain")).toBe("");
});

test.each([
  "unstaged",
  "staged",
  "untracked",
  "ignored",
  "deleted",
  "assume-unchanged",
  "skip-worktree",
])("a dirty selected target (%s) refuses the whole batch before writing", async (kind) => {
  const tracked = !["untracked", "ignored"].includes(kind);
  const { root, app } = fixture({
    ...(tracked ? { "AGENTS.md": "# Rules\n" } : {}),
    ...(kind === "ignored" ? { ".gitignore": "AGENTS.md\n" } : {}),
  });
  if (kind === "deleted") rmSync(join(root, "AGENTS.md"));
  else write(root, "AGENTS.md", "# Developer's uncommitted rules\n");
  if (kind === "staged") git(root, "add", "--", "AGENTS.md");
  if (kind === "assume-unchanged" || kind === "skip-worktree")
    git(root, "update-index", `--${kind}`, "AGENTS.md");
  const changes = await preview(app);
  const head = git(root, "rev-parse", "HEAD");
  const response = await apply(app, changes);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ reason: expect.stringContaining("uncommitted") });
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
  expect(existsSync(join(root, "docs/agents/issue-tracker.md"))).toBe(false);
  expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
  if (kind !== "deleted")
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("# Developer's uncommitted rules\n");
});

test("an ignored new target is refused rather than force-added", async () => {
  const { root, app } = fixture({ ".gitignore": "CLAUDE.md\n" });
  const response = await apply(
    app,
    (await preview(app)).filter(({ path }) => path === "CLAUDE.md"),
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ reason: expect.stringContaining("ignored") });
  expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
});

test("a changed preview is refused even after the developer commits the newer file", async () => {
  const { root, app } = fixture({ "AGENTS.md": "# Original\n" });
  const changes = await preview(app);
  write(root, "AGENTS.md", "# New committed rules\n");
  git(root, "add", "AGENTS.md");
  git(root, "commit", "-qm", "Developer edit");
  expect((await apply(app, changes)).status).toBe(409);
  expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("# New committed rules\n");
  expect(existsSync(join(root, "docs/agents/issue-tracker.md"))).toBe(false);
});

test("selection needs confirmation and accepts neither arbitrary paths nor client-authored content", async () => {
  const { root, app } = fixture();
  const changes = await preview(app);
  for (const body of [
    { changes },
    { confirmed: false, changes },
    { confirmed: true, changes: [] },
    { confirmed: true, changes: [changes[0], changes[0]] },
    { confirmed: true, changes: [{ ...changes[0], path: "../outside.md" }] },
  ]) {
    expect(
      (
        await app.request("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
  }
  expect(
    (await apply(app, [{ ...changes[0], content: "Client-provided instructions" }])).status,
  ).toBe(409);
  expect(
    (
      await app.request("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://foreign.example" },
        body: JSON.stringify({ confirmed: true, changes }),
      })
    ).status,
  ).toBe(403);
  expect((await app.request("/api/setup", { method: "POST", body: "{}" })).status).toBe(400);
  expect(
    (
      await app.request("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    ).status,
  ).toBe(400);
  expect(git(root, "status", "--porcelain")).toBe("");
});

test.each(["CLAUDE.md", "docs", ".stintwork"])(
  "setup never writes through a %s symlink",
  async (path) => {
    const { root, home, app } = fixture();
    write(home, "marker", "Outside project\n");
    symlinkSync(path === "CLAUDE.md" ? join(home, "marker") : home, join(root, path));
    const response = await apply(app, await preview(app));
    expect(response.status).toBe(409);
    expect(readFileSync(join(home, "marker"), "utf8")).toBe("Outside project\n");
    expect(existsSync(join(home, "roadmap.md"))).toBe(false);
    expect(existsSync(join(home, "agents/issue-tracker.md"))).toBe(false);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  },
);

test("a failed commit restores selected files, index entries and newly created directories", async () => {
  const { root, app } = fixture({ "AGENTS.md": "# Original rules\n" });
  write(root, "keep.txt", "Staged work\n");
  git(root, "add", "keep.txt");
  const beforeIndex = git(root, "ls-files", "--stage");
  write(root, ".git/hooks/pre-commit", "#!/bin/sh\nexit 1\n");
  chmodSync(join(root, ".git/hooks/pre-commit"), 0o755);
  expect((await apply(app, await preview(app))).status).toBe(503);
  expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("# Original rules\n");
  expect(git(root, "ls-files", "--stage")).toBe(beforeIndex);
  for (const path of ["CLAUDE.md", ".gitignore", "docs", ".stintwork"])
    expect(existsSync(join(root, path))).toBe(false);
  expect(git(root, "rev-list", "--count", "HEAD")).toBe("1");
});

test("the per-agent report uses only fixture home and project skills and the loaded workflows", async () => {
  const { root, home, app } = fixture({
    ".stintwork/workflows/team.yaml": JSON.stringify({
      id: "team",
      name: "Team",
      defaultAgent: "claude",
      stages: [
        { id: "design", name: "Design", column: "spec", skill: "/team-design", gate: "manual" },
        { id: "ship", name: "Ship", column: "ship", skill: null, gate: "merge" },
      ],
    }),
  });
  write(root, ".claude/skills/team-design/SKILL.md", "Project skill\n");
  write(home, ".claude/skills/to-spec/SKILL.md", "Home skill\n");
  write(home, ".codex/prompts/team-design.md", "Codex prompt\n");
  write(home, ".codex/skills/code-review/SKILL.md", "Codex skill\n");
  // Codex also reads the shared agent-skills location (found on the developer's machine).
  write(home, ".agents/skills/to-tickets/SKILL.md", "Shared skill\n");
  const head = git(root, "rev-parse", "HEAD");
  const response = await app.request("/api/setup");
  const { skills } = await response.json();
  const claude = skills.find(({ agent }: { agent: string }) => agent === "claude");
  const codex = skills.find(({ agent }: { agent: string }) => agent === "codex");
  expect(claude.skills).toContainEqual({
    workflowId: "team",
    stageId: "design",
    workflow: "Team",
    stage: "Design",
    skill: "/team-design",
    status: "found",
  });
  expect(claude.skills).toContainEqual(
    expect.objectContaining({ skill: "/to-spec", status: "found" }),
  );
  expect(claude.skills).toContainEqual(
    expect.objectContaining({
      skill: "/code-review",
      status: "missing",
      installationHint: expect.stringContaining("mattpocock/skills"),
    }),
  );
  expect(codex.skills).toContainEqual({
    workflowId: "team",
    stageId: "design",
    workflow: "Team",
    stage: "Design",
    skill: "/team-design",
    status: "found",
  });
  expect(codex.skills).toContainEqual(
    expect.objectContaining({ skill: "/code-review", status: "found" }),
  );
  expect(codex.skills).toContainEqual(
    expect.objectContaining({ skill: "/to-tickets", status: "found" }),
  );
  expect(
    skills
      .find(({ agent }: { agent: string }) => agent === "grok")
      .skills.every(({ status }: { status: string }) => status === "unknown"),
  ).toBe(true);
  expect(readFileSync(join(home, ".codex/prompts/team-design.md"), "utf8")).toBe("Codex prompt\n");
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
});

test("an uninspectable directory and unsupported locations are can't tell, absent directories are empty", () => {
  const { root, home } = fixture();
  expect(
    listAgentSkills(root, home, { base: "home", path: ".codex/skills", kind: "skills" }),
  ).toEqual([]);
  write(home, ".codex/skills", "Not a directory");
  expect(
    listAgentSkills(root, home, { base: "home", path: ".codex/skills", kind: "skills" }),
  ).toBeNull();
  expect(
    listAgentSkills(root, home, { base: "home", path: "../private", kind: "skills" }),
  ).toBeNull();
});

test("the project server exposes setup through its real API wiring without probing installed agents", async () => {
  const { root } = fixture();
  write(root, "web/index.html", "<!doctype html><title>Fixture</title>");
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry: createAgentRegistry([
      { ...fakeAgentProfiles.codex, skillLocations: [], launch: createFakeAgentLauncher([]) },
    ]),
  });
  try {
    const response = await project.app.request("/api/setup");
    expect(response.status).toBe(200);
    expect((await response.json()).changes.map(({ path }: SetupChange) => path)).toEqual(
      setupPaths,
    );
  } finally {
    await project.stop();
  }
});
