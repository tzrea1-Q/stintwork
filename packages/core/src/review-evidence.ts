// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "./project.js";
import type { StintSummary, RiskyPath } from "./stints.js";

import type { ReviewDecision } from "./review-decisions.js";
import { coreText, type CoreText } from "./core-text.js";

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
  github?: { repository: string; number: number };
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
        path !== `.scratch/${item.slug}/review.yaml` &&
        (!item.github ||
          path !==
            `.stintwork/github/${item.github.repository.toLowerCase()}/${item.github.number}/workflow.yaml`),
    )
  );
}

export type ReviewGateCondition = {
  id: "review" | "findings" | "checks" | "freshness" | "memory" | "risky-paths";
  label: CoreText;
  ready: boolean;
  action: CoreText;
};

export function reviewGateConditions(
  item: ProjectSnapshot["workItems"][number],
  stageReason: CoreText | null,
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
      label: coreText({ code: "gate.reviewFinished" }),
      ready: stageReason === null && report?.findings != null,
      action: stageReason ?? coreText({ code: "gate.recordFindings" }),
    },
    {
      id: "findings",
      label: coreText({ code: "gate.findingsDecided" }),
      ready:
        report?.findings?.every((finding) =>
          item.reviewDecisions?.some(
            (decision) =>
              decision.kind === "finding" &&
              decision.id === finding.id &&
              (decision.status === "resolved" || decision.status === "accepted"),
          ),
        ) ?? false,
      action: coreText({ code: "gate.decideFindings" }),
    },
    {
      id: "checks",
      label: coreText({ code: "gate.checksPassing" }),
      ready:
        item.checkCommands !== undefined &&
        item.checkExecution?.endedAt !== null &&
        checks.every((result) => result?.status === "passed"),
      action: coreText({ code: "gate.runChecks" }),
    },
    {
      id: "freshness",
      label: coreText({ code: "gate.evidenceFresh" }),
      ready:
        !!item.headCommit &&
        !item.reviewEvidenceError &&
        !!report &&
        !evidenceStale(item, report.commit) &&
        checks.every((result) => !!result && !evidenceStale(item, result.commit)),
      action:
        (item.reviewEvidenceError ? { text: item.reviewEvidenceError } : null) ??
        coreText({ code: "gate.refreshEvidence" }),
    },
    {
      id: "memory",
      label: coreText({ code: "gate.memoryDecided" }),
      ready: !item.reviewEvidenceError && item.memoryProposals?.length === 0,
      action: coreText({ code: "gate.decideMemory" }),
    },
    {
      id: "risky-paths",
      label: coreText({ code: "gate.riskyPathsHandled" }),
      ready:
        !item.reviewEvidenceError &&
        item.riskyPaths !== undefined &&
        item.riskyPaths.every((risk) => riskyPathAccepted(risk, item.reviewDecisions)),
      action: coreText({ code: "gate.handleRiskyPaths" }),
    },
  ];
  return conditions;
}
