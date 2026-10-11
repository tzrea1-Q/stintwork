// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import {
  type BriefInput,
  briefUnavailableReason,
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  indexProject,
  stageAgent,
} from "./index.js";

test("a shipped work item has no stint brief, even if its stage is edited later", () => {
  expect(
    briefUnavailableReason({
      type: "feature",
      workflow: "feature",
      stage: "review",
      merged: { at: "2026-10-10T10:00:00Z", commit: "a".repeat(40) },
    }),
  ).toBe("This work item is shipped.");
});

test("Review briefs point at every ticket, exact diff range and /code-review, defaulting to Codex", () => {
  const reviewInput = input({
    ...contents,
    ".scratch/first-stint/issues/01-first.md": "# First\nStatus: resolved\nBlocked by: none",
  });
  const brief = compileBrief({
    ...reviewInput,
    stage: builtInWorkflows.feature.stages[4],
    ticket: null,
    reviewRange: { mergeBase: "base", headCommit: "reviewed" },
  });
  expect(brief.skill).toBe("/code-review");
  expect(brief.prompt).toContain("/code-review .scratch/first-stint/");
  expect(brief.prompt).toContain("Review diff range: base...reviewed");
  expect(brief.prompt).toContain("Reviewed commit: reviewed");
  expect(brief.prompt).toContain("Do not implement fixes");
  expect(brief.pointers.map((pointer) => pointer.path)).toEqual(
    expect.arrayContaining([specPath, ticketPath, ".scratch/first-stint/issues/01-first.md"]),
  );
  for (const workflow of ["feature", "bug", "quick"] as const)
    expect(
      stageAgent({ workflow, stages: {} }, "review", [{ id: "claude" }, { id: "codex" }]),
    ).toBe("codex");
  expect(
    stageAgent({ workflow: "feature", stages: { review: { agent: "claude" } } }, "review", [
      { id: "codex" },
      { id: "claude" },
    ]),
  ).toBe("claude");
});

const ticketPath = ".scratch/first-stint/issues/02-brief-preview.md";
const specPath = ".scratch/first-stint/spec.md";
const contents = {
  "AGENTS.md": "Project conventions",
  "CLAUDE.md": "Fallback conventions",
  "GLOSSARY.md": "Project terms",
  "docs/adr/0002-agents.md": "# Agents use ACP\n\nA decision.",
  "docs/adr/0001-files.md": "# Files are the source of truth\n\nA decision.",
  [specPath]: "# The first stint",
  [ticketPath]: "# 02 — Brief preview\nStatus: ready-for-agent\nBlocked by: none",
};

function input(files: Record<string, string> = contents): BriefInput {
  const repoFiles = createMemoryRepoFiles(files);
  const workItem = indexProject(repoFiles, { name: "Stintwork" }).workItems[0];
  return {
    files: repoFiles,
    workItem,
    stage: builtInWorkflows.feature.stages[3],
    ticket: workItem.tickets[0],
  };
}

test("compiles real file pointers with reasons and the validated prompt order", () => {
  const brief = compileBrief(input());
  expect(brief.skill).toBe("/implement");
  expect(brief.pointers).toEqual([
    { path: "AGENTS.md", reason: "Project conventions and agent instructions" },
    { path: "GLOSSARY.md", reason: "Project vocabulary; use its terms in code and UI copy" },
    { path: "docs/adr/0001-files.md", reason: "Decision record: Files are the source of truth" },
    { path: "docs/adr/0002-agents.md", reason: "Decision record: Agents use ACP" },
    { path: specPath, reason: "Work item scope and acceptance criteria" },
    { path: ticketPath, reason: "This ticket's scope, status, blockers and comments" },
  ]);
  expect(brief.prompt).toBe(
    `/implement ${ticketPath}\n\nRead first:\n` +
      brief.pointers.map(({ path, reason }) => `- ${path} — ${reason}`).join("\n") +
      "\n\nLast handoff: none — start from the project conventions and work item scope." +
      "\n\nChanged since the last handoff:\n- none\nWhere the handoff and the files disagree, the files win." +
      "\n\nWorking instructions:" +
      "\n- Work in the work item worktree on its branch, stintwork/first-stint." +
      `\n- Finish this ticket only: ${ticketPath}.` +
      "\n- Keep the project checks green." +
      "\n- Set the ticket's Status line to `resolved` when it is done, and append under ## Comments." +
      `\n- Commit referencing the ticket (${ticketPath}); do not push.` +
      "\n- Record only checks actually run, with their results.",
  );
  expect(brief.lastHandoff).toBeNull();
  expect(brief.changedPaths).toEqual([]);
  expect(compileBrief(input())).toEqual(brief);
});

