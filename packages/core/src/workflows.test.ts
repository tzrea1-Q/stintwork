// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { stringify, parse } from "yaml";
import { expect, test } from "vitest";
import {
  briefUnavailableReason,
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  firstStintWorkflow,
  gateReadiness,
  indexProject,
  loadWorkflows,
  parseWorkflowDefinition,
  stageAgent,
  workflowGate,
  workflowMerge,
  type WorkflowDefinition,
} from "./index.js";
import { bundledWorkflowYaml } from "./bundled-workflows.js";

function definition(id = "feature"): WorkflowDefinition {
  return {
    id,
    name: "Team workflow",
    defaultAgent: "claude",
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
      { id: "inspect", name: "Inspect", column: "review", skill: "/code-review", gate: "evidence" },
      { id: "deliver", name: "Deliver", column: "ship", skill: null, gate: "merge" },
    ],
  };
}

function project(workflow: unknown = definition(), id = "feature", stage = "design") {
  return indexProject(
    createMemoryRepoFiles({
      ".stintwork/workflows/team.yaml":
        typeof workflow === "string" ? workflow : stringify(workflow),
      ".scratch/bug-example/spec.md": "# Example",
      ".scratch/bug-example/workflow.yaml": `workflow: ${id}\nstage: ${stage}\n`,
    }),
    { name: "Fixture" },
  );
}

test("bundled YAML is the source of all unchanged built-in workflows", () => {
  expect(Object.keys(builtInWorkflows)).toEqual(["feature", "bug", "quick"]);
  expect(
    Object.values(builtInWorkflows).map(({ name, defaultAgent, stages }) => ({
      name,
      defaultAgent,
      stages: stages.map(({ id, column, skill, gate }) => [id, column, skill, gate]),
    })),
  ).toEqual([
    {
      name: "Feature",
      defaultAgent: "codex",
      stages: [
        ["clarify", "clarify", "/grill-with-docs", "manual"],
        ["spec", "spec", "/to-spec", "spec"],
        ["tickets", "tickets", "/to-tickets", "tickets"],
        ["implement", "implement", "/implement", "manual"],
        ["review", "review", "/code-review", "evidence"],
        ["ship", "ship", null, "merge"],
      ],
    },
    {
      name: "Bug",
      defaultAgent: "codex",
      stages: [
        ["diagnose", "clarify", "/diagnosing-bugs", "manual"],
        ["fix", "implement", "/tdd", "manual"],
        ["review", "review", "/code-review", "evidence"],
        ["ship", "ship", null, "merge"],
      ],
    },
    {
      name: "Quick",
      defaultAgent: "codex",
      stages: [
        ["do", "implement", null, "manual"],
        ["review", "review", "/code-review", "evidence"],
        ["ship", "ship", null, "merge"],
      ],
    },
  ]);
  for (const id of ["feature", "bug", "quick"] as const) {
    const yaml = readFileSync(new URL(`../workflows/${id}.yaml`, import.meta.url), "utf8");
    expect(bundledWorkflowYaml[id]).toBe(yaml);
    expect(builtInWorkflows[id]).toEqual(parseWorkflowDefinition(yaml));
  }
  expect(loadWorkflows(createMemoryRepoFiles({}))).toMatchObject({
    workflows: builtInWorkflows,
    warnings: [],
  });
});

test.each(["feature", "team-release", "constructor", "__proto__"])(
  "loads %s by its declared id, not its filename",
  (id) => {
    const snapshot = project(definition(id), id);
    expect(snapshot.warnings).toEqual([]);
    expect(Object.hasOwn(snapshot.workflows, id)).toBe(true);
    expect(snapshot.workflows[id]).toEqual(definition(id));
    expect(snapshot.workItems[0]).toMatchObject({
      workflow: id,
      stage: "design",
      column: "spec",
      inferred: false,
    });
    expect(builtInWorkflows.feature.name).toBe("Feature");
    const item = snapshot.workItems[0];
    expect(briefUnavailableReason(item, null, snapshot.workflows)).toBeNull();
    expect(
      stageAgent(item, "design", [{ id: "codex" }, { id: "claude" }], snapshot.workflows),
    ).toBe("codex");
    expect(stageAgent(item, "build", [{ id: "codex" }, { id: "claude" }], snapshot.workflows)).toBe(
      "claude",
    );
    expect(
      stageAgent(
        { ...item, stages: { design: { agent: "chosen" } } },
        "design",
        [],
        snapshot.workflows,
      ),
    ).toBe("chosen");
    expect(
      compileBrief({
        files: createMemoryRepoFiles({}),
        workItem: item,
        stage: snapshot.workflows[id].stages[0],
      }).prompt,
    ).toContain("/design .scratch/bug-example/");
    expect(parse(firstStintWorkflow(undefined, id, "design", "claude"))).toMatchObject({
      workflow: id,
      stage: "design",
    });
  },
);

