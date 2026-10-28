// SPDX-License-Identifier: Apache-2.0
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
      tracker: "local-markdown",
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
  for (const workItem of snapshot.workItems) {
    const preceding = new Set<number>();
    for (const ticket of workItem.tickets) {
      expect(ticket.blockedBy.every((number) => preceding.has(number))).toBe(true);
      preceding.add(ticket.number);
    }
  }
  expect(snapshot.setup).toMatchObject({ hasAgents: true, hasGlossary: true, hasAdrs: true });
  expect(snapshot.warnings).toEqual([]);
});

test("GitHub discovery supplies board work items without importing local Markdown", () => {
  const files = createMemoryRepoFiles({
    "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n",
    ".scratch/local/spec.md": "# Local draft",
  });
  const github = {
    repository: "Example/Project",
    repositoryId: "R_test",
    scanned: 1,
    cursor: null,
    complete: false,
    pages: [],
    warnings: ["incomplete"],
    items: [
      {
        id: "I_1",
        number: 1,
        title: "Remote work",
        url: "https://github.com/Example/Project/issues/1",
        complete: false,
      },
    ],
  };
  const project = indexProject(files, { name: "project", github });
  expect(project.github).toEqual(github);
  expect(project.workItems).toMatchObject([
    {
      slug: "github-1",
      title: "Remote work",
      github: { repositoryId: "R_test", issueId: "I_1", number: 1, complete: false },
    },
  ]);
  expect(project.workItems).toHaveLength(1);
});

test("GitHub workflow projects the same shipped and pull request records as local workflow", () => {
  const merged = { at: "2026-10-28T10:00:00Z", commit: "a".repeat(40), pr: "12", method: "squash" };
  const pullRequest = {
    number: 12,
    url: "https://github.com/example/project/pull/12",
    repo: "example/project",
    remote: "origin",
    remoteUrl: "git@github.com:example/project.git",
    branch: "stintwork/first",
    base: "main",
    headCommit: "a".repeat(40),
    mergeMethod: "squash",
  };
  const workflow = `workflow: feature\nstage: ship\nmerged: ${JSON.stringify(merged)}\npullRequest: ${JSON.stringify(pullRequest)}\n`;
  const local = indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First",
      ".scratch/first/workflow.yaml": workflow,
    }),
    { name: "Local" },
  );
  const github = {
    repository: "example/project",
    repositoryId: "R",
    scanned: 1,
    cursor: null,
    complete: true,
    pages: [],
    warnings: [],
    items: [
      {
        id: "I",
        number: 1,
        title: "First",
        url: "https://github.com/example/project/issues/1",
        bound: true,
        complete: true,
      },
    ],
  };
  const remote = indexProject(
    createMemoryRepoFiles({
      "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n",
      ".stintwork/github/example/project/1/workflow.yaml": workflow,
    }),
    { name: "Remote", github },
  );
  expect(local.workItems[0]).toMatchObject({ merged, pullRequest });
  expect(remote.workItems[0]).toMatchObject({
    merged: local.workItems[0].merged,
    pullRequest: local.workItems[0].pullRequest,
  });
  expect(remote.attentionItems.some((entry) => entry.kind === "gate-ready")).toBe(false);
});

test("local stint history is associated only with a validated GitHub identity", () => {
  const log = {
    type: "started",
    at: "2026-10-27T10:00:00Z",
    stint: {
      id: "first",
      workItem: "github-1",
      stage: "spec",
      ticket: null,
      agent: "codex",
      worktree: { path: "/project-worktrees/github-1", branch: "stintwork/github-1" },
      baseCommit: "base",
      brief: {
        skill: null,
        pointers: [],
        lastHandoff: null,
        changedPaths: [],
        prompt: "Read the spec",
      },
    },
  };
  const files = createMemoryRepoFiles({
    "docs/agents/issue-tracker.md": "# Issue tracker: GitHub\n",
    ".stintwork/local/stints/first.jsonl": `${JSON.stringify(log)}\n`,
  });
  const item = {
    id: "I_1",
    number: 1,
    title: "Parent",
    url: "https://github.com/Example/Project/issues/1",
    complete: true,
  };
  const github = {
    repository: "Example/Project",
    repositoryId: "R_test",
    scanned: 1,
    cursor: null,
    complete: true,
    pages: [],
    warnings: [],
    items: [item],
  };
  expect(indexProject(files, { name: "project", github }).workItems[0].stints).toHaveLength(0);
  expect(
    indexProject(files, {
      name: "project",
      github: { ...github, items: [{ ...item, bound: true }] },
    }).workItems[0].stints,
  ).toHaveLength(1);
});

