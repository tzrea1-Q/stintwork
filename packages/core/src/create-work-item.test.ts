// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { parse } from "yaml";
import {
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  deriveWorkItemSlug,
  indexProject,
  indexWorkItems,
  loadWorkflows,
  prepareWorkItemCreation,
} from "./index.js";

test.each([
  ["  Create a Work Item!  ", "create-a-work-item"],
  ["Café déjà vu / UI", "cafe-deja-vu-ui"],
  ["../A__B---C", "a-b-c"],
  ["123", "123"],
  ["a".repeat(49), "a".repeat(48)],
  [`${"a".repeat(47)} next`, "a".repeat(47)],
])("derives an ASCII kebab-case slug for %s", (title, slug) => {
  expect(deriveWorkItemSlug(title)).toBe(slug);
});

test.each([undefined, null, 3, "", "   ", "---", "中文", "🚀", "a\nb", "a\u0000b", "a\u2028b"])(
  "refuses an invalid title %s",
  (title) => {
    expect(() => deriveWorkItemSlug(title)).toThrow();
  },
);

const custom = JSON.stringify({
  id: "team",
  name: "Team",
  defaultAgent: "codex",
  stages: [
    { id: "design", name: "Design", column: "spec", skill: "/design", gate: "manual" },
    { id: "deliver", name: "Deliver", column: "ship", skill: null, gate: "merge" },
  ],
});

test("uses an explicit folder slug while preserving a Chinese-only title", () => {
  const creation = prepareWorkItemCreation(
    { title: "修复登录", slug: "fix-login", workflow: "bug", milestone: "first" },
    builtInWorkflows,
    "## First\nId: first\nStatus: active\n",
  );
  expect(creation.slug).toBe("fix-login");
  expect(parse(creation.workflowText).title).toBe("修复登录");
  expect(creation.roadmapText).toContain("- fix-login\n");
});

test("an explicit slug preserves title whitespace without bypassing title validation", () => {
  expect(
    parse(
      prepareWorkItemCreation(
        { title: " 修复登录 ", slug: "123", workflow: "bug" },
        builtInWorkflows,
        "",
      ).workflowText,
    ).title,
  ).toBe(" 修复登录 ");
  for (const title of ["", " ", "修复\n登录", null])
    expect(() =>
      prepareWorkItemCreation({ title, slug: "fix-login", workflow: "bug" }, builtInWorkflows, ""),
    ).toThrow("Title must be nonempty, single-line text.");
  expect(
    prepareWorkItemCreation(
      { title: "Idea", slug: "a".repeat(48), workflow: "bug" },
      builtInWorkflows,
      "",
    ).slug,
  ).toBe("a".repeat(48));
});

test.each([
  "",
  "Fix-login",
  "fix--login",
  "-login",
  "login-",
  "../login",
  "修复",
  "a".repeat(49),
  " login",
  "login\n",
  null,
  42,
])("refuses invalid explicit folder slug %j rather than deriving a replacement", (slug) => {
  expect(() =>
    prepareWorkItemCreation({ title: "Idea", slug, workflow: "bug" }, builtInWorkflows, ""),
  ).toThrow(
    "Folder name must use lowercase English letters, digits and single hyphens, with at most 48 characters.",
  );
});

test("creates and indexes a workflow-only work item using its loaded first stage and title", () => {
  const contents = { ".stintwork/workflows/team.yaml": custom };
  const workflows = loadWorkflows(createMemoryRepoFiles(contents)).workflows;
  const creation = prepareWorkItemCreation(
    {
      title: "UI: Keep My Title",
      workflow: "team",
      intent: "Use the current look.\nKeep it simple.",
    },
    workflows,
    "",
  );
  const files = createMemoryRepoFiles({
    ...contents,
    [`.scratch/${creation.slug}/workflow.yaml`]: creation.workflowText,
  });
  expect(indexWorkItems(files).workItems).toHaveLength(1);
  const snapshot = indexProject(files, { name: "Fixture" });
  expect(snapshot.workItems[0]).toMatchObject({
    slug: "ui-keep-my-title",
    title: "UI: Keep My Title",
    workflow: "team",
    stage: "design",
    column: "spec",
    inferred: false,
    spec: null,
    tickets: [],
    intent: "Use the current look.\nKeep it simple.",
  });
  expect(snapshot.warnings.filter(({ path }) => path.startsWith(".scratch/"))).toEqual([]);
  expect(creation.roadmapText).toBeUndefined();
});

