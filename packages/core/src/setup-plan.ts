// SPDX-License-Identifier: Apache-2.0
import { detectSetup } from "./setup.js";
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
  checkId?: SetupCheckId;
  reasonId?: "localRunData" | "roadmap";
};
export type SetupCheckId = "tracker" | "markdown" | "agents" | "glossary" | "adrs";
export type SetupPlan = {
  changes: SetupChange[];
  warnings: Warning[];
  checks: { id: SetupCheckId; ready: boolean }[];
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
  const plan: SetupPlan = { changes: [], warnings: [...setup.warnings], checks: [] };
  for (const path of setupPaths) {
    try {
      const before = files.read(path) ?? null;
      if (before !== null && /[\p{Cc}\uFFFD]/u.test(before.replace(/[\t\r\n]/g, "")))
        throw new Error("File contains binary or invalid text");
      let content = before;
      if (path === setupPaths[0] && !setup.usesLocalMarkdown) content = tracker;
      if (
        path === "AGENTS.md" &&
        !(before && /^## Agent skills\s*$/m.test(before) && before.includes(setupPaths[0]))
      )
        content = append(before, agentSkills);
      if (path === "CLAUDE.md" && before === null) content = "@AGENTS.md\n";
      if (path === ".gitignore" && !/^\/?\.stintwork\/local\/?\s*$/m.test(before ?? ""))
        content = append(before, ".stintwork/local/\n");
      if (path === ".stintwork/roadmap.md" && before === null)
        content = "# Roadmap\n\n## First milestone\nId: first-milestone\nStatus: planned\n";
      if (content !== before && content !== null) {
        const purpose =
          path === setupPaths[0]
            ? { checkId: setup.hasIssueTracker ? ("markdown" as const) : ("tracker" as const) }
            : path === "AGENTS.md" || path === "CLAUDE.md"
              ? { checkId: "agents" as const }
              : {
                  reasonId:
                    path === ".gitignore" ? ("localRunData" as const) : ("roadmap" as const),
                };
        plan.changes.push({ path, before, content, ...purpose });
      }
    } catch (error) {
      plan.warnings.push({ path, message: `Cannot propose setup: ${String(error)}` });
    }
  }
  plan.checks = [
    { id: "tracker", ready: setup.hasIssueTracker },
    { id: "markdown", ready: setup.usesLocalMarkdown },
    {
      id: "agents",
      ready:
        (setup.hasAgents || setup.hasClaude) &&
        !plan.changes.some(({ checkId }) => checkId === "agents"),
    },
    { id: "glossary", ready: setup.hasGlossary },
    { id: "adrs", ready: setup.hasAdrs },
  ];
  return plan;
}