test("GitHub ticket snapshots preserve status and dependency information", () => {
  const files = createMemoryRepoFiles({
    "docs/agents/issue-tracker.md": "# Issue tracker: GitHub",
  });
  const snapshot = indexProject(files, {
    name: "Remote",
    github: {
      repository: "example/project",
      repositoryId: "R1",
      scanned: 1,
      cursor: null,
      complete: true,
      pages: [],
      warnings: [],
      items: [
        {
          id: "I1",
          number: 1,
          title: "Parent",
          url: "https://github.com/example/project/issues/1",
          complete: true,
          detail: {
            spec: "The spec",
            tickets: [
              {
                number: 3,
                title: "Next",
                state: "open",
                stateReason: null,
                labels: [],
                body: "",
                comments: [],
                blockedBy: [2],
                blocked: true,
              },
              {
                number: 2,
                title: "First",
                state: "closed",
                stateReason: "completed",
                labels: [],
                body: "",
                comments: [],
                blockedBy: [],
                blocked: false,
              },
            ],
          },
        },
      ],
    },
  });
  expect(snapshot.workItems[0].spec?.text).toBe("The spec");
  expect(
    snapshot.workItems[0].tickets.map(({ number, status, resolved, blocked }) => ({
      number,
      status,
      resolved,
      blocked,
    })),
  ).toEqual([
    { number: 2, status: "resolved", resolved: true, blocked: false },
    { number: 3, status: "open", resolved: false, blocked: true },
  ]);
});

test("GitHub tickets map configured roles, closure reasons and dependencies", () => {
  const files = createMemoryRepoFiles({
    "docs/agents/issue-tracker.md": "# Issue tracker: GitHub",
    "docs/agents/triage-labels.md":
      "| `ready-for-agent` | `agent-ready` |\n| `needs-info` | `waiting` |",
  });
  const make = (
    number: number,
    state: string,
    stateReason: string | null,
    labels: string[],
    blockedBy: number[] = [],
  ) => ({
    number,
    title: `Ticket ${number}`,
    state,
    stateReason,
    labels,
    body: "",
    comments: [],
    blockedBy,
    blocked: false,
  });
  const github = {
    repository: "example/project",
    repositoryId: "R",
    scanned: 1,
    cursor: null,
    complete: true,
    pages: [],
    warnings: [],
    items: [
      {
        id: "I",
        number: 1,
        title: "Parent",
        url: "https://github.com/example/project/issues/1",
        complete: true,
        detail: {
          spec: "",
          tickets: [
            make(2, "open", null, ["agent-ready"], [5]),
            make(3, "closed", "not_planned", []),
            make(4, "open", null, ["agent-ready", "waiting"]),
            make(5, "closed", "completed", []),
            make(6, "closed", null, []),
          ],
        },
      },
    ],
  };
  const snapshot = indexProject(files, { name: "Remote", github });
  expect(
    snapshot.workItems[0].tickets.map(({ number, status, resolved }) => [number, status, resolved]),
  ).toEqual([
    [3, "cancelled", false],
    [4, "unknown", false],
    [5, "resolved", true],
    [2, "ready-for-agent", false],
    [6, "unknown", false],
  ]);
  expect(snapshot.warnings.some(({ message }) => /conflicting/i.test(message))).toBe(true);
});

test("an active GitHub ticket stint is in progress; assignment alone is not", () => {
  const log = {
    type: "started",
    at: "2026-10-27T10:00:00Z",
    stint: {
      id: "active",
      workItem: "github-1",
      stage: "implement",
      ticket: 2,
      agent: "codex",
      worktree: { path: "/tmp/tree", branch: "stintwork/github-1" },
      baseCommit: "base",
      brief: {
        skill: null,
        pointers: [],
        lastHandoff: null,
        changedPaths: [],
        prompt: "Implement",
      },
    },
  };
  const files = createMemoryRepoFiles({
    "docs/agents/issue-tracker.md": "# Issue tracker: GitHub",
    ".stintwork/local/stints/active.jsonl": `${JSON.stringify(log)}\n`,
  });
  const ticket = (number: number) => ({
    number,
    title: "Ticket",
    state: "open",
    stateReason: null,
    labels: ["ready-for-agent"],
    body: "",
    comments: [],
    blockedBy: [],
    blocked: false,
  });
  const github = {
    repository: "example/project",
    repositoryId: "R",
    scanned: 1,
    cursor: null,
    complete: true,
    pages: [],
    warnings: [],
    items: [
      {
        id: "I",
        number: 1,
        title: "Parent",
        url: "https://github.com/example/project/issues/1",
        complete: true,
        bound: true,
        detail: { spec: "", tickets: [ticket(2), ticket(3)] },
      },
    ],
  };
  expect(
    indexProject(files, { name: "Remote", github }).workItems[0].tickets.map(
      ({ status }) => status,
    ),
  ).toEqual(["in-progress", "ready-for-agent"]);
});