const invalidDefinitions: [string, unknown][] = [
  ["mapping", null],
  ["workflow id", { ...definition(), id: "" }],
  ["workflow name", { ...definition(), name: " " }],
  ["default agent", { ...definition(), defaultAgent: 42 }],
  ["stages mapping", { ...definition(), stages: {} }],
  ["empty stages", { ...definition(), stages: [] }],
  ["stage mapping", { ...definition(), stages: [null] }],
  ["stage id", { ...definition(), stages: [{ ...definition().stages[0], id: "" }] }],
  ["stage name", { ...definition(), stages: [{ ...definition().stages[0], name: "" }] }],
  [
    "duplicate stage ids",
    {
      ...definition(),
      stages: [definition().stages[0], definition().stages[0], definition().stages.at(-1)],
    },
  ],
  ["column", { ...definition(), stages: [{ ...definition().stages[0], column: "later" }] }],
  [
    "non-string column",
    { ...definition(), stages: [{ ...definition().stages[0], column: ["spec"] }] },
  ],
  ["gate", { ...definition(), stages: [{ ...definition().stages[0], gate: "approval" }] }],
  [
    "non-string gate",
    { ...definition(), stages: [{ ...definition().stages[0], gate: ["manual"] }] },
  ],
  ["skill", { ...definition(), stages: [{ ...definition().stages[0], skill: "design" }] }],
  [
    "missing skill",
    "id: feature\nname: Example\ndefaultAgent: codex\nstages: [{id: ship, name: Ship, column: ship, gate: merge}]",
  ],
  ["stage agent", { ...definition(), stages: [{ ...definition().stages[0], agent: "" }] }],
  ["last gate", { ...definition(), stages: [definition().stages[0]] }],
  [
    "last column",
    { ...definition(), stages: [{ ...definition().stages.at(-1), column: "review" }] },
  ],
  ["malformed YAML", "id: feature\nstages: ["],
  ["duplicate YAML keys", "id: feature\nid: bug\n"],
  ["multiple documents", "id: feature\n---\nid: bug"],
  ["YAML warning", "id: feature\nname: !unknown value"],
  ["binary text", "\0invalid"],
];

test.each(invalidDefinitions)(
  "rejects %s with a file warning and the built-in fallback",
  (_label, value) => {
    const snapshot = project(value, "feature", "review");
    expect(snapshot.workflows).toEqual(builtInWorkflows);
    expect(snapshot.warnings).toContainEqual({
      path: ".stintwork/workflows/team.yaml",
      message: expect.stringContaining("falling back"),
    });
    expect(snapshot.workItems[0]).toMatchObject({
      workflow: "feature",
      stage: "review",
      column: "review",
    });
    expect(() =>
      parseWorkflowDefinition(typeof value === "string" ? value : stringify(value)),
    ).toThrow();
  },
);

test("an invalid new workflow falls back to Feature even for a bug-prefixed work item", () => {
  const snapshot = project({ ...definition("team"), stages: [] }, "team");
  expect(snapshot.workflows).not.toHaveProperty("team");
  expect(snapshot.workItems[0]).toMatchObject({
    workflow: "feature",
    stage: "clarify",
    column: "clarify",
  });
  expect(snapshot.warnings).toHaveLength(1);
});

test("malformed or unreadable workflow ids can fall back by their filename", () => {
  for (const text of ["id: [team", "\0invalid"]) {
    const snapshot = indexProject(
      createMemoryRepoFiles({
        ".stintwork/workflows/team.yaml": text,
        ".scratch/bug-example/spec.md": "# Example",
        ".scratch/bug-example/workflow.yaml": "workflow: team\nstage: design\n",
      }),
      { name: "Fixture" },
    );
    expect(snapshot.workItems[0]).toMatchObject({ workflow: "feature", stage: "clarify" });
    expect(snapshot.warnings).toHaveLength(1);
  }
});

test("approving a fallback gate records the effective built-in so Ship can record its merge", () => {
  const snapshot = project({ ...definition("team"), stages: [] }, "team", "implement");
  const item = snapshot.workItems[0];
  const record = { by: "Developer", at: "2026-10-10T10:00:00Z", commit: "a".repeat(40) };
  const advanced = workflowGate(
    "workflow: team\nstage: implement\n",
    item,
    "implement",
    "approve",
    record,
    snapshot.workflows,
  );
  expect(parse(advanced)).toMatchObject({ workflow: "feature", stage: "review" });
  const merged = workflowMerge(
    "workflow: team\nstage: ship\n",
    { at: record.at, commit: record.commit },
    snapshot.workflows,
    item.workflow,
  );
  expect(parse(merged)).toMatchObject({
    workflow: "feature",
    stage: "ship",
    merged: { commit: record.commit },
  });
  expect(
    parse(firstStintWorkflow(undefined, "team", "design", undefined, { team: definition("team") }))
      .stages.design.agent,
  ).toBe("claude");
});

