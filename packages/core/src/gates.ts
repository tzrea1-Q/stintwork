// SPDX-License-Identifier: Apache-2.0
import { parseDocument } from "yaml";
import type { GateAttentionItem } from "./attention.js";
import type { ProjectSnapshot } from "./project.js";
import type { StagedWorkItem } from "./stages.js";
import { builtInWorkflows, type StageId } from "./workflows.js";
import { reviewGateConditions } from "./review-evidence.js";

export type GateRecord = { by: string; at: string; commit: string };
export type GateWorkItem = ProjectSnapshot["workItems"][number];

export function gateReadiness(item: GateWorkItem) {
  const stages = builtInWorkflows[item.workflow].stages;
  const position = stages.findIndex(({ id }) => id === item.stage);
  const nextStage = stages[position + 1]?.id;
  const stageStint = item.stints.find((stint) => stint.stage === item.stage);
  let reason: string | null = null;
  if (item.merged) reason = "This work item is shipped.";
  else if (position < 0 || !nextStage) reason = "This stage has no approval gate.";
  else if (item.activeStint || item.stints.some(({ status }) => status === "running"))
    reason = "A stint is running on this work item. Finish or stop it before approving.";
  else if (["implement", "fix", "do"].includes(item.stage ?? "")) {
    if (!item.tickets.every(({ resolved }) => resolved))
      reason = "Every ticket must be resolved before approving.";
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
    if (stageStint?.status !== "finished") reason = "The stage stint must finish before approving.";
    else if (
      evidenceAfter.some((at) => !stageStint.endedAt || Date.parse(stageStint.endedAt) <= at)
    )
      reason =
        item.stage === "review"
          ? "Start a new Review stint after reopening or entering Review."
          : "The stage stint must finish before approving.";
    else if (item.stage !== "review" && !stageStint.handoff)
      reason = "The finished stage stint needs a handoff before approving.";
  }
  const conditions = item.stage === "review" ? reviewGateConditions(item, reason) : [];
  reason ??= conditions.find((condition) => !condition.ready)?.action ?? null;
  return { ready: reason === null, reason, nextStage, stageStint: stageStint ?? null, conditions };
}

export function deriveGateAttentionItems(snapshot: Pick<ProjectSnapshot, "workItems">) {
  return snapshot.workItems.flatMap((item): GateAttentionItem[] => {
    const gate = gateReadiness(item);
    if (!gate.ready || !item.stage) return [];
    const stint = gate.stageStint ?? item.stints[0];
    const name = builtInWorkflows[item.workflow].stages.find(({ id }) => id === item.stage)?.name;
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

export function workflowGate(
  text: string | undefined,
  item: Pick<StagedWorkItem, "workflow" | "stage">,
  stage: StageId,
  action: "approve" | "reopen",
  record: GateRecord,
): string {
  const document = parseDocument(text ?? "");
  if (document.errors.length || document.warnings.length)
    throw new Error("workflow.yaml must be valid before changing a gate.");
  const stages = builtInWorkflows[item.workflow].stages;
  const position = stages.findIndex(({ id }) => id === stage);
  const nextStage = stages[position + 1]?.id;
  if (position < 0 || (action === "approve" && (item.stage !== stage || !nextStage)))
    throw new Error("This stage has no current approval gate.");
  if (text === undefined) document.set("workflow", item.workflow);
  document.set("stage", action === "approve" ? nextStage : stage);
  document.setIn(["stages", stage, action === "approve" ? "approved" : "reopened"], record);
  return document.toString();
}