test("omits optional intent and milestone and retains spec titles when they arrive", () => {
  const creation = prepareWorkItemCreation(
    { title: "New idea", workflow: "feature" },
    builtInWorkflows,
    "bad roadmap",
  );
  expect(parse(creation.workflowText)).toEqual({
    title: "New idea",
    workflow: "feature",
    stage: "clarify",
  });
  expect(creation.roadmapText).toBeUndefined();
  const files = createMemoryRepoFiles({
    ".scratch/new-idea/workflow.yaml": creation.workflowText,
    ".scratch/new-idea/spec.md": "# Agreed title\n",
  });
  expect(indexProject(files, { name: "Fixture" }).workItems[0].title).toBe("Agreed title");
});

test("uses the roadmap serialiser without losing handwritten text", () => {
  const roadmap =
    "Introduction\n\n## First\nId: first\nStatus: active\nOwner: Developer\n\nNotes remain.\n";
  const creation = prepareWorkItemCreation(
    { title: "Idea", workflow: "quick", milestone: "first" },
    builtInWorkflows,
    roadmap,
  );
  expect(creation.roadmapText).toContain("- idea\n");
  expect(creation.roadmapText).toContain("Owner: Developer");
  expect(creation.roadmapText).toContain("Notes remain.");
});

test.each([
  null,
  [],
  {},
  { title: "Idea", workflow: "missing" },
  { title: "Idea", workflow: "__proto__" },
  { title: "Idea", workflow: "feature", intent: 42 },
  { title: "Idea", workflow: "feature", intent: "a\0b" },
  { title: "Idea", workflow: "feature", milestone: false },
  { title: "Idea", workflow: "feature", milestone: "missing" },
])("refuses invalid creation input %j", (input) => {
  expect(() => prepareWorkItemCreation(input, builtInWorkflows, "")).toThrow();
});

test("includes the original intent in every stage's brief, including ticket-scoped briefs", () => {
  const definitions = { ".stintwork/workflows/team.yaml": custom };
  const workflows = loadWorkflows(createMemoryRepoFiles(definitions)).workflows;
  for (const workflow of Object.values(workflows)) {
    const creation = prepareWorkItemCreation(
      {
        title: "Idea",
        workflow: workflow.id,
        intent: "Keep the current look.\nNo new dependencies.",
      },
      workflows,
      "",
    );
    const files = createMemoryRepoFiles({
      ...definitions,
      ".scratch/idea/workflow.yaml": creation.workflowText,
    });
    const workItem = indexProject(files, { name: "Fixture" }).workItems[0];
    for (const stage of workflow.stages) {
      const brief = compileBrief({
        files,
        workItem,
        stage,
        ticket: stage.column === "implement" ? { path: ".scratch/idea/issues/01-build.md" } : null,
      });
      expect(brief.prompt).toContain(
        "What the developer asked for:\nKeep the current look.\nNo new dependencies.",
      );
    }
  }
});

test("invalid workflow intent is warned about rather than included in briefs", () => {
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".scratch/idea/workflow.yaml": "workflow: feature\nstage: clarify\nintent: [bad]\n",
    }),
    { name: "Fixture" },
  );
  expect(snapshot.warnings).toContainEqual(
    expect.objectContaining({ message: expect.stringContaining("Intent must be text") }),
  );
  expect(snapshot.workItems[0].intent).toBeUndefined();
});
