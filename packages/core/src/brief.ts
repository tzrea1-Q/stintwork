// SPDX-License-Identifier: Apache-2.0
import type { StagedWorkItem } from "./stages.js";
import type { RepoFiles, Ticket, WorkItem } from "./work-items.js";
import { builtInWorkflows, type WorkflowStage, type WorkflowDefinitions } from "./workflows.js";
import type { DeveloperNote } from "./developer-notes.js";
import type { PermissionLevel } from "./permission-levels.js";
import { coreText, type CoreText } from "./core-text.js";

export type BriefPointer = { path: string; reason: CoreText };
export type BriefHandoff = {
  stint: string;
  agent: string;
  stoppedAt: string;
  unresolved: string;
  nextStep: string;
};
export type Brief = {
  permissionLevel?: PermissionLevel;
  agent?: string;
  warnings?: readonly CoreText[];
  skill: string | null;
  pointers: BriefPointer[];
  lastHandoff: BriefHandoff | null;
  developerNotes?: DeveloperNote[];
  changedPaths: string[];
  checkpointCommit?: string | null;
  prompt: string;
};
export type BriefInput = {
  files: RepoFiles;
  workItem: Pick<WorkItem, "slug" | "spec"> & { intent?: string };
  stage: WorkflowStage;
  ticket?: Pick<Ticket, "path"> | null;
  lastHandoff?: BriefHandoff | null;
  developerNotes?: readonly DeveloperNote[];
  changedPaths?: readonly string[];
  checkpointCommit?: string | null;
  reviewRange?: { mergeBase: string; headCommit: string };
};

export function briefAvailability(
  workItem: Pick<StagedWorkItem, "type" | "stage"> &
    Partial<Pick<StagedWorkItem, "workflow" | "merged">>,
  ticket?: Pick<Ticket, "resolved" | "blocked" | "blockedBy"> | null,
  workflows: WorkflowDefinitions = builtInWorkflows,
) {
  if (workItem.merged) return coreText({ code: "workItem.shipped" });
  if (workItem.type === "effort" || !workItem.stage) return coreText({ code: "brief.noStage" });
  const stage = workflows[workItem.workflow ?? "feature"]?.stages.find(
    (candidate) => candidate.id === workItem.stage,
  );
  const implementation =
    stage?.column === "implement" ||
    (workItem.workflow === undefined && ["implement", "fix", "do"].includes(workItem.stage));
  if (!ticket || !implementation) {
    return stage?.skill ? null : coreText({ code: "brief.noSkill" });
  }
  if (ticket.resolved) return coreText({ code: "brief.ticketResolved" });
  if (ticket.blocked) {
    const tickets = ticket.blockedBy.map((number) => String(number).padStart(2, "0")).join(", ");
    return coreText({ code: "brief.blockedBy", params: { tickets } });
  }
  return null;
}

