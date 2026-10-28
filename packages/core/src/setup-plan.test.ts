// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { createMemoryRepoFiles, parseRoadmap, planSetup, setupPaths } from "./index.js";

test("a bare repo proposes exactly five files with full content without writing", () => {
  const files = createMemoryRepoFiles({});
  const plan = planSetup(files);
  expect(plan.warnings).toEqual([]);
  expect(plan.changes.map(({ path }) => path)).toEqual(setupPaths);
  expect(
    plan.changes.every(({ before, content }) => before === null && content.endsWith("\n")),
  ).toBe(true);
  expect(plan.changes[0].content).toContain("local Markdown in `.scratch/`");
  expect(plan.changes[0].content).toContain("issues/NN-<slug>.md");
  expect(plan.changes[1].content).toContain("## Agent skills");
  expect(plan.changes[1].content).toContain("docs/agents/issue-tracker.md");
  expect(plan.changes[2].content).toBe("@AGENTS.md\n");
  expect(plan.changes[3].content).toBe(".stintwork/local/\n");
  expect(parseRoadmap(plan.changes[4].content)).toMatchObject({
    milestones: [{ id: "first-milestone", status: "planned", workItemSlugs: [] }],
    warnings: [],
  });
  expect(files.list("")).toEqual([]);
});

test.each(["# Existing instructions", "# Existing instructions\n", "# Existing instructions\r\n"])(
  "a partly set-up repo preserves AGENTS.md byte-for-byte before its appended block: %j",
  (agents) => {
    const roadmap = "# My roadmap\n";
    const plan = planSetup(
      createMemoryRepoFiles({
        "AGENTS.md": agents,
        "CLAUDE.md": "Developer-owned Claude instructions",
        "docs/agents/issue-tracker.md": "Local Markdown in .scratch/",
        ".gitignore": "node_modules/\n",
        ".stintwork/roadmap.md": roadmap,
      }),
    );
    expect(plan.changes.map(({ path }) => path)).toEqual(["AGENTS.md", ".gitignore"]);
    expect(plan.changes[0]).toMatchObject({ before: agents });
    expect(plan.changes[0].content.startsWith(agents)).toBe(true);
    expect(plan.changes[1]).toMatchObject({
      before: "node_modules/\n",
      content: "node_modules/\n\n.stintwork/local/\n",
    });
  },
);

test("a fully set-up repo proposes nothing and setup is idempotent", () => {
  const contents = Object.fromEntries(
    planSetup(createMemoryRepoFiles({})).changes.map(({ path, content }) => [path, content]),
  );
  expect(planSetup(createMemoryRepoFiles(contents))).toMatchObject({ changes: [], warnings: [] });
  contents[".gitignore"] = "/.stintwork/local/\r\n";
  expect(planSetup(createMemoryRepoFiles(contents)).changes).toEqual([]);
});

test("an existing Agent skills heading without the tracker pointer still gets a proposal", () => {
  const before = "# Instructions\n\n## Agent skills\n\nExisting conventions.\n";
  const change = planSetup(createMemoryRepoFiles({ "AGENTS.md": before })).changes.find(
    ({ path }) => path === "AGENTS.md",
  );
  expect(change?.content.startsWith(before)).toBe(true);
  expect(change?.content).toContain("docs/agents/issue-tracker.md");
});

test("a nonlocal tracker offers only an opt-in destructive local replacement", () => {
  const plan = planSetup(
    createMemoryRepoFiles({ "docs/agents/issue-tracker.md": "Use team queue." }),
  );
  expect(plan.changes[0]).toMatchObject({
    checkId: "tracker",
    before: "Use team queue.",
    content: expect.stringContaining(".scratch/"),
    removedLines: 1,
    selectedByDefault: false,
  });
  expect(plan.tracker).toBe("other");
  expect(plan.checks[0].status).toBe("other-tracker");
  expect(plan.changes.filter(({ checkId }) => checkId === "agents")).toEqual([
    expect.objectContaining({
      path: "AGENTS.md",
      selectedByDefault: false,
      requires: setupPaths[0],
    }),
    expect.objectContaining({
      path: "CLAUDE.md",
      selectedByDefault: false,
      requires: setupPaths[0],
    }),
  ]);
});

test("every proposal serves an attention check or an independent reason", () => {
  const plan = planSetup(createMemoryRepoFiles({ "AGENTS.md": "# Existing rules" }));
  expect(plan.changes.map(({ path, checkId, reasonId }) => ({ path, checkId, reasonId }))).toEqual([
    { path: "docs/agents/issue-tracker.md", checkId: "tracker", reasonId: undefined },
    { path: "AGENTS.md", checkId: "agents", reasonId: undefined },
    { path: "CLAUDE.md", checkId: "agents", reasonId: undefined },
    { path: ".gitignore", checkId: undefined, reasonId: "localRunData" },
    { path: ".stintwork/roadmap.md", checkId: undefined, reasonId: "roadmap" },
  ]);
  for (const change of plan.changes.filter(({ checkId }) => checkId))
    expect(plan.checks.find(({ id }) => id === change.checkId)?.ready).toBe(false);
  expect(plan.checks).toContainEqual({ id: "glossary", ready: false, status: "optional" });
  expect(plan.checks).toContainEqual({ id: "adrs", ready: false, status: "optional" });
});

