// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { createMemoryRepoFiles, detectSetup, type SetupReport } from "./index.js";

const absent: SetupReport = {
  tracker: "missing",
  hasIssueTracker: false,
  usesLocalMarkdown: false,
  hasAgents: false,
  hasClaude: false,
  hasGlossary: false,
  hasAdrs: false,
  warnings: [],
};
const trackerPath = "docs/agents/issue-tracker.md";

test.each([
  [
    "# Issue tracker: GitHub\n\nUse gh issue list and gh issue view to find tickets.\n",
    "github-issues",
  ],
  ["# Issue tracker: GitHub Issues\n\n.scratch/ holds drafts, not tickets.\n", "github-issues"],
  ["Tickets are GitHub Issues; use gh issue create.\n", "github-issues"],
  ["# Issue tracker: Team queue\n\nRead tickets in the team's service.\n", "other"],
  [
    "# Issue tracker: Local Markdown\n\n.scratch/ holds tickets; GitHub Issues is not used.\n",
    "local-markdown",
  ],
])("detects the declared tracker in a fresh guide: %s", (content, tracker) => {
  const report = detectSetup(createMemoryRepoFiles({ [trackerPath]: content }));
  expect(report.tracker).toBe(tracker);
  expect(report.usesLocalMarkdown).toBe(tracker === "local-markdown");
});

test("setup report detects tracker config, AGENTS.md, CLAUDE.md, GLOSSARY.md and ADRs", () => {
  const files = createMemoryRepoFiles({
    [trackerPath]: "# Issue tracker: Local Markdown",
    "AGENTS.md": "",
    "CLAUDE.md": "See AGENTS.md",
    "GLOSSARY.md": "# Project memory",
    "docs/adr/nested/decision.txt": "A decision record",
  });
  expect(detectSetup(files)).toEqual({
    tracker: "local-markdown",
    hasIssueTracker: true,
    usesLocalMarkdown: true,
    hasAgents: true,
    hasClaude: true,
    hasGlossary: true,
    hasAdrs: true,
    warnings: [],
  });
});

test("reports missing setup files without warnings", () => {
  expect(detectSetup(createMemoryRepoFiles({}))).toEqual(absent);
});

test.each(["local markdown", "LOCAL MARKDOWN", "Local\nMarkdown", "Files live in `.scratch/`"])(
  "detects local tracker wording %j",
  (text) => {
    expect(detectSetup(createMemoryRepoFiles({ [trackerPath]: text }))).toEqual({
      ...absent,
      tracker: "local-markdown",
      hasIssueTracker: true,
      usesLocalMarkdown: true,
    });
  },
);

test.each(["", "local markdownish", ".scratchpad"])(
  "keeps tracker presence separate from local Markdown wording %j",
  (text) => {
    expect(detectSetup(createMemoryRepoFiles({ [trackerPath]: text }))).toEqual({
      ...absent,
      tracker: "other",
      hasIssueTracker: true,
    });
  },
);

test("matches exact root files and the ADR directory boundary", () => {
  expect(
    detectSetup(
      createMemoryRepoFiles({
        "nested/AGENTS.md": "",
        "claude.md": "",
        "GLOSSARY.md.bak": "",
        "docs/agents/issue-tracker.md.bak": "local markdown",
        "docs/adr-backup/decision.md": "",
      }),
    ),
  ).toEqual(absent);
  expect(detectSetup(createMemoryRepoFiles({ "AGENTS.md": "" }))).toEqual({
    ...absent,
    hasAgents: true,
  });
  expect(detectSetup(createMemoryRepoFiles({ "CLAUDE.md": "" }))).toEqual({
    ...absent,
    hasClaude: true,
  });
});

test("does not read file contents other than tracker config", () => {
  expect(
    detectSetup({
      list: () => ["AGENTS.md", "CLAUDE.md", "GLOSSARY.md", "docs/adr/decision.md"],
      read: () => {
        throw new Error("Presence detection must not read these files");
      },
    }),
  ).toEqual({ ...absent, hasAgents: true, hasClaude: true, hasGlossary: true, hasAdrs: true });
});

test("reports a listing failure instead of throwing", () => {
  expect(
    detectSetup({
      list: () => {
        throw new Error("cannot list");
      },
      read: () => undefined,
    }),
  ).toEqual({
    ...absent,
    warnings: [{ path: "", message: "Cannot list files: Error: cannot list" }],
  });
});

test("keeps known presence and reports a tracker read failure instead of throwing", () => {
  expect(
    detectSetup({
      list: () => [trackerPath, "AGENTS.md"],
      read: () => {
        throw new Error("cannot read");
      },
    }),
  ).toEqual({
    ...absent,
    tracker: "other",
    hasIssueTracker: true,
    hasAgents: true,
    warnings: [{ path: trackerPath, message: "Cannot read file: Error: cannot read" }],
  });
});

test.each([undefined, "local markdown\0", "local markdown\uFFFD"])(
  "reports missing or invalid tracker contents %j",
  (text) => {
    const report = detectSetup({ list: () => [trackerPath], read: () => text });
    expect(report.hasIssueTracker).toBe(true);
    expect(report.usesLocalMarkdown).toBe(false);
    expect(report.warnings).toEqual([
      {
        path: trackerPath,
        message:
          text === undefined
            ? "File is missing or is not text"
            : "File contains binary or invalid text",
      },
    ]);
  },
);
