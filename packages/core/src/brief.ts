import type { StagedWorkItem } from "./stages.js";
import type { RepoFiles, Ticket, WorkItem } from "./work-items.js";
import { builtInWorkflows, type WorkflowStage } from "./workflows.js";
import type { DeveloperNote } from "./developer-notes.js";
import type { PermissionLevel } from "./permission-levels.js";

export type BriefPointer = { path: string; reason: string };
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
  warnings?: readonly string[];
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
  workItem: Pick<WorkItem, "slug" | "spec">;
  stage: WorkflowStage;
  ticket?: Pick<Ticket, "path"> | null;
  lastHandoff?: BriefHandoff | null;
  developerNotes?: readonly DeveloperNote[];
  changedPaths?: readonly string[];
  checkpointCommit?: string | null;
};

export function briefUnavailableReason(
  workItem: Pick<StagedWorkItem, "type" | "stage"> & Partial<Pick<StagedWorkItem, "workflow">>,
  ticket?: Pick<Ticket, "resolved" | "blocked" | "blockedBy"> | null,
): string | null {
  if (workItem.type === "effort" || !workItem.stage) return "This work item has no stint stage.";
  if (!ticket || !["implement", "fix", "do"].includes(workItem.stage)) {
    const stage = builtInWorkflows[workItem.workflow ?? "feature"].stages.find(
      (candidate) => candidate.id === workItem.stage,
    );
    return stage?.skill ? null : "This stage has no stint skill.";
  }
  if (ticket.resolved) return "This ticket is resolved.";
  if (ticket.blocked) {
    return `Blocked by ticket ${ticket.blockedBy.map((number) => String(number).padStart(2, "0")).join(", ")}.`;
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
}: BriefInput): Brief {
  const pointers: BriefPointer[] = [];
  function addPointer(path: string, reason: string) {
    if (files.read(path) !== undefined) pointers.push({ path, reason });
  }
  const conventions = files.read("AGENTS.md") === undefined ? "CLAUDE.md" : "AGENTS.md";
  addPointer(conventions, "Project conventions and agent instructions");
  addPointer("GLOSSARY.md", "Project vocabulary; use its terms in code and UI copy");
  for (const path of [...files.list("docs/adr/")].sort()) {
    const text = files.read(path);
    if (text === undefined) continue;
    const title = /^#\s+(.+?)\s*#*\s*$/m.exec(text)?.[1].trim();
    pointers.push({ path, reason: `Decision record: ${title || path.split("/").at(-1)}` });
  }
  if (workItem.spec) addPointer(workItem.spec.path, "Work item scope and acceptance criteria");
  if (ticket) addPointer(ticket.path, "This ticket's scope, status, blockers and comments");

  const changed = [...new Set(changedPaths)].sort();
  const handoff = lastHandoff ? { ...lastHandoff } : null;
  const ticketScoped = ticket && ["implement", "fix", "do"].includes(stage.id);
  const prompt = [
    ...(stage.skill ? [`${stage.skill} ${ticket?.path ?? `.scratch/${workItem.slug}/`}`] : []),
    ...(!ticketScoped
      ? [
          `Work item folder: .scratch/${workItem.slug}/`,
          ...(!workItem.spec ? ["No spec yet."] : []),
        ]
      : []),
    ["Read first:", ...pointers.map(({ path, reason }) => `- ${path} — ${reason}`)].join("\n"),
    handoff
      ? `Last handoff (${handoff.stint}, ${handoff.agent}):\n\n### Where it stopped\n${handoff.stoppedAt}\n\n### What is unresolved\n${handoff.unresolved}\n\n### Suggested next step\n${handoff.nextStep}`
      : "Last handoff: none — start from the project conventions and work item scope.",
    ...developerNotes.map((note) => `Developer note (${note.at}):\n${note.text}`),
    ...(checkpointCommit ? [`Checkpoint commit: ${checkpointCommit}`] : []),
    [
      "Changed since the last handoff:",
      ...(changed.length ? changed.map((path) => `- ${path}`) : ["- none"]),
      "Where the handoff and the files disagree, the files win.",
    ].join("\n"),
    [
      "Working instructions:",
      `- Work in the work item worktree on its branch, stintwork/${workItem.slug}.`,
      ...(ticketScoped
        ? [
            `- Finish this ticket only: ${ticket.path}.`,
            "- Keep the project checks green.",
            "- Update the ticket Status line and append under ## Comments.",
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
