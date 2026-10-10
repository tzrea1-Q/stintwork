import type { AttentionItemSource } from "./attention.js";
import type { ReviewDecision } from "./review-decisions.js";
import type { Stint } from "./stints.js";

export type MemoryProposalAttentionItem = AttentionItemSource & {
  kind: "memory-proposal";
  workItem: string;
  stintId: string;
  agent: string;
  path: string;
  diff: string;
  baseCommit: string;
  checkpointCommit: string;
};

export function isProjectMemoryPath(path: string): boolean {
  const parts = path.split("/");
  if (
    path.includes("\\") ||
    path.includes("\0") ||
    parts.some((part) => !part || part === "." || part === "..")
  )
    return false;
  return (
    ["GLOSSARY.md", "AGENTS.md", "CLAUDE.md"].includes(path) ||
    path.startsWith("docs/adr/") ||
    path.startsWith("docs/agents/")
  );
}

export function deriveMemoryProposals(
  stint: Pick<
    Stint,
    | "id"
    | "workItem"
    | "ticket"
    | "agent"
    | "status"
    | "startedAt"
    | "endedAt"
    | "baseCommit"
    | "checkpointCommit"
  >,
  changes: readonly { path: string; diff: string }[],
  decisions: readonly ReviewDecision[] = [],
): MemoryProposalAttentionItem[] {
  if (stint.status === "running" || !stint.checkpointCommit) return [];
  return [...new Map(changes.map((change) => [change.path, change])).values()]
    .filter(({ path }) => isProjectMemoryPath(path))
    .map(
      ({ path, diff }): MemoryProposalAttentionItem => ({
        kind: "memory-proposal",
        id: `memory-proposal:${JSON.stringify([stint.id, path])}`,
        workItem: stint.workItem,
        ticket: stint.ticket,
        stintId: stint.id,
        agent: stint.agent,
        title: `Memory proposal: ${path}`,
        details:
          "Accept this project memory change, or reject it to restore the file to the stint's base commit.",
        raisedAt: stint.endedAt ?? stint.startedAt,
        path,
        diff,
        baseCommit: stint.baseCommit,
        checkpointCommit: stint.checkpointCommit as string,
      }),
    )
    .filter(
      (proposal) =>
        !decisions.some(
          (entry) =>
            entry.kind === proposal.kind && entry.id === proposal.id && entry.status !== "open",
        ),
    );
}
