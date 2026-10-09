import { expect, test } from "vitest";
import { builtInWorkflows, createMemoryRepoFiles, indexWorkItems, resolveStages } from "./index.js";

function ticket(status = "open"): string {
  return `# Ticket\nStatus: ${status}\nBlocked by: none\n`;
}

function resolve(contents: Record<string, string>) {
  const files = createMemoryRepoFiles(contents);
  return resolveStages(indexWorkItems(files), files);
}

test("infers clarify, spec, implement and review from files for a feature", () => {
  const cases: { files: Record<string, string>; stage: string }[] = [
    { files: {}, stage: "clarify" },
    { files: { "spec.md": "# Example" }, stage: "spec" },
    { files: { "issues/01-ticket.md": ticket() }, stage: "implement" },
    {
      files: {
        "spec.md": "# Example",
        "issues/01-ticket.md": ticket("resolved"),
        "issues/02-ticket.md": ticket("ready-for-agent"),
      },
      stage: "implement",
    },
    {
      files: {
        "issues/01-ticket.md": ticket("ReSoLvEd"),
        "issues/02-ticket.md": ticket("DONE"),
        "issues/03-ticket.md": ticket("Closed"),
      },
      stage: "review",
    },
  ];
  for (const scenario of cases) {
    const { workItems, warnings } = resolve({
      ".scratch/example/notes.md": "Notes",
      ...Object.fromEntries(
        Object.entries(scenario.files).map(([path, text]) => [`.scratch/example/${path}`, text]),
      ),
    });
    expect(warnings).toEqual([]);
    expect(workItems[0]).toMatchObject({
      workflow: "feature",
      stage: scenario.stage,
      column: scenario.stage,
      inferred: true,
      stages: {},
    });
    expect(workItems[0].declaredMilestone).toBeUndefined();
  }
});

test("infers diagnose and fix for slugs starting with bug-, fix- or b-", () => {
  for (const slug of ["bug-example", "fix-example", "b-example"]) {
    const notes = { [`.scratch/${slug}/notes.md`]: "Notes" };
    for (const contents of [notes, { ...notes, [`.scratch/${slug}/spec.md`]: "# Example" }]) {
      expect(resolve(contents).workItems[0]).toMatchObject({
        workflow: "bug",
        stage: "diagnose",
        inferred: true,
      });
    }
    expect(
      resolve({ [`.scratch/${slug}/issues/01-ticket.md`]: ticket() }).workItems[0],
    ).toMatchObject({
      workflow: "bug",
      stage: "fix",
      inferred: true,
    });
    expect(
      resolve({ [`.scratch/${slug}/issues/01-ticket.md`]: ticket("done") }).workItems[0],
    ).toMatchObject({ workflow: "bug", stage: "review", inferred: true });
  }
  for (const slug of ["bug", "prefix-bug-example", "Bug-example"]) {
    expect(resolve({ [`.scratch/${slug}/notes.md`]: "Notes" }).workItems[0].workflow).toBe(
      "feature",
    );
  }
});

test("workflow.yaml stage overrides inference and is not marked inferred", () => {
  const { workItems, warnings } = resolve({
    ".scratch/bug-example/issues/01-ticket.md": ticket(),
    ".scratch/bug-example/workflow.yaml": `workflow: quick
stage: review
milestone: m1
ignored: true
stages:
  do:
    agent: codex
    approved: { by: you, at: 2026-10-09T10:30:00Z, commit: a41c9e2 }
    extra: { labels: [one, two], note: unchanged }
  custom:
    data: [1, false, null]
`,
  });
  expect(warnings).toEqual([]);
  expect(workItems[0]).toMatchObject({
    workflow: "quick",
    stage: "review",
    column: "review",
    inferred: false,
    declaredMilestone: "m1",
  });
  expect(workItems[0].stages).toEqual({
    do: {
      agent: "codex",
      approved: { by: "you", at: "2026-10-09T10:30:00Z", commit: "a41c9e2" },
      extra: { labels: ["one", "two"], note: "unchanged" },
    },
    custom: { data: [1, false, null] },
  });
  expect(workItems[0]).not.toHaveProperty("ignored");
});