test("unreadable and binary targets are warnings, not replacement proposals", () => {
  const plan = planSetup({
    list: () => ["AGENTS.md"],
    read: (path) => {
      if (path === "AGENTS.md") throw new Error("Unreadable");
      if (path === ".gitignore") return "\0binary";
      return undefined;
    },
  });
  expect(plan.changes.map(({ path }) => path)).not.toContain("AGENTS.md");
  expect(plan.changes.map(({ path }) => path)).not.toContain(".gitignore");
  expect(plan.warnings.map(({ path }) => path)).toEqual(["AGENTS.md", ".gitignore"]);
});

test.each(["# Issue tracker: Team queue\n\nUse the team's queue.\nKeep its routing rules.\n", ""])(
  "existing trackers are never switched by default: %j",
  (content) => {
    const plan = planSetup(createMemoryRepoFiles({ [setupPaths[0]]: content }));
    const replacement = plan.changes.find(({ path }) => path === setupPaths[0]);
    expect(replacement).toMatchObject({ before: content, selectedByDefault: false });
    expect(replacement?.removedLines).toBe(content ? 3 : 0);
    const defaults = plan.changes.filter(({ selectedByDefault }) => selectedByDefault);
    expect(defaults.map(({ path }) => path)).toEqual([".gitignore", ".stintwork/roadmap.md"]);
    expect(defaults.every(({ removedLines }) => removedLines === 0)).toBe(true);
  },
);

test("a local guide is preserved, appends remove no lines, and new pointers require a tracker", () => {
  const content = "# Issue tracker: Local Markdown\n\nTickets live in .scratch/.\n";
  const plan = planSetup(
    createMemoryRepoFiles({ [setupPaths[0]]: content, "AGENTS.md": "# Rules\n" }),
  );
  expect(plan.changes.some(({ path }) => path === setupPaths[0])).toBe(false);
  expect(
    plan.changes.every(({ removedLines, selectedByDefault }) => !removedLines && selectedByDefault),
  ).toBe(true);
  expect(plan.changes.find(({ path }) => path === "AGENTS.md")?.requires).toBeUndefined();
  expect(
    planSetup(createMemoryRepoFiles({})).changes.find(({ path }) => path === "AGENTS.md"),
  ).toMatchObject({ requires: setupPaths[0], selectedByDefault: true });
});

test.each([
  "# Rules\n\n## Agent skills\n\n### Issue tracker\nUse docs/team-queue.md.\n",
  "# Rules\n\nUse GitHub Issues and gh issue view.\n",
  "# Rules\n\nSee [Ticket tracker](docs/team-queue.md).\n",
  "# Rules\n\nSee docs/agents/issue-tracker.md.\n",
])("never duplicates or rewrites an existing tracker pointer: %j", (content) => {
  const plan = planSetup(
    createMemoryRepoFiles({
      "AGENTS.md": content,
      [setupPaths[0]]: "# Issue tracker: GitHub\n\nUse gh issue list.\n",
    }),
  );
  expect(plan.changes.some(({ path }) => path === "AGENTS.md")).toBe(false);
});

test("removed-line metadata matches the diff, including an unterminated appended line", () => {
  const plan = planSetup(createMemoryRepoFiles({ "AGENTS.md": "Keep this unterminated line" }));
  expect(plan.changes.find(({ path }) => path === "AGENTS.md")).toMatchObject({
    removedLines: 1,
    selectedByDefault: false,
  });
});

test("GitHub setup preserves its tracker by default and requires an explicit switch for pointers", () => {
  const content = "# Issue tracker: GitHub\n\nUse gh issue list.\n";
  const plan = planSetup(createMemoryRepoFiles({ [setupPaths[0]]: content }));
  expect(plan.tracker).toBe("github-issues");
  expect(plan.changes.find(({ path }) => path === setupPaths[0])).toMatchObject({
    before: content,
    content: expect.stringContaining("Local Markdown"),
    selectedByDefault: false,
  });
  expect(plan.changes.filter(({ checkId }) => checkId === "agents")).toEqual([
    expect.objectContaining({
      path: "AGENTS.md",
      requires: setupPaths[0],
      selectedByDefault: false,
      content: expect.stringContaining("local Markdown"),
    }),
    expect.objectContaining({
      path: "CLAUDE.md",
      requires: setupPaths[0],
      selectedByDefault: false,
    }),
  ]);
  expect(
    plan.changes.filter(({ selectedByDefault }) => selectedByDefault).map(({ path }) => path),
  ).toEqual([".gitignore", ".stintwork/roadmap.md"]);
  expect(plan.checks[0]).toMatchObject({ ready: false, status: "other-tracker" });
});
