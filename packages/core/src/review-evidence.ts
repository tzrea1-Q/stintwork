// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "./project.js";
import type { StintSummary } from "./stints.js";
import type { RiskyPath } from "./stints.js";
import type { ReviewDecision } from "./review-decisions.js";
import { coreTextMessage, type CoreTextMessage } from "./core-text.js";

export function riskyPathAccepted(risk: RiskyPath, decisions: readonly ReviewDecision[] = []) {
  return decisions.some(
    (decision) =>
      decision.kind === "risky-path" &&
      decision.id === risk.path &&
      decision.blob === risk.blob &&
      decision.status === "accepted" &&
      typeof decision.reason === "string" &&
      !!decision.reason.trim(),
  );
}

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
  id: "review" | "findings" | "checks" | "freshness" | "memory" | "risky-paths";
  label: string;
  ready: boolean;
  action: string;
  labelMessage?: CoreTextMessage;
  actionMessage?: CoreTextMessage;
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
  const conditions: ReviewGateCondition[] = [
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
    {
      id: "risky-paths",
      label: "No risky files on the branch",
      ready:
        !item.reviewEvidenceError &&
        item.riskyPaths !== undefined &&
        item.riskyPaths.every((risk) => riskyPathAccepted(risk, item.reviewDecisions)),
      action:
        "Remove risky files in a follow-up commit and add them to .gitignore, or explicitly Accept each path with a reason in Review. If secrets were real, rotate them and clean Git history before publishing.",
    },
  ];
  return conditions.map((condition) => {
    const labelMessage = coreTextMessage(condition.label);
    const actionMessage = coreTextMessage(condition.action);
    return {
      ...condition,
      ...(labelMessage ? { labelMessage } : {}),
      ...(actionMessage ? { actionMessage } : {}),
    };
  });
}