test("invalid workflow.yaml warns and falls back to inference", () => {
  const invalidFiles = [
    "workflow: [",
    "workflow: unknown\nstage: review",
    "workflow: constructor\nstage: review",
    "workflow: __proto__\nstage: review",
    "workflow: feature\nstage: fix",
    "workflow: bug\nstage: spec",
    "workflow: quick\nstage: implement",
    "workflow: feature",
    "stage: spec",
    "workflow: feature\nworkflow: bug\nstage: review",
    "workflow: feature\nstage: review\n---\nworkflow: quick\nstage: do",
    "workflow: feature\nstage: review\nstages: []",
    "workflow: feature\nstage: review\nstages: { spec: null }",
    "workflow: feature\nstage: review\nmilestone: 42",
    "workflow: feature\nstage: review\nmilestone: ''",
    "workflow: feature\nstage: review\nvalue: !unknown text",
    "\0binary",
    "",
    "null",
    "[]",
  ];
  for (const text of invalidFiles) {
    const { workItems, warnings } = resolve({
      ".scratch/example/spec.md": "# Example",
      ".scratch/example/workflow.yaml": text,
      ".scratch/other/spec.md": "# Other",
    });
    expect(workItems[0]).toMatchObject({
      workflow: "feature",
      stage: "spec",
      column: "spec",
      inferred: true,
      stages: {},
    });
    expect(workItems[0].declaredMilestone).toBeUndefined();
    expect(workItems[1]).toMatchObject({ stage: "spec", inferred: true });
    expect(warnings).toEqual([
      { path: ".scratch/example/workflow.yaml", message: expect.stringContaining("inference") },
    ]);
  }
  expect(
    resolve({
      ".scratch/bug-example/workflow.yaml": "workflow: quick\nstage: implement\nmilestone: m1",
      ".scratch/bug-example/issues/01-ticket.md": ticket(),
    }).workItems[0],
  ).toMatchObject({ workflow: "bug", stage: "fix", inferred: true, stages: {} });
});

test("maps diagnose, fix and do onto the shared board columns", () => {
  expect(
    Object.values(builtInWorkflows).map((workflow) => workflow.stages.map((stage) => stage.id)),
  ).toEqual([
    ["clarify", "spec", "tickets", "implement", "review", "ship"],
    ["diagnose", "fix", "review", "ship"],
    ["do", "review", "ship"],
  ]);
  for (const workflow of Object.values(builtInWorkflows)) {
    expect(workflow.name).not.toBe("");
    for (const stage of workflow.stages) {
      expect(stage.name).not.toBe("");
      const { workItems, warnings } = resolve({
        ".scratch/example/workflow.yaml": `workflow: ${workflow.id}\nstage: ${stage.id}`,
      });
      expect(warnings).toEqual([]);
      expect(workItems[0]).toMatchObject({
        workflow: workflow.id,
        stage: stage.id,
        inferred: false,
        column: ["fix", "do"].includes(stage.id)
          ? "implement"
          : stage.id === "diagnose"
            ? "clarify"
            : stage.id,
      });
      expect(workItems[0].column).toBe(stage.column);
    }
  }
});

test("effort work items get no inferred stage", () => {
  const cases: Record<string, string>[] = [
    {},
    { ".scratch/effort/spec.md": "# Effort" },
    { ".scratch/effort/issues/01-ticket.md": ticket() },
    { ".scratch/effort/issues/01-ticket.md": ticket("resolved") },
    {
      ".scratch/effort/workflow.yaml":
        "workflow: bug\nstage: fix\nmilestone: m1\nstages: { fix: { agent: codex } }",
    },
  ];
  for (const extra of cases) {
    const { workItems, warnings } = resolve({ ".scratch/effort/map.md": "# Effort", ...extra });
    expect(warnings).toEqual([]);
    expect(workItems[0]).toMatchObject({ type: "effort", inferred: false });
    expect(workItems[0].stage).toBeUndefined();
    expect(workItems[0].column).toBeUndefined();
    if (".scratch/effort/workflow.yaml" in extra) {
      expect(workItems[0]).toMatchObject({
        workflow: "bug",
        stages: { fix: { agent: "codex" } },
        declaredMilestone: "m1",
      });
    }
  }
});

test("preserves the input index and appends file-read warnings without throwing", () => {
  const files = createMemoryRepoFiles({
    ".scratch/example/spec.md": "# Example",
    ".scratch/example/issues/01-ticket.md": "# Ticket\nBlocked by: none",
    ".scratch/other/spec.md": "# Other",
  });
  const index = indexWorkItems(files);
  const original = structuredClone(index);
  const staged = resolveStages(index, {
    ...files,
    read: (path) => {
      if (path === ".scratch/example/workflow.yaml") throw new Error("Unreadable");
      return files.read(path);
    },
  });
  expect(index).toEqual(original);
  expect(staged.warnings).not.toBe(index.warnings);
  expect(staged.warnings).toEqual([
    ...index.warnings,
    { path: ".scratch/example/workflow.yaml", message: expect.stringContaining("Unreadable") },
  ]);
  expect(staged.workItems).toHaveLength(2);
  expect(staged.workItems[0]).not.toBe(index.workItems[0]);
  expect(staged.workItems[0]).toMatchObject({ stage: "implement", inferred: true });
  expect(staged.workItems[1]).toMatchObject({ stage: "spec", inferred: true });
  expect(resolveStages({ workItems: [], warnings: [] }, files)).toEqual({
    workItems: [],
    warnings: [],
  });
});
