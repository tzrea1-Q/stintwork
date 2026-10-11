import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRoadmap, type RoadmapChange } from "@stintwork/core";
import { createAgentRegistry } from "@stintwork/agents";
import { createFakeAgentLauncher, fakeAgentProfiles } from "@stintwork/agents/testing";
import { afterEach, expect, test } from "vitest";
import { createProjectServer } from "./index.js";

const relative = ".stintwork/roadmap.md";
const initial =
  "# Roadmap\nHand-written introduction.\n\n## First\nId: first\nStatus: active\nTarget: 2026-12-01\nOwner: Developer\n\n- board\nNotes stay here.\n\n## Second\nId: second\nStatus: planned\nKeep these notes too.\n";
const fixtures: { root: string; project: ReturnType<typeof createProjectServer> }[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function fixture(roadmap: string | null = initial) {
  const root = mkdtempSync(join(tmpdir(), "stintwork-roadmap-"));
  mkdirSync(join(root, ".stintwork"));
  mkdirSync(join(root, ".scratch/board"), { recursive: true });
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, "web/index.html"), "<!doctype html><title>Stintwork</title>");
  writeFileSync(join(root, ".scratch/board/spec.md"), "# Board\n");
  if (roadmap !== null) writeFileSync(join(root, relative), roadmap);
  git(root, "init", "-q");
  git(root, "config", "user.name", "Developer Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  git(root, "add", ".");
  git(root, "commit", "-qm", "Fixture");
  const project = createProjectServer(root, join(root, "web"), {
    agentRegistry: createAgentRegistry([
      { ...fakeAgentProfiles.codex, launch: createFakeAgentLauncher([]) },
    ]),
  });
  fixtures.push({ root, project });
  return { root, project };
}
function action(
  project: ReturnType<typeof createProjectServer>,
  change: unknown,
  headers: Record<string, string> = { "Content-Type": "application/json" },
) {
  return project.app.request("/api/roadmap", {
    method: "POST",
    headers,
    body: JSON.stringify(change),
  });
}
afterEach(async () => {
  for (const { root, project } of fixtures.splice(0)) {
    await project.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

const actions: { change: RoadmapChange; subject: string; expected: string }[] = [
  {
    change: { kind: "add", name: "Next delivery" },
    subject: "Add milestone next-delivery",
    expected: `${initial}\n## Next delivery\nId: next-delivery\nStatus: planned\n`,
  },
  {
    change: { kind: "rename", id: "first", name: "Renamed" },
    subject: "Rename milestone first to Renamed",
    expected: initial.replace("## First\n", "## Renamed\n"),
  },
  {
    change: { kind: "update", id: "first", status: "shipped" },
    subject: "Set milestone first status to shipped",
    expected: initial.replace("Status: active", "Status: shipped"),
  },
  {
    change: { kind: "update", id: "first", target: "2027-01-02" },
    subject: "Set milestone first target to 2027-01-02",
    expected: initial.replace("2026-12-01", "2027-01-02"),
  },
  {
    change: { kind: "update", id: "first", target: null },
    subject: "Set milestone first target to none",
    expected: initial.replace("Target: 2026-12-01\n", ""),
  },
  {
    change: { kind: "reorder", ids: ["second", "first"] },
    subject: "Reorder milestones",
    expected:
      initial.slice(0, initial.indexOf("## First")) +
      initial.slice(initial.indexOf("## Second")) +
      initial.slice(initial.indexOf("## First"), initial.indexOf("## Second")),
  },
  {
    change: { kind: "move", workItem: "board", milestone: "second" },
    subject: "Move work item board to second",
    expected: initial
      .replace("- board\n", "")
      .replace("Status: planned\n", "Status: planned\n\n- board\n"),
  },
  {
    change: { kind: "move", workItem: "board", milestone: null },
    subject: "Move work item board to no milestone",
    expected: initial.replace("- board\n", ""),
  },
];

test.each(actions)(
  "$subject writes only the roadmap and makes exactly one commit",
  async ({ change, subject, expected }) => {
    const { root, project } = fixture();
    const before = git(root, "rev-parse", "HEAD");
    writeFileSync(join(root, "unrelated.txt"), "Leave staged work alone.\n");
    git(root, "add", "unrelated.txt");
    const response = await action(project, change);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(readFileSync(join(root, relative), "utf8")).toBe(expected);
    expect(git(root, "show", `HEAD:${relative}`)).toBe(expected.trim());
    expect(git(root, "rev-list", "--count", `${before}..HEAD`)).toBe("1");
    expect(git(root, "log", "-1", "--format=%s")).toBe(`Update roadmap: ${subject}`);
    expect(result.commit).toBe(git(root, "rev-parse", "HEAD"));
    expect(result.milestones).toEqual(parseRoadmap(expected).milestones);
    expect(git(root, "diff", "HEAD^", "HEAD", "--name-only")).toBe(relative);
    expect(git(root, "diff", "--cached", "--name-only")).toBe("unrelated.txt");
    const snapshot = await (await project.app.request("/api/project")).json();
    expect(snapshot.milestones).toEqual(result.milestones);
    if (change.kind === "move")
      expect(snapshot.workItems[0].milestone).toBe(change.milestone ?? undefined);
  },
);

test.each(actions)(
  "$subject refuses unstaged and staged hand edits without touching either",
  async ({ change }) => {
    const { root, project } = fixture();
    const before = git(root, "rev-parse", "HEAD");
    const dirty = `${initial}\nHand edit.\n`;
    writeFileSync(join(root, relative), dirty);
    for (const staged of [false, true]) {
      if (staged) git(root, "add", relative);
      const status = git(root, "status", "--porcelain=v1");
      const response = await action(project, change);
      expect(response.status).toBe(409);
      expect((await response.json()).reason).toContain("hand edits");
      expect(readFileSync(join(root, relative), "utf8")).toBe(dirty);
      expect(git(root, "status", "--porcelain=v1")).toBe(status);
      expect(git(root, "rev-parse", "HEAD")).toBe(before);
    }
  },
);

test("refuses an untracked roadmap, including one ignored by Git", async () => {
  const { root, project } = fixture(null);
  writeFileSync(join(root, relative), initial);
  for (const ignored of [false, true]) {
    if (ignored) writeFileSync(join(root, ".git/info/exclude"), ".stintwork/roadmap.md\n");
    expect((await action(project, { kind: "add", name: "Next" })).status).toBe(409);
    expect(readFileSync(join(root, relative), "utf8")).toBe(initial);
  }
});

test("creates a missing roadmap, derives unique ids, and keeps them on rename", async () => {
  const { root, project } = fixture(null);
  rmSync(join(root, ".stintwork"), { recursive: true });
  expect((await action(project, { kind: "add", name: "Next delivery" })).status).toBe(200);
  expect((await action(project, { kind: "add", name: "Next delivery" })).status).toBe(200);
  expect(
    (await action(project, { kind: "rename", id: "next-delivery", name: "Renamed" })).status,
  ).toBe(200);
  expect(
    parseRoadmap(readFileSync(join(root, relative), "utf8")).milestones.map(({ id }) => id),
  ).toEqual(["next-delivery", "next-delivery-2"]);
  expect(git(root, "status", "--porcelain=v1")).toBe("");
});

test("no-op edits make no commit", async () => {
  const { root, project } = fixture();
  const before = git(root, "rev-parse", "HEAD");
  expect(
    await (await action(project, { kind: "rename", id: "first", name: "First" })).json(),
  ).toMatchObject({ commit: null });
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
  expect(readFileSync(join(root, relative), "utf8")).toBe(initial);
});

test.each(["--assume-unchanged", "--skip-worktree"])(
  "refuses hand edits hidden by Git's %s flag",
  async (flag) => {
    const { root, project } = fixture();
    git(root, "update-index", flag, relative);
    const dirty = `${initial}\nHidden hand edit.\n`;
    writeFileSync(join(root, relative), dirty);
    expect(git(root, "status", "--porcelain=v1")).toBe("");
    const before = git(root, "rev-parse", "HEAD");
    expect((await action(project, { kind: "add", name: "Next" })).status).toBe(409);
    expect(readFileSync(join(root, relative), "utf8")).toBe(dirty);
    expect(git(root, "rev-parse", "HEAD")).toBe(before);
  },
);

test.each([true, false])(
  "failed commits restore the roadmap and its index entry (existing: %s)",
  async (existing) => {
    const { root, project } = fixture(existing ? initial : null);
    const before = git(root, "rev-parse", "HEAD");
    const hook = join(root, ".git/hooks/pre-commit");
    writeFileSync(join(root, "unrelated.txt"), "Preserve this staged file.\n");
    git(root, "add", "unrelated.txt");
    const status = git(root, "status", "--porcelain=v1");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n");
    chmodSync(hook, 0o755);
    const response = await action(project, { kind: "add", name: "Next" });
    expect(response.status).toBe(503);
    expect(git(root, "rev-parse", "HEAD")).toBe(before);
    expect(git(root, "status", "--porcelain=v1")).toBe(status);
    if (existing) expect(readFileSync(join(root, relative), "utf8")).toBe(initial);
  },
);

test.each(["file", "directory"])(
  "refuses a symlinked roadmap %s without altering its target",
  async (kind) => {
    const { root, project } = fixture(null);
    const external = join(root, "outside");
    if (kind === "file") {
      writeFileSync(external, initial);
      symlinkSync(external, join(root, relative));
    } else {
      mkdirSync(external);
      writeFileSync(join(external, "roadmap.md"), initial);
      rmSync(join(root, ".stintwork"), { recursive: true });
      symlinkSync(external, join(root, ".stintwork"));
    }
    const response = await action(project, { kind: "add", name: "Next" });
    expect(response.status).toBe(409);
    expect(readFileSync(kind === "file" ? external : join(external, "roadmap.md"), "utf8")).toBe(
      initial,
    );
  },
);

test("refuses conflicting workflow declarations rather than committing a move the board would ignore", async () => {
  const { root, project } = fixture();
  writeFileSync(
    join(root, ".scratch/board/workflow.yaml"),
    "workflow: feature\nstage: implement\nmilestone: first\n",
  );
  const before = git(root, "rev-parse", "HEAD");
  const response = await action(project, { kind: "move", workItem: "board", milestone: "second" });
  expect(response.status).toBe(409);
  expect((await response.json()).reason).toContain("workflow.yaml declares");
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
  expect(readFileSync(join(root, relative), "utf8")).toBe(initial);
});

test.each([
  { kind: "move", workItem: "missing", milestone: "first" },
  { kind: "rename", id: "missing", name: "Name" },
  { kind: "reorder", ids: ["first"] },
  { kind: "update", id: "first", status: "done" },
  { kind: "add", name: "Injected\nId: bad" },
])("invalid actions cannot write or commit: %j", async (change) => {
  const { root, project } = fixture();
  const before = git(root, "rev-parse", "HEAD");
  expect((await action(project, change)).status).toBe(400);
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
  expect(readFileSync(join(root, relative), "utf8")).toBe(initial);
});

test("refuses malformed roadmaps without dropping invalid sections", async () => {
  const text = `${initial}\n## Broken\nId: broken\n`;
  const { root, project } = fixture(text);
  expect((await action(project, { kind: "add", name: "Next" })).status).toBe(400);
  expect(readFileSync(join(root, relative), "utf8")).toBe(text);
});

test("rejects foreign origins, missing JSON content type, and malformed JSON", async () => {
  const { project } = fixture();
  expect(
    (
      await action(project, { kind: "add", name: "Next" }, {
        "Content-Type": "application/json",
        origin: "https://example.invalid",
      } as Record<string, string>)
    ).status,
  ).toBe(403);
  expect(
    (await action(project, { kind: "add", name: "Next" }, {} as Record<string, string>)).status,
  ).toBe(400);
  expect(
    (
      await project.app.request("/api/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    ).status,
  ).toBe(400);
});

test("serializes concurrent roadmap writes without losing either change", async () => {
  const { root, project } = fixture();
  const responses = await Promise.all([
    action(project, { kind: "add", name: "Third" }),
    action(project, { kind: "rename", id: "first", name: "Renamed" }),
  ]);
  expect(responses.map(({ status }) => status)).toEqual([200, 200]);
  expect(
    parseRoadmap(readFileSync(join(root, relative), "utf8")).milestones.map(({ name }) => name),
  ).toEqual(["Renamed", "Second", "Third"]);
  expect(git(root, "rev-list", "--count", "HEAD")).toBe("3");
});