export function compileBrief({
  files,
  workItem,
  stage,
  ticket = null,
  lastHandoff = null,
  developerNotes = [],
  changedPaths = [],
  checkpointCommit = null,
  reviewRange,
}: BriefInput): Brief {
  const pointers: BriefPointer[] = [];
  function addPointer(path: string, reason: CoreText) {
    if (files.read(path) !== undefined) pointers.push({ path, reason });
  }
  const conventions = files.read("AGENTS.md") === undefined ? "CLAUDE.md" : "AGENTS.md";
  addPointer(conventions, coreText({ code: "brief.conventions" }));
  addPointer("GLOSSARY.md", coreText({ code: "brief.vocabulary" }));
  for (const path of [...files.list("docs/adr/")].sort()) {
    const text = files.read(path);
    if (text === undefined) continue;
    const title = /^#\s+(.+?)\s*#*\s*$/m.exec(text)?.[1].trim();
    const decisionTitle = title || path.split("/").at(-1) || "";
    pointers.push({
      path,
      reason: coreText({ code: "brief.decision", params: { title: decisionTitle } }),
    });
  }
  if (workItem.spec) addPointer(workItem.spec.path, coreText({ code: "brief.scope" }));
  if (ticket) addPointer(ticket.path, coreText({ code: "brief.ticketScope" }));
  if (stage.gate === "evidence") {
    for (const path of [...files.list(`.scratch/${workItem.slug}/issues/`)].sort()) {
      if (path.endsWith(".md") && path !== ticket?.path)
        addPointer(path, coreText({ code: "brief.reviewScope" }));
    }
  }

  const changed = [...new Set(changedPaths)].sort();
  const handoff = lastHandoff ? { ...lastHandoff } : null;
  const ticketScoped = ticket && stage.column === "implement";
  const planningOutput =
    stage.gate === "spec" ||
    stage.gate === "tickets" ||
    (stage.gate === "manual" && (stage.column === "clarify" || stage.id === "do"));
  const prompt = [
    ...(stage.skill ? [`${stage.skill} ${ticket?.path ?? `.scratch/${workItem.slug}/`}`] : []),
    ...(workItem.intent?.trim() ? [`What the developer asked for:\n${workItem.intent}`] : []),
    ...(!ticketScoped
      ? [
          `Work item folder: .scratch/${workItem.slug}/`,
          ...(!workItem.spec ? ["No spec yet."] : []),
        ]
      : []),
    ["Read first:", ...pointers.map(({ path, reason }) => `- ${path} — ${reason.text}`)].join("\n"),
    ...(stage.gate === "evidence"
      ? [
          `Review diff range: ${reviewRange ? `${reviewRange.mergeBase}...${reviewRange.headCommit}` : `main...stintwork/${workItem.slug}`} (merge base to reviewed commit).`,
          ...(reviewRange ? [`Reviewed commit: ${reviewRange.headCommit}`] : []),
          `Review both Standards and Spec${stage.skill ? ` with ${stage.skill}` : ""}. Do not implement fixes or change project files. Findings will be requested after the handoff.`,
        ]
      : []),
    handoff
      ? `Last handoff (${handoff.stint}, ${handoff.agent}):\n\n### Where it stopped\n${handoff.stoppedAt}\n\n### What is unresolved\n${handoff.unresolved}\n\n### Suggested next step\n${handoff.nextStep}`
      : "Last handoff: none — start from the project conventions and work item scope.",
    ...developerNotes.map(
      (note) =>
        `${note.source === "review" ? "Review" : "Developer"} note (${note.at}):\n${note.text}`,
    ),
    ...(checkpointCommit ? [`Checkpoint commit: ${checkpointCommit}`] : []),
    [
      "Changed since the last handoff:",
      ...(changed.length ? changed.map((path) => `- ${path}`) : ["- none"]),
      "Where the handoff and the files disagree, the files win.",
    ].join("\n"),
    [
      "Working instructions:",
      "- Do not commit secrets (.env files, keys, credentials) or build output; leave them uncommitted and mention them in the handoff.",
      `- Work in the work item worktree on its branch, stintwork/${workItem.slug}.`,
      ...(planningOutput
        ? [
            // Only the stage that owns an output is told to write it; a real Clarify stint
            // planned to write the spec when every planning stage got conditional lines.
            ...(stage.gate === "spec"
              ? [`- Write the spec to \`.scratch/${workItem.slug}/spec.md\`.`]
              : stage.gate === "tickets"
                ? [
                    `- Write tickets to \`.scratch/${workItem.slug}/issues/\` as \`NN-<slug>.md\`, numbered from 01 in dependency order, each with \`Status: ready-for-agent\` and a \`Blocked by:\` line.`,
                  ]
                : stage.column === "clarify" && stage.id === "clarify"
                  ? [
                      "- Settle open questions; record agreed terms in GLOSSARY.md and decisions in docs/adr/.",
                      "- Do not write the spec or tickets; later stages do.",
                    ]
                  : []),
            "- Do not create another work item folder.",
          ]
        : []),
      ...(ticketScoped
        ? [
            `- Finish this ticket only: ${ticket.path}.`,
            "- Keep the project checks green.",
            "- Set the ticket's Status line to `resolved` when it is done, and append under ## Comments.",
            `- Commit referencing the ticket (${ticket.path}); do not push.`,
          ]
        : [
            `- Work on the ${stage.name} stage${ticket ? ` for ticket ${ticket.path}` : ""} only.`,
            "- Keep the project checks green.",
            "- Leave stage gate approval to the developer.",
            "- Do not push.",
          ]),
      "- Record only checks actually run, with their results.",
    ].join("\n"),
  ].join("\n\n");
  return {
    skill: stage.skill,
    pointers,
    lastHandoff: handoff,
    developerNotes: developerNotes.map((note) => ({ ...note })),
    changedPaths: changed,
    checkpointCommit,
    prompt,
  };
}
