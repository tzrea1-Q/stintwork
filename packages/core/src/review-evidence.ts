import type { ProjectSnapshot } from "./project.js";
import type { StintSummary } from "./stints.js";

export type EvidenceContext = {
  slug: string;
  headCommit?: string;
  evidenceChangedPaths?: Record<string, string[] | null>;
};

/** Only the latest Review stint supplies current evidence; older stints remain history. */
export function latestReviewStint(stints: readonly StintSummary[], stageId = "review") {
  return stints.find(({ stage }) => stage === stageId) ?? null;
}

/** Unknown comparisons fail closed. Only this work item's bookkeeping is exempt. */
export function evidenceStale(item: EvidenceContext, commit: string): boolean {
  if (!item.headCommit) return true;
  if (item.headCommit === commit) return false;
  const paths = item.evidenceChangedPaths?.[commit];
  return (
    !paths ||
    paths.some(
      (path) =>
        path !== `.scratch/${item.slug}/workflow.yaml` &&
        path !== `.scratch/${item.slug}/review.yaml`,
    )
  );
}

export type ReviewGateCondition = {
  id: "review" | "findings" | "checks" | "freshness" | "memory";
  label: string;
  ready: boolean;
  action: string;
};

export function reviewGateConditions(
  item: ProjectSnapshot["workItems"][number],
  stageReason: string | null,
  stageId = "review",
): ReviewGateCondition[] {
  const report = latestReviewStint(item.stints, stageId)?.findings;
  const checks = (item.checkCommands ?? []).map((command) =>
    item.checks?.find(
      (result) => result.name === command.name && result.command === command.command,
    ),
  );
  return [
    {
      id: "review",
      label: "Latest Review stint finished",
      ready: stageReason === null && report?.findings != null,
      action:
        stageReason ?? "Start a new Review stint to record findings, or explicit no findings.",
    },
    {
      id: "findings",
      label: "Every finding resolved or accepted",
      ready:
        report?.findings?.every((finding) =>
          item.reviewDecisions?.some(
            (decision) =>
              decision.kind === "finding" &&
              decision.id === finding.id &&
              (decision.status === "resolved" || decision.status === "accepted"),
          ),
        ) ?? false,
      action: "Resolve or accept each current finding; sent-back findings need a new Review stint.",
    },
    {
      id: "checks",
      label: "Every configured check passing",
      ready:
        item.checkCommands !== undefined &&
        item.checkExecution?.endedAt !== null &&
        checks.every((result) => result?.status === "passed"),
      action: "Run all configured checks and fix failures before checking again.",
    },
    {
      id: "freshness",
      label: "No stale evidence",
      ready:
        !!item.headCommit &&
        !item.reviewEvidenceError &&
        !!report &&
        !evidenceStale(item, report.commit) &&
        checks.every((result) => !!result && !evidenceStale(item, result.commit)),
      action:
        item.reviewEvidenceError ??
        "Start a new Review stint and rerun checks on the current head.",
    },
    {
      id: "memory",
      label: "No open memory proposals",
      ready: !item.reviewEvidenceError && item.memoryProposals?.length === 0,
      action: "Accept or reject every open memory proposal in Needs you.",
    },
  ];
}
