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
  expect(planSetup(createMemoryRepoFiles(contents))).toEqual({ changes: [], warnings: [] });
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

test("a nonlocal tracker shows its current content and the proposed local replacement", () => {
  const plan = planSetup(
    createMemoryRepoFiles({ "docs/agents/issue-tracker.md": "Use GitHub Issues." }),
  );
  expect(plan.changes[0]).toMatchObject({
    before: "Use GitHub Issues.",
    content: expect.stringContaining(".scratch/"),
  });
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