test("an unreadable GitHub triage mapping does not invent an open ticket state", () => {
  const files = createMemoryRepoFiles({
    "docs/agents/issue-tracker.md": "# Issue tracker: GitHub",
  });
  const github = {
    repository: "example/project",
    repositoryId: "R",
    scanned: 1,
    cursor: null,
    complete: true,
    pages: [],
    warnings: [],
    items: [
      {
        id: "I",
        number: 1,
        title: "Parent",
        url: "https://github.com/example/project/issues/1",
        complete: true,
        detail: {
          spec: "",
          tickets: [
            {
              number: 2,
              title: "Ticket",
              state: "open",
              stateReason: null,
              labels: ["ready-for-agent"],
              body: "",
              comments: [],
              blockedBy: [],
              blocked: false,
            },
          ],
        },
      },
    ],
  };
  const snapshot = indexProject(
    {
      ...files,
      read: (path) => {
        if (path === "docs/agents/triage-labels.md") throw Error("unavailable");
        return files.read(path);
      },
    },
    { name: "Remote", github },
  );
  expect(snapshot.workItems[0].tickets[0].status).toBe("unknown");
});

test("GitHub cycle fallback keeps already ordered tickets before blocked cycle members", () => {
  const files = createMemoryRepoFiles({
    "docs/agents/issue-tracker.md": "# Issue tracker: GitHub",
  });
  const ticket = (number: number, blockedBy: number[]) => ({
    number,
    title: `Ticket ${number}`,
    state: "open",
    stateReason: null,
    labels: [],
    body: "",
    comments: [],
    blockedBy,
    blocked: false,
  });
  const github = {
    repository: "example/project",
    repositoryId: "R",
    scanned: 1,
    cursor: null,
    complete: true,
    pages: [],
    warnings: [],
    items: [
      {
        id: "I",
        number: 1,
        title: "Parent",
        url: "https://github.com/example/project/issues/1",
        complete: true,
        detail: {
          spec: "",
          tickets: [ticket(1, [2]), ticket(2, []), ticket(3, [4]), ticket(4, [3]), ticket(5, [3])],
        },
      },
    ],
  };
  const snapshot = indexProject(files, { name: "Remote", github });
  expect(snapshot.workItems[0].tickets.map(({ number, blocked }) => [number, blocked])).toEqual([
    [2, false],
    [1, false],
    [3, true],
    [4, true],
    [5, true],
  ]);
  expect(snapshot.warnings.some(({ message }) => /cycle/i.test(message))).toBe(true);
});

test("stale GitHub detail blocks only its own tickets", () => {
  const files = createMemoryRepoFiles({
    "docs/agents/issue-tracker.md": "# Issue tracker: GitHub",
  });
  const ticket = {
    number: 2,
    title: "Ticket",
    state: "closed",
    stateReason: "completed",
    labels: [],
    body: "",
    comments: [],
    blockedBy: [],
    blocked: false,
  };
  const github = {
    repository: "example/project",
    repositoryId: "R",
    scanned: 2,
    cursor: null,
    complete: true,
    pages: [],
    warnings: [],
    items: [
      {
        id: "I1",
        number: 1,
        title: "Stale",
        url: "https://github.com/example/project/issues/1",
        complete: false,
        detail: { spec: "Old", stale: true, tickets: [ticket] },
      },
      {
        id: "I3",
        number: 3,
        title: "Fresh",
        url: "https://github.com/example/project/issues/3",
        complete: true,
        detail: { spec: "New", tickets: [ticket] },
      },
    ],
  };
  const snapshot = indexProject(files, { name: "Remote", github });
  expect(
    snapshot.workItems.map((item) => [
      item.tickets[0].status,
      item.tickets[0].resolved,
      item.tickets[0].blocked,
    ]),
  ).toEqual([
    ["unknown", false, true],
    ["resolved", true, false],
  ]);
});
