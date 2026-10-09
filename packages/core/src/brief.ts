import type { StagedWorkItem } from "./stages.js";
import type { RepoFiles, Ticket, WorkItem } from "./work-items.js";
import type { WorkflowStage } from "./workflows.js";

export type BriefPointer = { path: string; reason: string };
export type BriefHandoff = {
  stint: string;
  agent: string;
  stoppedAt: string;
  unresolved: string;
  nextStep: string;
};
export type Brief = {
  skill: string | null;
  pointers: BriefPointer[];
  lastHandoff: BriefHandoff | null;
  changedPaths: string[];
  prompt: string;
};
export type BriefInput = {
  files: RepoFiles;
  workItem: Pick<WorkItem, "slug" | "spec">;
  stage: WorkflowStage;
  ticket: Pick<Ticket, "path">;
  lastHandoff?: BriefHandoff | null;
  changedPaths?: readonly string[];
};

export function briefUnavailableReason(
  workItem: Pick<StagedWorkItem, "type" | "stage">,
  ticket: Pick<Ticket, "resolved" | "blocked" | "blockedBy">,
): string | null {
  if (ticket.resolved) return "This ticket is resolved.";
  if (ticket.blocked) {
    return `Blocked by ticket ${ticket.blockedBy.map((number) => String(number).padStart(2, "0")).join(", ")}.`;
  }
  if (workItem.type === "effort" || !["implement", "fix", "do"].includes(workItem.stage ?? "")) {
    return "Stints are available only in Implement, Fix or Do.";
  }
  return null;
}

export function compileBrief({
  files,
  workItem,
  stage,
  ticket,
  lastHandoff = null,
  changedPaths = [],
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
  addPointer(ticket.path, "This ticket's scope, status, blockers and comments");

  const changed = [...new Set(changedPaths)].sort();
  const handoff = lastHandoff ? { ...lastHandoff } : null;
  const prompt = [
    ...(stage.skill ? [`${stage.skill} ${ticket.path}`] : []),
    ["Read first:", ...pointers.map(({ path, reason }) => `- ${path} — ${reason}`)].join("\n"),
    handoff
      ? `Last handoff (${handoff.stint}, ${handoff.agent}):\n\n### Where it stopped\n${handoff.stoppedAt}\n\n### What is unresolved\n${handoff.unresolved}\n\n### Suggested next step\n${handoff.nextStep}`
      : "Last handoff: none — start from the project conventions and work item scope.",
    [
      "Changed since the last handoff:",
      ...(changed.length ? changed.map((path) => `- ${path}`) : ["- none"]),
      "Where the handoff and the files disagree, the files win.",
    ].join("\n"),
    [
      "Working instructions:",
      `- Work in the work item worktree on its branch, stintwork/${workItem.slug}.`,
      `- Finish this ticket only: ${ticket.path}.`,
      "- Keep the project checks green.",
      "- Update the ticket Status line and append under ## Comments.",
      `- Commit referencing the ticket (${ticket.path}); do not push.`,
      "- Record only checks actually run, with their results.",
    ].join("\n"),
  ].join("\n\n");
  return { skill: stage.skill, pointers, lastHandoff: handoff, changedPaths: changed, prompt };
}
