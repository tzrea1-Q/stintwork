// SPDX-License-Identifier: Apache-2.0
import { detectSetup } from "./setup.js";
import type { SetupReport } from "./setup.js";
import { unifiedLineDiff } from "./line-diff.js";
import type { RepoFiles, Warning } from "./work-items.js";

export const setupPaths = [
  "docs/agents/issue-tracker.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".gitignore",
  ".stintwork/roadmap.md",
] as const;

export type SetupChange = {
  path: (typeof setupPaths)[number];
  before: string | null;
  content: string;
  removedLines: number;
  selectedByDefault: boolean;
  requires?: (typeof setupPaths)[number];
  checkId?: SetupCheckId;
  reasonId?: "localRunData" | "roadmap";
};
export type SetupCheckId = "tracker" | "agents" | "localRunData" | "roadmap" | "glossary" | "adrs";
export type SetupPlan = {
  tracker: SetupReport["tracker"];
  changes: SetupChange[];
  warnings: Warning[];
  checks: {
    id: SetupCheckId;
    ready: boolean;
    status: "ready" | "needs-change" | "optional" | "other-tracker";
  }[];
};

const tracker = `# Issue tracker: Local Markdown

Issues and specs live as local Markdown in \`.scratch/\`, which is committed.

## Conventions

- One work item per directory: \`.scratch/<work-item>/\`.
- The spec is \`.scratch/<work-item>/spec.md\`.
- Tickets are \`.scratch/<work-item>/issues/NN-<slug>.md\`, numbered from 01 in dependency order.
- Each ticket has a \`Status:\` line and a \`Blocked by:\` line (ticket numbers, or \`none\`).
- A blocker is satisfied when its ticket is \`resolved\`.
- Append comments under \`## Comments\`.

## When a skill says "publish to the issue tracker"

Create the appropriate Markdown file in the work item's directory, never a combined tickets file.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path or ticket number.
`;
const agentSkills = `## Agent skills

### Issue tracker

Issues and specs are local Markdown in \`.scratch/\`. See \`docs/agents/issue-tracker.md\`.
`;

function append(existing: string | null, block: string) {
  return existing ? `${existing}${existing.endsWith("\n") ? "\n" : "\n\n"}${block}` : block;
}

export function planSetup(files: RepoFiles): SetupPlan {
  const setup = detectSetup(files);
  const plan: SetupPlan = {
    tracker: setup.tracker,
    changes: [],
    warnings: [...setup.warnings],
    checks: [],
  };
  const github = setup.tracker === "github-issues";
  const switching = setup.hasIssueTracker && !setup.usesLocalMarkdown && !github;
  let hasPointer = false;
  let hasOtherPointer = false;
  let ignoresLocalRunData = false;
  let hasRoadmap = false;
  for (const path of setupPaths) {
    try {
      const before = files.read(path) ?? null;
      if (before !== null && /[\p{Cc}\uFFFD]/u.test(before.replace(/[\t\r\n]/g, "")))
        throw new Error("File contains binary or invalid text");
      let content = before;
      if (path === setupPaths[0] && !setup.usesLocalMarkdown && !github) content = tracker;
      if (path === "AGENTS.md") {
        hasPointer = before?.includes(setupPaths[0]) ?? false;
        hasOtherPointer =
          !hasPointer &&
          /\b(?:issue|ticket)[ -]tracker\b|\bgithub\s+issues\b|\bgh\s+issue\b/i.test(before ?? "");
        if (!hasPointer && !hasOtherPointer)
          content = append(
            before,
            github
              ? "## Agent skills\n\n### Issue tracker\n\nSee `docs/agents/issue-tracker.md`.\n"
              : agentSkills,
          );
      }
      if (path === "CLAUDE.md" && before === null) content = "@AGENTS.md\n";
      if (path === ".gitignore") {
        ignoresLocalRunData = /^\/?\.stintwork\/local\/?\s*$/m.test(before ?? "");
        if (!ignoresLocalRunData) content = append(before, ".stintwork/local/\n");
      }
      if (path === ".stintwork/roadmap.md") {
        hasRoadmap = before !== null;
        if (!hasRoadmap)
          content = "# Roadmap\n\n## First milestone\nId: first-milestone\nStatus: planned\n";
      }
      if (content !== before && content !== null) {
        const purpose =
          path === setupPaths[0]
            ? { checkId: "tracker" as const }
            : path === "AGENTS.md" || path === "CLAUDE.md"
              ? { checkId: "agents" as const }
              : {
                  reasonId:
                    path === ".gitignore" ? ("localRunData" as const) : ("roadmap" as const),
                };
        const removedLines = unifiedLineDiff(before, content).reduce(
          (count, hunk) => count + hunk.lines.filter(({ kind }) => kind === "removed").length,
          0,
        );
        const requires =
          !setup.usesLocalMarkdown && !github && (path === "AGENTS.md" || path === "CLAUDE.md")
            ? setupPaths[0]
            : undefined;
        plan.changes.push({
          path,
          before,
          content,
          removedLines,
          selectedByDefault: !removedLines && !(switching && (requires || path === setupPaths[0])),
          ...(requires ? { requires } : {}),
          ...purpose,
        });
      }
    } catch (error) {
      plan.warnings.push({ path, message: `Cannot propose setup: ${String(error)}` });
    }
  }
  plan.checks = [
    {
      id: "tracker",
      ready: setup.usesLocalMarkdown,
      status: switching ? "other-tracker" : setup.usesLocalMarkdown ? "ready" : "needs-change",
    },
    {
      id: "agents",
      ready: hasPointer && !plan.changes.some(({ checkId }) => checkId === "agents"),
      status:
        switching || hasOtherPointer
          ? "other-tracker"
          : hasPointer && !plan.changes.some(({ checkId }) => checkId === "agents")
            ? "ready"
            : "needs-change",
    },
    ...(["localRunData", "roadmap"] as const).map((id) => {
      const ready = id === "localRunData" ? ignoresLocalRunData : hasRoadmap;
      return { id, ready, status: ready ? ("ready" as const) : ("optional" as const) };
    }),
    { id: "glossary", ready: setup.hasGlossary, status: setup.hasGlossary ? "ready" : "optional" },
    { id: "adrs", ready: setup.hasAdrs, status: setup.hasAdrs ? "ready" : "optional" },
  ];
  return plan;
}
