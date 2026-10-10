import { expect, test } from "vitest";
import { compileBrief } from "./brief.js";
import { pendingDeveloperNotes } from "./developer-notes.js";
import { foldStintLog, isStintLogEntry, type StintLogEntry } from "./stints.js";
import { createMemoryRepoFiles } from "./work-items.js";
import { builtInWorkflows } from "./workflows.js";

const started: Extract<StintLogEntry, { type: "started" }> = {
  type: "started",
  at: "2026-10-09T10:00:00Z",
  stint: {
    id: "previous",
    workItem: "first",
    stage: "implement",
    ticket: 1,
    agent: "codex",
    worktree: { path: "/worktree", branch: "stintwork/first" },
    baseCommit: "base",
    brief: { prompt: "Work", skill: null, pointers: [], changedPaths: [], lastHandoff: null },
  },
};
const ended: StintLogEntry = {
  type: "ended",
  at: "2026-10-09T11:00:00Z",
  status: "finished",
  handoff: {
    stint: "previous",
    agent: "codex",
    stoppedAt: "Export written.",
    unresolved: "Which format?",
    nextStep: "Ask.",
  },
};
const answered: StintLogEntry = {
  type: "handoff_answered",
  at: "2026-10-09T12:00:00Z",
  note: "Use CSV.\nKeep the header.",
};

function stint(entries: StintLogEntry[]) {
  const result = foldStintLog(entries);
  if (!result) throw new Error("Expected a stint");
  return result;
}

test.each([true, false])(
  "a %s ticket-scoped brief puts dated developer notes after the last handoff",
  (ticketScoped) => {
    const previous = stint([started, ended, answered]);
    const developerNotes = pendingDeveloperNotes([previous]);
    const brief = compileBrief({
      files: createMemoryRepoFiles({}),
      workItem: { slug: "first", spec: null },
      stage: builtInWorkflows.feature.stages[ticketScoped ? 3 : 0],
      ticket: ticketScoped ? { path: ".scratch/first/issues/01-first.md" } : null,
      lastHandoff: previous.handoff,
      developerNotes,
    });
    expect(brief.developerNotes).toEqual([
      { id: "previous", at: answered.at, text: "Use CSV.\nKeep the header." },
    ]);
    expect(brief.prompt).toContain(`Developer note (${answered.at}):\nUse CSV.\nKeep the header.`);
    expect(brief.prompt.indexOf("Developer note (")).toBeGreaterThan(
      brief.prompt.indexOf("### Suggested next step"),
    );
    expect(brief.prompt.indexOf("Developer note (")).toBeLessThan(
      brief.prompt.indexOf("Changed since"),
    );
    developerNotes[0].text = "Changed later";
    expect(brief.developerNotes?.[0].text).toBe("Use CSV.\nKeep the header.");
  },
);

test("previews do not consume notes; only persisted started briefs consume the included identities", () => {
  const previous = stint([started, ended, answered]);
  const later = stint([
    { ...started, stint: { ...started.stint, id: "later" } },
    ended,
    { ...answered, at: "2026-10-09T13:00:00Z", note: "Also use UTC." },
  ]);
  const notes = pendingDeveloperNotes([later, previous]);
  expect(notes.map((note) => note.id)).toEqual(["previous", "later"]);
  expect(pendingDeveloperNotes([later, previous])).toEqual(notes);
  const next = stint([
    {
      ...started,
      stint: {
        ...started.stint,
        id: "next",
        brief: { ...started.stint.brief, developerNotes: [notes[0]] },
      },
    },
  ]);
  expect(pendingDeveloperNotes([later, previous, next])).toEqual([notes[1]]);
  const failed = stint([
    {
      ...started,
      stint: {
        ...started.stint,
        id: "next",
        brief: { ...started.stint.brief, developerNotes: notes },
      },
    },
    { type: "ended", at: ended.at, status: "failed" },
  ]);
  expect(pendingDeveloperNotes([later, previous, failed])).toEqual([]);
});

test("dismissals create no note and repeated answers preserve the first recorded answer", () => {
  const previous = stint([started, ended, { ...answered, note: null }, answered]);
  expect(previous.handoffAnswer).toEqual({ at: answered.at, note: null });
  expect(pendingDeveloperNotes([previous])).toEqual([]);
  expect(stint([started, answered]).handoffAnswer).toBeUndefined();
});

test("legacy briefs stay readable and malformed note entries are rejected", () => {
  expect(isStintLogEntry(started)).toBe(true);
  expect(isStintLogEntry(answered)).toBe(true);
  expect(isStintLogEntry({ ...answered, note: " " })).toBe(false);
  expect(isStintLogEntry({ ...answered, note: 42 })).toBe(false);
  expect(isStintLogEntry({ ...answered, at: "not a time" })).toBe(false);
  expect(
    isStintLogEntry({
      ...started,
      stint: {
        ...started.stint,
        brief: {
          ...started.stint.brief,
          developerNotes: [{ id: "previous", at: answered.at, text: 42 }],
        },
      },
    }),
  ).toBe(false);
});

test("review notes share preview and start consumption with developer handoff notes", () => {
  const previous = stint([started, ended, answered]);
  const reviewNote = {
    id: "review:feedback",
    at: "2026-10-09T13:00:00Z",
    source: "review" as const,
    text: "## Review findings\nFrom review: fix validation.",
  };
  const notes = pendingDeveloperNotes([previous], [reviewNote]);
  expect(notes.map((note) => note.id)).toEqual(["previous", "review:feedback"]);
  const brief = compileBrief({
    files: createMemoryRepoFiles({}),
    workItem: { slug: "first", spec: null },
    stage: builtInWorkflows.feature.stages[3],
    developerNotes: notes,
  });
  expect(brief.prompt).toContain(`Review note (${reviewNote.at}):\n## Review findings`);
  expect(pendingDeveloperNotes([previous], [reviewNote])).toEqual(notes);
  const next = stint([{ ...started, stint: { ...started.stint, id: "next", brief } }]);
  expect(isStintLogEntry({ ...started, stint: { ...started.stint, brief } })).toBe(true);
  expect(pendingDeveloperNotes([previous, next], [reviewNote])).toEqual([]);
});
