import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { builtInWorkflows, createMemoryRepoFiles, indexProject } from "./index.js";

const ticket = (status: string, blockers = "none") =>
  `# 01 — A ticket\nStatus: ${status}\nBlocked by: ${blockers}\n`;

test("composes stages, milestone overrides, tickets and setup into one project snapshot", () => {
  const files = createMemoryRepoFiles({
    ".scratch/board/spec.md": "# The board",
    ".scratch/board/issues/02-next.md": ticket("ready-for-agent", "01"),
    ".scratch/board/issues/01-first.md": ticket("resolved"),
    ".scratch/board/workflow.yaml":
      "workflow: feature\nstage: review\nmilestone: m2\nstages: { spec: { agent: codex } }",
    ".scratch/unassigned/spec.md": "# Unassigned",
    ".stintwork/roadmap.md":
      "## First\nId: m1\nStatus: active\n- board\n## Second\nId: m2\nStatus: planned",
    "AGENTS.md": "# Agents",
    "CLAUDE.md": "See AGENTS.md",
    "GLOSSARY.md": "# Glossary",
    "docs/agents/issue-tracker.md": "Use local Markdown in .scratch/",
    "docs/adr/0001-files.md": "# Files are the source of truth",
  });
  const snapshot = indexProject(files, { name: "Stintwork", branch: "main" });
  expect(snapshot).toMatchObject({
    name: "Stintwork",
    branch: "main",
    workflows: builtInWorkflows,
    milestones: [{ id: "m1" }, { id: "m2" }],
    workItems: [
      {
        slug: "board",
        stage: "review",
        inferred: false,
        milestone: "m2",
        declaredMilestone: "m2",
        stages: { spec: { agent: "codex" } },
        tickets: [
          { number: 1, resolved: true },
          { number: 2, resolved: false, blocked: false },
        ],
      },
      { slug: "unassigned", stage: "spec", inferred: true },
    ],
    setup: {
      hasIssueTracker: true,
      usesLocalMarkdown: true,
      hasAgents: true,
      hasClaude: true,
      hasGlossary: true,
      hasAdrs: true,
      warnings: [],
    },
    warnings: [],
  });
  expect(snapshot.workItems[1]).not.toHaveProperty("milestone");
  expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
});

test("merges warnings from every indexing step without duplicating ticket warnings", () => {
  const files = createMemoryRepoFiles({
    ".scratch/board/issues/01-first.md": "# First\nBlocked by: none",
    ".scratch/board/workflow.yaml": "workflow: unknown\nstage: implement",
    ".scratch/other/workflow.yaml": "workflow: quick\nstage: do\nmilestone: missing",
    ".stintwork/roadmap.md": "## Invalid\nId: bad\n## Valid\nId: m1\nStatus: active\n- absent",
    "docs/agents/issue-tracker.md": "Local Markdown",
  });
  const snapshot = indexProject(
    {
      ...files,
      read: (path) => {
        if (path === "docs/agents/issue-tracker.md") throw new Error("Permission denied");
        return files.read(path);
      },
    },
    { name: "Warnings" },
  );
  expect(snapshot.warnings.map((warning) => warning.path)).toEqual([
    ".scratch/board/issues/01-first.md",
    ".scratch/board/workflow.yaml",
    ".stintwork/roadmap.md",
    ".stintwork/roadmap.md",
    ".scratch/other/workflow.yaml",
    "docs/agents/issue-tracker.md",
  ]);
  expect(snapshot.setup.warnings).toEqual(snapshot.warnings.slice(-1));
  expect(snapshot.workItems[1].milestone).toBe("missing");
});

test("missing project files leave a useful empty snapshot", () => {
  const snapshot = indexProject(createMemoryRepoFiles({}), { name: "Empty" });
  expect(snapshot).not.toHaveProperty("branch");
  expect(snapshot.workItems).toEqual([]);
  expect(snapshot.milestones).toEqual([]);
  expect(snapshot.warnings).toEqual([]);
  expect(snapshot.setup.hasAgents).toBe(false);
});

test("an unreadable roadmap warns without hiding work items", () => {
  const files = createMemoryRepoFiles({ ".scratch/board/spec.md": "# Board" });
  const snapshot = indexProject(
    {
      ...files,
      read: (path) => {
        if (path === ".stintwork/roadmap.md") throw new Error("Permission denied");
        return files.read(path);
      },
    },
    { name: "Unreadable" },
  );
  expect(snapshot.workItems).toHaveLength(1);
  expect(snapshot.milestones).toEqual([]);
  expect(snapshot.warnings).toEqual([
    { path: ".stintwork/roadmap.md", message: expect.stringContaining("Permission denied") },
  ]);
});

test.each([
  "stages: { spec: { value: !!omap [ { key: value } ] } }",
  "stages: { spec: { value: !!set { key: null } } }",
  "stages: { spec: { value: .inf } }",
  "stages: &cycle { spec: { value: *cycle } }",
])("non-JSON workflow records fall back to inference: %s", (stages) => {
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".scratch/board/spec.md": "# Board",
      ".scratch/board/workflow.yaml": `workflow: feature\nstage: review\n${stages}`,
    }),
    { name: "Invalid records" },
  );
  expect(snapshot.workItems[0]).toMatchObject({ inferred: true, stage: "spec", stages: {} });
  expect(snapshot.warnings).toHaveLength(1);
  expect(() => JSON.stringify(snapshot)).not.toThrow();
});

test("indexes this repository's real project files read from disk", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const paths = ["AGENTS.md", "CLAUDE.md", "GLOSSARY.md"];
  for (const directory of [".scratch", ".stintwork", "docs/agents", "docs/adr"]) {
    paths.push(
      ...readdirSync(join(root, directory), { recursive: true }).map(
        (path) => `${directory}/${path}`,
      ),
    );
  }
  const contents = Object.fromEntries(
    paths
      .filter((path) => statSync(join(root, path), { throwIfNoEntry: false })?.isFile())
      .map((path) => [path, readFileSync(join(root, path), "utf8")]),
  );
  const snapshot = indexProject(createMemoryRepoFiles(contents), { name: "Stintwork" });
  const board = snapshot.workItems.find((item) => item.slug === "board");
  expect(board).toMatchObject({ title: expect.stringContaining("board"), milestone: "m1" });
  expect(board?.tickets.map((item) => item.path)).toEqual(
    paths.filter((path) => /^\.scratch\/board\/issues\/\d+-[^/]+\.md$/.test(path)).sort(),
  );
  expect(board?.tickets.some((item) => item.number === 5)).toBe(true);
  expect(snapshot.setup).toMatchObject({ hasAgents: true, hasGlossary: true, hasAdrs: true });
  expect(snapshot.warnings).toEqual([]);
});
