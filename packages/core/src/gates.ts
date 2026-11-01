// SPDX-License-Identifier: Apache-2.0
import { CoreTextError, coreText, type CoreText } from "./core-text.js";
import { parseDocument } from "yaml";
import type { GateAttentionItem, StaleApprovalAttentionItem } from "./attention.js";
import type { ProjectSnapshot } from "./project.js";
import type { StagedWorkItem } from "./stages.js";
import { builtInWorkflows, type StageId, type WorkflowDefinitions } from "./workflows.js";
import { reviewGateConditions } from "./review-evidence.js";
import { outputGateConditions, type GateCondition } from "./gate-output.js";

export type GateRecord = {
  by: string;
  at: string;
  commit: string;
  remote?: { version: 1 | 2; parentId: string; digest: string };
};
export type GateWorkItem = ProjectSnapshot["workItems"][number];

export function gateReadiness(
  item: GateWorkItem,
  workflows: WorkflowDefinitions = builtInWorkflows,
) {
  const stages = workflows[item.workflow].stages;
  const position = stages.findIndex(({ id }) => id === item.stage);
  const nextStage = stages[position + 1]?.id;
  const stageStint = item.stints.find((stint) => stint.stage === item.stage);
  let reason: CoreText | null = null;
  if (item.merged) reason = coreText({ code: "workItem.shipped" });
  else if (position < 0 || !nextStage || stages[position].gate === "merge")
    reason = coreText({ code: "gate.noApproval" });
  else if (item.github && (!item.github.complete || item.github.stale || !item.github.reviewDigest))
    reason = coreText({ code: "gate.detailUnavailable" });
  else if (
    item.github &&
    stages.slice(0, position).some(({ id }) => {
      const approval = item.stages[id]?.approved;
      return (
        !approval ||
        typeof approval !== "object" ||
        !("remoteState" in approval) ||
        approval.remoteState !== "current"
      );
    })
  )
    reason = coreText({ code: "gate.evidenceChanged" });
  else if (item.activeStint || item.stints.some(({ status }) => status === "running"))
    reason = coreText({ code: "gate.running" });
  else if (
    stages[position].column === "implement" &&
    stages[position].gate === "manual" &&
    (item.tickets.length > 0 || !stages[position].skill)
  ) {
    if (!item.tickets.every(({ resolved }) => resolved))
      reason = coreText({ code: "gate.ticketsUnresolved" });
  } else {
    const evidenceAfter = [
      item.stages[item.stage ?? ""]?.reopened,
      item.stages[stages[position - 1]?.id ?? ""]?.approved,
    ]
      .flatMap((record) =>
        record && typeof record === "object" && "at" in record && typeof record.at === "string"
          ? [Date.parse(record.at)]
          : [],
      )
      .filter(Number.isFinite);
    if (stageStint?.status !== "finished") reason = coreText({ code: "gate.stintUnfinished" });
    else if (
      evidenceAfter.some((at) => !stageStint.endedAt || Date.parse(stageStint.endedAt) <= at)
    )
      reason =
        stages[position].gate === "evidence"
          ? coreText({ code: "gate.reviewRestart" })
          : coreText({ code: "gate.stintUnfinished" });
    else if (stages[position].gate !== "evidence" && !stageStint.handoff)
      reason = coreText({ code: "gate.handoffMissing" });
  }
  const stage = stages[position];
  const conditions: GateCondition[] =
    stage?.gate === "evidence"
      ? reviewGateConditions(item, reason, item.stage)
      : stage && stage.gate !== "merge"
        ? outputGateConditions(item, stage)
        : [];
  reason ??= conditions.find((condition) => !condition.ready)?.action ?? null;
  return {
    ready: reason === null,
    reason,
    nextStage,
    stageStint: stageStint ?? null,
    conditions,
  };
}

export function deriveGateAttentionItems(
  snapshot: Pick<ProjectSnapshot, "workItems"> & Partial<Pick<ProjectSnapshot, "workflows">>,
) {
  return snapshot.workItems.flatMap((item): GateAttentionItem[] => {
    const workflows: WorkflowDefinitions = snapshot.workflows ?? builtInWorkflows;
    const gate = gateReadiness(item, workflows);
    if (!gate.ready || !item.stage) return [];
    const stint = gate.stageStint ?? item.stints[0];
    const name = workflows[item.workflow].stages.find(({ id }) => id === item.stage)?.name;
    return [
      {
        kind: "gate-ready",
        id: `gate-ready:${JSON.stringify([item.slug, item.stage])}`,
        workItem: item.slug,
        stage: item.stage,
        ticket: null,
        stintId: stint?.id ?? null,
        agent: stint?.agent ?? null,
        title: `${name} ready to approve`,
        details: "Review the gate evidence and approve to advance the stage.",
        raisedAt: stint?.endedAt ?? stint?.startedAt ?? "1970-01-01T00:00:00.000Z",
      },
    ];
  });
}

export function deriveStaleApprovalAttentionItems(
  snapshot: Pick<ProjectSnapshot, "workItems"> & Partial<Pick<ProjectSnapshot, "workflows">>,
): StaleApprovalAttentionItem[] {
  const workflows: WorkflowDefinitions = snapshot.workflows ?? builtInWorkflows;
  return snapshot.workItems.flatMap((item) => {
    if (item.merged || item.github) return [];
    const stages = workflows[item.workflow].stages;
    const position = stages.findIndex(({ id }) => id === item.stage);
    if (position < 0) return [];
    return stages.slice(0, position).flatMap(({ id, name }) => {
      const approval = item.stages[id]?.approved;
      if (
        !approval ||
        typeof approval !== "object" ||
        !("state" in approval) ||
        approval.state !== "stale" ||
        !("stateReason" in approval) ||
        approval.stateReason !== "head-changed"
      )
        return [];
      const at = "at" in approval && typeof approval.at === "string" ? approval.at : "";
      const commit =
        "commit" in approval && typeof approval.commit === "string" ? approval.commit : "";
      return [
        {
          kind: "approval-stale" as const,
          id: `approval-stale:${JSON.stringify([item.slug, id, at, commit])}`,
          workItem: item.slug,
          stage: id,
          ticket: null,
          stintId: null,
          agent: null,
          title: `${name} approval is stale`,
          details: `HEAD changed while the approval was recorded. Reopen ${name} to review the newer commits.`,
          raisedAt: Number.isFinite(Date.parse(at)) ? at : "1970-01-01T00:00:00.000Z",
        },
      ];
    });
  });
}

export function workflowGate(
  text: string | undefined,
  item: Pick<StagedWorkItem, "workflow" | "stage">,
  stage: StageId,
  action: "approve" | "reopen",
  record: GateRecord,
  workflows: WorkflowDefinitions = builtInWorkflows,
): string {
  const document = parseDocument(text ?? "");
  if (document.errors.length || document.warnings.length)
    throw new CoreTextError({ code: "gate.validWorkflowRequired" });
  const stages = workflows[item.workflow].stages;
  const position = stages.findIndex(({ id }) => id === stage);
  const nextStage = stages[position + 1]?.id;
  if (position < 0 || (action === "approve" && (item.stage !== stage || !nextStage)))
    throw new CoreTextError({ code: "gate.noCurrentApproval" });
  if (document.get("workflow") !== item.workflow) document.set("workflow", item.workflow);
  document.set("stage", action === "approve" ? nextStage : stage);
  document.setIn(["stages", stage, action === "approve" ? "approved" : "reopened"], record);
  return document.toString();
}
