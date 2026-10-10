import { expect, test } from "vitest";
import {
  briefUnavailableReason,
  compileBrief,
  createMemoryRepoFiles,
  indexProject,
  builtInWorkflows,
} from "./index.js";

const spec = ".scratch/planning/spec.md";
const ticketPath = ".scratch/planning/issues/01-work.md";
const files = createMemoryRepoFiles({
  "AGENTS.md": "Conventions",
  "GLOSSARY.md": "Vocabulary",
  "docs/adr/0001-files.md": "# Files",
  [spec]: "# Planning",
  [ticketPath]: "# Work\nStatus: resolved\nBlocked by: none",
});
const item = indexProject(files, { name: "Project" }).workItems[0];
const handoff = {
  stint: "previous",
  agent: "codex",
  stoppedAt: "Clarified scope.",
  unresolved: "Choose a limit.",
  nextStep: "Write the spec.",
};

test.each(
  Object.values(builtInWorkflows).flatMap((workflow) =>
    workflow.stages
      .filter((stage) => stage.skill)
      .map((stage) => ({ workflow: workflow.id, stage })),
  ),
)(
  "$workflow $stage.name briefs invoke the skill with or without a ticket",
  ({ workflow, stage }) => {
    const implementation = ["implement", "fix"].includes(stage.id);
    for (const ticket of [null, { ...item.tickets[0], resolved: !implementation }]) {
      expect(briefUnavailableReason({ ...item, workflow, stage: stage.id }, ticket)).toBeNull();
      const brief = compileBrief({
        files,
        workItem: item,
        stage,
        ticket,
        lastHandoff: handoff,
        checkpointCommit: "checkpoint",
        changedPaths: [spec],
      });
      expect(brief.skill).toBe(stage.skill);
      expect(brief.prompt).toContain(`${stage.skill} ${ticket?.path ?? ".scratch/planning/"}`);
      if (!ticket || !implementation)
        expect(brief.prompt).toContain("Work item folder: .scratch/planning/");
      expect(brief.pointers).toContainEqual({
        path: spec,
        reason: "Work item scope and acceptance criteria",
      });
      expect(brief.lastHandoff).toEqual(handoff);
      expect(brief.prompt).toContain("Choose a limit.");
      expect(brief.prompt).toContain("Checkpoint commit: checkpoint");
      expect(brief.changedPaths).toEqual([spec]);
      if (ticket && implementation) {
        expect(brief.prompt).toContain(`Finish this ticket only: ${ticket.path}.`);
        expect(brief.prompt).toContain("Update the ticket Status");
      } else {
        expect(brief.prompt).toContain(`Work on the ${stage.name} stage`);
        expect(brief.prompt).toContain("Leave stage gate approval to the developer.");
        expect(brief.prompt).not.toContain("Update the ticket Status");
        expect(brief.prompt).not.toContain("Finish this ticket");
      }
    }
  },
);

test("Clarify without a spec says so and uses project instructions plus the work item folder", () => {
  const brief = compileBrief({
    files: createMemoryRepoFiles({ "AGENTS.md": "Conventions" }),
    workItem: { slug: "planning", spec: null },
    stage: builtInWorkflows.feature.stages[0],
  });
  expect(brief.prompt).toContain("/grill-with-docs .scratch/planning/");
  expect(brief.prompt).toContain("No spec yet.");
  expect(brief.pointers.map(({ path }) => path)).toEqual(["AGENTS.md"]);
  expect(brief.prompt).not.toContain("undefined");
});

test.each(["ship", "do"] as const)("%s cannot start a stage stint without a ticket", (stage) => {
  const workflow = stage === "do" ? "quick" : "feature";
  expect(briefUnavailableReason({ type: "feature", workflow, stage })).not.toBeNull();
});

test("efforts and work items with no declared stage cannot start a stage stint", () => {
  expect(briefUnavailableReason({ type: "effort", stage: "spec" })).not.toBeNull();
  expect(briefUnavailableReason({ type: "feature", stage: undefined })).not.toBeNull();
});