test("invalid overrides fall back to their own built-in, never another valid override", () => {
  for (const id of ["feature", "bug", "quick"] as const) {
    const files = createMemoryRepoFiles({
      ".stintwork/workflows/a-valid.yaml": stringify(definition(id)),
      ".stintwork/workflows/z-invalid.yaml": `id: ${id}\nstages: []\n`,
    });
    expect(loadWorkflows(files).workflows[id]).toEqual(builtInWorkflows[id]);
    const laterValid = loadWorkflows(
      createMemoryRepoFiles({
        ".stintwork/workflows/a-invalid.yaml": `id: ${id}\nstages: []\n`,
        ".stintwork/workflows/z-valid.yaml": stringify(definition(id)),
      }),
    );
    expect(laterValid.workflows[id]).toEqual(definition(id));
    expect(laterValid.fallbackIds).not.toContain(id);
  }
});

test("an evidence gate uses its named stage rather than a hard-coded Review id", () => {
  const snapshot = project(definition("team"), "team", "inspect");
  const item = snapshot.workItems[0];
  item.headCommit = "checkpoint";
  item.riskyPaths = [];
  item.checkCommands = [];
  item.stints = [
    {
      id: "inspect-stint",
      workItem: item.slug,
      stage: "inspect",
      ticket: null,
      agent: "codex",
      status: "finished",
      startedAt: "2026-10-10T09:00:00Z",
      endedAt: "2026-10-10T09:01:00Z",
      checkpointCommit: "checkpoint",
      findings: { commit: "checkpoint", findings: [] },
      handoff: null,
    },
  ];
  expect(gateReadiness(item, snapshot.workflows)).toMatchObject({
    ready: true,
    nextStage: "deliver",
  });
  const brief = compileBrief({
    files: createMemoryRepoFiles({ ".scratch/bug-example/issues/01-first.md": "# First" }),
    workItem: item,
    stage: { ...snapshot.workflows.team.stages[2], skill: "/team-review" },
  });
  expect(brief.pointers).toContainEqual({
    path: ".scratch/bug-example/issues/01-first.md",
    reason: expect.stringContaining("Review against"),
  });
  expect(brief.prompt).toContain("Do not implement fixes");
  expect(brief.prompt).toContain("Review both Standards and Spec with /team-review.");
  expect(brief.prompt).not.toContain("with /code-review.");
});

test("inference uses the override's columns when its stage ids differ", () => {
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".stintwork/workflows/feature.yaml": stringify(definition()),
      ".scratch/example/spec.md": "# Example",
    }),
    { name: "Fixture" },
  );
  expect(snapshot.workItems[0]).toMatchObject({
    workflow: "feature",
    stage: "design",
    column: "spec",
    inferred: true,
  });
});

test("file port errors warn, and only direct YAML files are loaded", () => {
  const files = createMemoryRepoFiles({
    ".stintwork/workflows/ignored.yml": stringify(definition("ignored")),
    ".stintwork/workflows/nested/ignored.yaml": stringify(definition("nested")),
    ".stintwork/workflows/broken.yaml": "",
  });
  const loaded = loadWorkflows({
    ...files,
    read: () => {
      throw new Error("unreadable");
    },
  });
  expect(loaded.workflows).toEqual(builtInWorkflows);
  expect(loaded.warnings).toHaveLength(1);
  expect(loaded.warnings[0].message).toContain("unreadable");
  expect(
    loadWorkflows({
      ...files,
      list: () => {
        throw new Error("unlistable");
      },
    }).warnings[0].message,
  ).toContain("unlistable");
  expect(loadWorkflows({ ...files, read: () => undefined }).warnings[0].message).toContain(
    "missing",
  );
});

test("custom gates advance, reopen and record a merge using the loaded order", () => {
  const snapshot = project(definition("team"), "team", "build");
  const item = snapshot.workItems[0];
  expect(gateReadiness(item, snapshot.workflows)).toMatchObject({
    ready: true,
    nextStage: "inspect",
  });
  const record = { by: "Developer", at: "2026-10-10T10:00:00Z", commit: "a".repeat(40) };
  const approved = workflowGate(undefined, item, "build", "approve", record, snapshot.workflows);
  expect(parse(approved)).toMatchObject({
    workflow: "team",
    stage: "inspect",
    stages: { build: { approved: record } },
  });
  expect(
    parse(
      workflowGate(
        approved,
        { ...item, stage: "inspect" },
        "build",
        "reopen",
        record,
        snapshot.workflows,
      ),
    ).stage,
  ).toBe("build");
  expect(
    parse(
      workflowMerge(
        "workflow: team\nstage: deliver\n",
        { at: record.at, commit: record.commit },
        snapshot.workflows,
      ),
    ).merged.commit,
  ).toBe(record.commit);
  expect(gateReadiness({ ...item, stage: "deliver" }, snapshot.workflows).ready).toBe(false);
});
