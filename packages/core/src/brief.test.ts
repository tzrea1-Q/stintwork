// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import {
  type BriefInput,
  briefAvailability,
  builtInWorkflows,
  compileBrief,
  createMemoryRepoFiles,
  indexProject,
  stageAgent,
} from "./index.js";

test("brief availability keeps English and typed blockers in one message", () => {
  const workItem = { type: "feature" as const, stage: "implement" };
  const ticket = { resolved: false, blocked: true, blockedBy: [1, 12] };
  expect(briefAvailability(workItem, ticket)).toEqual({
    text: "Blocked by ticket 01, 12.",
    code: "brief.blockedBy",
    params: { tickets: "01, 12" },
  });
  expect(briefAvailability(workItem, ticket)?.text ?? null).toBe("Blocked by ticket 01, 12.");
  expect(briefAvailability(workItem, { ...ticket, resolved: true })).toEqual({
    text: "This ticket is resolved.",
    code: "brief.ticketResolved",
  });
});

test("a shipped work item has no stint brief, even if its stage is edited later", () => {
  expect(
    briefAvailability({
      type: "feature",
      workflow: "feature",
      stage: "review",
      merged: { at: "2026-10-10T10:00:00Z", commit: "a".repeat(40) },
    })?.text ?? null,
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

test("every workflow stage's brief warns agents not to commit secrets or build output", () => {
  for (const workflow of Object.values(builtInWorkflows)) {
    for (const stage of workflow.stages.filter((entry) => entry.gate !== "merge")) {
      const brief = compileBrief({ ...input(), stage });
      expect(brief.prompt).toContain(
        "Do not commit secrets (.env files, keys, credentials) or build output; leave them uncommitted and mention them in the handoff.",
      );
    }
  }
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
    {
      path: "AGENTS.md",
      reason: { text: "Project conventions and agent instructions", code: "brief.conventions" },
    },
    {
      path: "GLOSSARY.md",
      reason: {
        text: "Project vocabulary; use its terms in code and UI copy",
        code: "brief.vocabulary",
      },
    },
    {
      path: "docs/adr/0001-files.md",
      reason: {
        text: "Decision record: Files are the source of truth",
        code: "brief.decision",
        params: { title: "Files are the source of truth" },
      },
    },
    {
      path: "docs/adr/0002-agents.md",
      reason: {
        text: "Decision record: Agents use ACP",
        code: "brief.decision",
        params: { title: "Agents use ACP" },
      },
    },
    {
      path: specPath,
      reason: { text: "Work item scope and acceptance criteria", code: "brief.scope" },
    },
    {
      path: ticketPath,
      reason: {
        text: "This ticket's scope, status, blockers and comments",
        code: "brief.ticketScope",
      },
    },
  ]);
  expect(brief.prompt).toBe(
    `/implement ${ticketPath}\n\nRead first:\n` +
      brief.pointers.map(({ path, reason }) => `- ${path} — ${reason.text}`).join("\n") +
      "\n\nLast handoff: none — start from the project conventions and work item scope." +
      "\n\nChanged since the last handoff:\n- none\nWhere the handoff and the files disagree, the files win." +
      "\n\nWorking instructions:" +
      "\n- Do not commit secrets (.env files, keys, credentials) or build output; leave them uncommitted and mention them in the handoff." +
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

test("every built-in stage declares its skill, with no invocation for Ship", () => {
  const skills = {
    clarify: "/grill-with-docs",
    spec: "/to-spec",
    tickets: "/to-tickets",
    implement: "/implement",
    review: "/code-review",
    ship: null,
    diagnose: "/diagnosing-bugs",
    fix: "/tdd",
    do: "/implement",
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

test.each(["first-stint", "another-item"])(
  "Do briefs implement %s from intent without a spec or tickets",
  (slug) => {
    const files = createMemoryRepoFiles({
      "AGENTS.md": "Project conventions",
      [`.scratch/${slug}/workflow.yaml`]:
        "workflow: quick\nstage: do\nintent: Change the greeting to Hello.\n",
    });
    const workItem = indexProject(files, { name: "Test" }).workItems[0];
    expect(workItem).toMatchObject({ spec: null, tickets: [] });
    expect(briefAvailability(workItem)?.text ?? null).toBeNull();
    const brief = compileBrief({ files, workItem, stage: builtInWorkflows.quick.stages[0] });
    expect(brief.skill).toBe("/implement");
    expect(brief.prompt.split("\n")[0]).toBe(`/implement .scratch/${slug}/`);
    expect(brief.prompt).toContain("What the developer asked for:\nChange the greeting to Hello.");
    expect(brief.prompt).toContain("No spec yet.");
    expect(brief.pointers).toEqual([
      {
        path: "AGENTS.md",
        reason: { text: "Project conventions and agent instructions", code: "brief.conventions" },
      },
    ]);
    expect(brief.prompt).toContain(
      `Work in the work item worktree on its branch, stintwork/${slug}.`,
    );
    expect(brief.prompt).toContain("Work on the Do stage only.");
    expect(brief.prompt).toContain("Leave stage gate approval to the developer.");
    expect(brief.prompt).toContain("Do not create another work item folder.");
    expect(brief.prompt).toContain("Do not push.");
    for (const instruction of [
      "Write the spec to",
      "Write tickets to",
      "Finish this ticket only",
      "Set the ticket's Status",
    ])
      expect(brief.prompt).not.toContain(instruction);
  },
);

test("Do still compiles a ticket-scoped brief when a ticket is selected", () => {
  const brief = compileBrief({ ...input(), stage: builtInWorkflows.quick.stages[0] });
  expect(brief.skill).toBe("/implement");
  expect(brief.prompt.split("\n")[0]).toBe(`/implement ${ticketPath}`);
  expect(brief.prompt).toContain(`Finish this ticket only: ${ticketPath}.`);
  expect(brief.prompt).toContain("Set the ticket's Status line to `resolved`");
  expect(brief.prompt).toContain(`Commit referencing the ticket (${ticketPath}); do not push.`);
});

test.each([
  builtInWorkflows.feature.stages[0],
  builtInWorkflows.feature.stages[1],
  builtInWorkflows.feature.stages[2],
  builtInWorkflows.bug.stages[0],
  builtInWorkflows.quick.stages[0],
])("$name briefs constrain planning output to the existing work item", (stage) => {
  for (const slug of ["first-stint", "another-item"]) {
    const brief = compileBrief({
      ...input(),
      workItem: { slug, spec: null },
      stage,
      ticket: null,
    });
    const specLine = `\n- Write the spec to \`.scratch/${slug}/spec.md\`.`;
    const ticketsLine = `\n- Write tickets to \`.scratch/${slug}/issues/\` as \`NN-<slug>.md\`, numbered from 01 in dependency order, each with \`Status: ready-for-agent\` and a \`Blocked by:\` line.`;
    expect(brief.prompt).toContain("Do not create another work item folder.");
    // Only the stage that owns an output is told to write it.
    if (stage.gate === "spec") expect(brief.prompt).toContain(specLine);
    else expect(brief.prompt).not.toContain("Write the spec to");
    if (stage.gate === "tickets") expect(brief.prompt).toContain(ticketsLine);
    else expect(brief.prompt).not.toContain("Write tickets to");
    if (stage.id === "clarify")
      expect(brief.prompt).toContain("Do not write the spec or tickets; later stages do.");
    expect(brief.prompt).not.toContain("If this stage produces");
  }
});

test.each(["spec", "tickets"] as const)(
  "custom %s gates keep output instructions when their stage name and column change",
  (gate) => {
    const brief = compileBrief({
      ...input(),
      stage: { id: "draft", name: "Draft", column: "implement", skill: "/draft", gate },
      ticket: null,
    });
    expect(brief.prompt).toContain(
      gate === "spec"
        ? `\n- Write the spec to \`${specPath}\``
        : "\n- Write tickets to `.scratch/first-stint/issues/`",
    );
    expect(brief.prompt).toContain("Do not create another work item folder.");
  },
);

test.each(["evidence", "merge"] as const)(
  "custom %s gates never receive planning-write instructions, even in the Clarify column",
  (gate) => {
    const brief = compileBrief({
      ...input(),
      stage: { id: "do", name: "Check", column: "clarify", skill: null, gate },
      ticket: null,
    });
    expect(brief.prompt).not.toContain("Write the spec to");
    expect(brief.prompt).not.toContain("Write tickets to");
  },
);

test("implementation tickets must be unblocked and unresolved; skill stages can use tickets", () => {
  const ticket = { resolved: false, blocked: false, blockedBy: [] };
  for (const stage of ["implement", "fix", "do"] as const) {
    expect(briefAvailability({ type: "feature", stage }, ticket)?.text ?? null).toBeNull();
  }
  expect(
    briefAvailability({ type: "feature", stage: "implement" }, { ...ticket, resolved: true })
      ?.text ?? null,
  ).toBe("This ticket is resolved.");
  expect(
    briefAvailability(
      { type: "feature", stage: "implement" },
      { ...ticket, blocked: true, blockedBy: [1, 3] },
    )?.text ?? null,
  ).toBe("Blocked by ticket 01, 03.");
  for (const stage of ["clarify", "spec", "tickets", "review"] as const)
    expect(briefAvailability({ type: "feature", stage }, ticket)?.text ?? null).toBeNull();
  expect(
    briefAvailability({ type: "feature", stage: "ship" }, ticket)?.text ?? null,
  ).not.toBeNull();
  expect(
    briefAvailability({ type: "feature", stage: undefined }, ticket)?.text ?? null,
  ).not.toBeNull();
  expect(
    briefAvailability({ type: "feature", workflow: "bug", stage: "diagnose" }, ticket)?.text ??
      null,
  ).toBeNull();
  expect(
    briefAvailability({ type: "effort", stage: undefined }, ticket)?.text ?? null,
  ).not.toBeNull();
});
