// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { assignMilestones, createMemoryRepoFiles, indexWorkItems, parseRoadmap } from "./index.js";

const roadmap = `# Roadmap

## M1 · The board
Id: m1
Status: active          # planned | active | shipped
Target: 2026-10-31      # optional

- board
- some-other-work-item

## M2 · The first stint
Id: m2
Status: planned

- first-stint

## M0 · The prototype
Id: m0
Status: shipped
`;

test("parses milestones with id, status, target and ordered slugs", () => {
  expect(parseRoadmap(roadmap)).toEqual({
    milestones: [
      {
        id: "m1",
        name: "M1 · The board",
        status: "active",
        target: "2026-10-31",
        workItemSlugs: ["board", "some-other-work-item"],
      },
      {
        id: "m2",
        name: "M2 · The first stint",
        status: "planned",
        workItemSlugs: ["first-stint"],
      },
      { id: "m0", name: "M0 · The prototype", status: "shipped", workItemSlugs: [] },
    ],
    warnings: [],
  });
});

test("workflow.yaml milestone wins over the roadmap", () => {
  const files = createMemoryRepoFiles({
    ".scratch/board/spec.md": "# The board",
    ".scratch/some-other-work-item/spec.md": "# Another work item",
    ".scratch/first-stint/spec.md": "# The first stint",
    ".scratch/unassigned/spec.md": "# No milestone",
  });
  const { workItems } = indexWorkItems(files);
  const { milestones } = parseRoadmap(roadmap);
  const items = workItems.map((item) => ({
    slug: item.slug,
    ...(item.slug === "board" ? { declaredMilestone: "m2" } : {}),
  }));
  const { assignments, warnings } = assignMilestones(items, milestones);
  expect(Object.fromEntries(assignments)).toEqual({
    board: "m2",
    "some-other-work-item": "m1",
    "first-stint": "m2",
    unassigned: undefined,
  });
  expect(warnings).toEqual([]);
});

test("warns on roadmap slugs with no work item", () => {
  const { milestones } = parseRoadmap(roadmap);
  const { assignments, warnings } = assignMilestones([{ slug: "board" }], milestones);
  expect([...assignments]).toEqual([["board", "m1"]]);
  expect(warnings).toHaveLength(2);
  expect(warnings[0]).toEqual({
    path: ".stintwork/roadmap.md",
    message: expect.stringContaining('unknown work-item slug "some-other-work-item"'),
  });
  expect(warnings[1].message).toContain('unknown work-item slug "first-stint"');
});

test("missing roadmap yields no milestones and no warning", () => {
  const files = createMemoryRepoFiles({});
  expect(parseRoadmap(files.read(".stintwork/roadmap.md") ?? "")).toEqual({
    milestones: [],
    warnings: [],
  });
});

test("warns on an unknown declared milestone without falling back to the roadmap", () => {
  const { milestones } = parseRoadmap("## Board\nId: m1\nStatus: active\n- board");
  const { assignments, warnings } = assignMilestones(
    [{ slug: "board", declaredMilestone: "missing" }],
    milestones,
  );
  expect(assignments.get("board")).toBe("missing");
  expect(warnings).toEqual([
    {
      path: ".scratch/board/workflow.yaml",
      message: 'Unknown declared milestone id "missing"',
    },
  ]);
});

test("keeps the first roadmap assignment when a work item appears in multiple milestones", () => {
  const { milestones } = parseRoadmap(
    "## First\nId: m1\nStatus: planned\n- board\n## Second\nId: m2\nStatus: active\n- board",
  );
  const items = [{ slug: "board" }];
  const before = structuredClone({ items, milestones });
  const { assignments, warnings } = assignMilestones(items, milestones);
  expect(assignments.get("board")).toBe("m1");
  expect(warnings).toEqual([
    { path: ".stintwork/roadmap.md", message: expect.stringContaining("multiple milestones") },
  ]);
  expect({ items, milestones }).toEqual(before);
});

test("skips malformed milestones and preserves valid ones with per-file warnings", () => {
  const text = `## No id
Status: active
## Bad status
Id: bad
Status: done
## No status
Id: no-status
## 
Id: no-name
Status: planned
## Valid
Id: valid
Status: shipped
- board
`;
  const { milestones, warnings } = parseRoadmap(text, "custom/roadmap.md");
  expect(milestones).toEqual([
    { id: "valid", name: "Valid", status: "shipped", workItemSlugs: ["board"] },
  ]);
  expect(warnings).toHaveLength(4);
  expect(warnings.every((warning) => warning.path === "custom/roadmap.md")).toBe(true);
});

test("normalizes BOM and line endings and keeps metadata inside its own milestone", () => {
  const { milestones, warnings } = parseRoadmap(
    "\uFEFF## First\r\nId: m1\r\nStatus: planned\r\n* board\r\n+ next\r\n## Second\rId: m2\rStatus: active\rTarget: someday",
  );
  expect(milestones.map((milestone) => milestone.workItemSlugs)).toEqual([["board", "next"], []]);
  expect(milestones[0].target).toBeUndefined();
  expect(milestones[1].target).toBe("someday");
  expect(warnings).toEqual([]);
});

test("warns on duplicate milestone ids and empty or duplicate slugs", () => {
  const { milestones, warnings } = parseRoadmap(
    "## First\nId: m1\nStatus: active\n- board\n- board\n- \n## Duplicate\nId: m1\nStatus: shipped",
  );
  expect(milestones).toHaveLength(1);
  expect(milestones[0].workItemSlugs).toEqual(["board"]);
  expect(warnings).toHaveLength(3);
  expect(warnings[2].message).toContain('Duplicate milestone id "m1"');
});

test.each(["Id", "Status", "Target"])("skips a milestone with duplicate %s fields", (field) => {
  const { milestones, warnings } = parseRoadmap(
    `## Ambiguous\nId: m1\nStatus: active\nTarget: someday\n${field}: duplicate`,
  );
  expect(milestones).toEqual([]);
  expect(warnings).toEqual([
    {
      path: ".stintwork/roadmap.md",
      message: expect.stringContaining(`duplicate ${field} fields`),
    },
  ]);
});

test.each(["\0", "\uFFFD", "\u0001"])(
  "warns instead of parsing invalid roadmap text %j",
  (junk) => {
    expect(parseRoadmap(`${roadmap}${junk}`)).toEqual({
      milestones: [],
      warnings: [
        { path: ".stintwork/roadmap.md", message: "Roadmap contains binary or invalid text" },
      ],
    });
  },
);

test("assigns no milestone when neither source provides one", () => {
  expect(assignMilestones([{ slug: "board" }], [])).toEqual({
    assignments: new Map([["board", undefined]]),
    warnings: [],
  });
});