test("includes only existing pointers and uses CLAUDE.md only without AGENTS.md", () => {
  const { "AGENTS.md": _agents, "GLOSSARY.md": _glossary, ...fallback } = contents;
  const brief = compileBrief(input(fallback));
  expect(brief.pointers.map((pointer) => pointer.path)).toEqual([
    "CLAUDE.md",
    "docs/adr/0001-files.md",
    "docs/adr/0002-agents.md",
    specPath,
    ticketPath,
  ]);
  const original = input();
  const missing = compileBrief({ ...original, files: createMemoryRepoFiles({}) });
  expect(missing.pointers).toEqual([]);
  expect(compileBrief(input({ ...contents, "AGENTS.md": "" })).pointers[0].path).toBe("AGENTS.md");
});

test("renders the last handoff and changed paths without letting stale advice override files", () => {
  const lastHandoff = {
    stint: "stint-001",
    agent: "Codex",
    stoppedAt: "The compiler is ready.",
    unresolved: "The sheet needs tests.",
    nextStep: "Build the sheet.",
  };
  const changedPaths = [ticketPath, specPath, ticketPath];
  const brief = compileBrief({ ...input(), lastHandoff, changedPaths });
  expect(brief.lastHandoff).toEqual(lastHandoff);
  expect(brief.prompt).toContain(
    "Last handoff (stint-001, Codex):\n\n### Where it stopped\nThe compiler is ready.\n\n### What is unresolved\nThe sheet needs tests.\n\n### Suggested next step\nBuild the sheet.",
  );
  expect(brief.prompt).toContain(
    `Changed since the last handoff:\n- ${ticketPath}\n- ${specPath}\nWhere the handoff and the files disagree, the files win.`,
  );
  const headings = [
    "/implement",
    "Read first:",
    "Last handoff (",
    "Changed since the last handoff:",
    "Working instructions:",
  ].map((heading) => brief.prompt.indexOf(heading));
  expect(headings).toEqual([...headings].sort((left, right) => left - right));
  lastHandoff.nextStep = "Changed later";
  changedPaths.push("later.md");
  expect(brief.lastHandoff?.nextStep).toBe("Build the sheet.");
  expect(brief.changedPaths).not.toContain("later.md");
});

test("resume briefs carry the checkpoint even when the last stint gave no handoff", () => {
  const brief = compileBrief({
    ...input(),
    checkpointCommit: "checkpoint",
    changedPaths: [specPath],
  });
  expect(brief.checkpointCommit).toBe("checkpoint");
  expect(brief.prompt).toContain("Checkpoint commit: checkpoint");
  expect(brief.lastHandoff).toBeNull();
  expect(brief.changedPaths).toEqual([specPath]);
});

test("every built-in stage declares its skill, with no invocation for Ship or Do", () => {
  const skills = {
    clarify: "/grill-with-docs",
    spec: "/to-spec",
    tickets: "/to-tickets",
    implement: "/implement",
    review: "/code-review",
    ship: null,
    diagnose: "/diagnosing-bugs",
    fix: "/tdd",
    do: null,
  };
  for (const workflow of Object.values(builtInWorkflows)) {
    for (const stage of workflow.stages) {
      expect(stage.skill).toBe(skills[stage.id]);
      const brief = compileBrief({ ...input(), stage });
      if (stage.skill) expect(brief.prompt.split("\n")[0]).toBe(`${stage.skill} ${ticketPath}`);
      else expect(brief.prompt).not.toMatch(/^\//);
    }
  }
});

test("implementation tickets must be unblocked and unresolved; skill stages can use tickets", () => {
  const ticket = { resolved: false, blocked: false, blockedBy: [] };
  for (const stage of ["implement", "fix", "do"] as const) {
    expect(briefUnavailableReason({ type: "feature", stage }, ticket)).toBeNull();
  }
  expect(
    briefUnavailableReason({ type: "feature", stage: "implement" }, { ...ticket, resolved: true }),
  ).toBe("This ticket is resolved.");
  expect(
    briefUnavailableReason(
      { type: "feature", stage: "implement" },
      { ...ticket, blocked: true, blockedBy: [1, 3] },
    ),
  ).toBe("Blocked by ticket 01, 03.");
  for (const stage of ["clarify", "spec", "tickets", "review"] as const)
    expect(briefUnavailableReason({ type: "feature", stage }, ticket)).toBeNull();
  expect(briefUnavailableReason({ type: "feature", stage: "ship" }, ticket)).not.toBeNull();
  expect(briefUnavailableReason({ type: "feature", stage: undefined }, ticket)).not.toBeNull();
  expect(
    briefUnavailableReason({ type: "feature", workflow: "bug", stage: "diagnose" }, ticket),
  ).toBeNull();
  expect(briefUnavailableReason({ type: "effort", stage: undefined }, ticket)).not.toBeNull();
});
